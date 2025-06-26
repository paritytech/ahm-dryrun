import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { PalletSchedulerScheduled, PalletSchedulerRetryConfig } from '@polkadot/types/lookup';
import type { Option } from '@polkadot/types/codec';
import type { Vec } from '@polkadot/types/codec';
import { ApiDecoration } from '@polkadot/api/types';
import type { Bytes } from '@polkadot/types/primitive';
import type { ITuple } from '@polkadot/types/types';
import type { u32 } from '@polkadot/types/primitive';
import type { StorageKey } from '@polkadot/types/primitive';
import type { H256 } from '@polkadot/types/interfaces';
import type { Codec } from '@polkadot/types/types';

type AgendaEntry = [
    blockNumber: number,
    tasks: Vec<Option<PalletSchedulerScheduled>>,
    callEncodings: (Bytes | null)[]
];

async function getTaskCallEncodings(
    api: ApiDecoration<'promise'>,
    tasks: Vec<Option<PalletSchedulerScheduled>>
): Promise<(Bytes | null)[]> {
    // Convert based on Schedules existence and call type
    return Promise.all(
        tasks.map(async (maybeSchedule) => {
            if (!maybeSchedule.isSome) {
                return null;
            }

            // 1 - inline, 4 lookups. All lookups have empty preimage, however hash and len are not empty.
            const call = maybeSchedule.unwrap().call;
            if (call.isInline) {
                return call.asInline;
            } else if (call.isLookup) {
                const { hash, len } = call.asLookup;
                try {
                    const preimage = await api.query.preimage.preimageFor(
                        [hash, len] as ITuple<[H256, u32]>
                    ) as unknown as Option<Bytes>;
                    return preimage.isSome ? preimage.unwrap() : null;
                } catch {
                    return null;
                }
            } else if (call.isLegacy) {
                const { hash } = call.asLegacy;
                try {
                    const preimage = await api.query.preimage.preimageFor(hash) as unknown as Option<Bytes>;
                    return preimage.isSome ? preimage.unwrap() : null;
                } catch {
                    return null;
                }
            }
            return null;
        })
    );
}

export const schedulerTests: MigrationTest = {
    name: 'scheduler_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        async function check_ah(api: ApiDecoration<'promise'>) {
            const incompleteSince = await api.query.scheduler.incompleteSince() as unknown as Option<u32>;
            assert(
                incompleteSince.isNone,
                'IncompleteSince should be empty on asset hub before migration'
            );

            const agendaEntries = await api.query.scheduler.agenda.entries();
            assert(
                agendaEntries.length === 0,
                'Agenda map should be empty on asset hub before migration'
            );

            const lookupEntries = await api.query.scheduler.lookup.entries();
            assert(
                lookupEntries.length === 0,
                'Lookup map should be empty on asset hub before migration'
            );

            const retriesEntries = await api.query.scheduler.retries.entries();
            assert(
                retriesEntries.length === 0,
                'Retries map should be empty on asset hub before migration'
            );
        }

        async function collect_rc(api: ApiDecoration<'promise'>) {
            const incompleteSince = await api.query.scheduler.incompleteSince() as unknown as Option<u32>;
            const retries = await api.query.scheduler.retries.entries();        
            const lookup = await api.query.scheduler.lookup.entries();
            
            // For Westend there are 5 agenda entries, each agenda has 1 task.
            // Among those 5 tasks, 4 are lookups and 1 is inline.
            // 
            // Inline is encoded properly. 
            // All lookups don't have pre_images so they are converted to null. Later on agendas with null encodings are filtered out.
            //
            // All lookups have empty preimage, however hash and len are not empty.
            // `ah_post` state contains 3 agenda entries, 1 is lookup, 2 are new system events.
            const agenda_entries = await api.query.scheduler.agenda.entries();
            const agenda_and_call_encodings = await Promise.all(
                agenda_entries.map(async ([key, tasks]): Promise<AgendaEntry> => {
                    const blockNumber = (key.args[0] as any).toNumber();
                    return [
                        blockNumber,
                        tasks as unknown as Vec<Option<PalletSchedulerScheduled>>,
                        (await getTaskCallEncodings(api, tasks as unknown as Vec<Option<PalletSchedulerScheduled>>))
                    ];
                })
            );

            return {
                incompleteSince,
                agenda_and_call_encodings: agenda_and_call_encodings,
                retries,
                lookup
            };
        }

        await check_ah(ah_api_before);
        return {
            rc_pre_payload: await collect_rc(rc_api_before),
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;

        async function check_rc(api: ApiDecoration<'promise'>) {
            const incompleteSinceAfter = await api.query.scheduler.incompleteSince() as unknown as Option<u32>;
            assert(
                incompleteSinceAfter.isNone,
                'IncompleteSince should be None on RC after migration'
            );

            const agendaEntriesAfter = await api.query.scheduler.agenda.entries();
            assert(
                agendaEntriesAfter.length === 0,
                'Agenda map should be empty on RC after migration'
            );

            const retriesAfter = await api.query.scheduler.retries.entries();
            assert(
                retriesAfter.length === 0,
                'Retries map should be empty on RC after migration'
            );

            const lookupAfter = await api.query.scheduler.lookup.entries();
            assert(
                lookupAfter.length === 0,
                'Lookup map should be empty on RC after migration'
            );
        }

        async function check_ah(api: ApiDecoration<'promise'>, rc_payload: PreCheckResult['rc_pre_payload']) {
            // Check IncompleteSince
            const incompleteSinceAfter = await api.query.scheduler.incompleteSince() as unknown as Option<u32>;
            assert.deepEqual(
                incompleteSinceAfter.toJSON(),
                rc_payload.incompleteSince.toJSON(),
                'IncompleteSince on Asset Hub should match the RC value'
            );

            // Check Lookup
            const ahLookupEntries = await api.query.scheduler.lookup.entries();
            assert.equal(
                ahLookupEntries.length,
                rc_payload.lookup.length,
                'Lookup map length on Asset Hub should match the RC value'
            );
            assert.deepEqual(
                ahLookupEntries.map(([key, value]: any) => [key.toJSON(), value.toJSON()]),
                rc_payload.lookup.map(([key, value]: any) => [key.toJSON(), value.toJSON()]),
                'Lookup map value on Asset Hub should match the RC value'
            );

            // Check Retries
            const ahRetriesEntries = await api.query.scheduler.retries.entries();
            assert.equal(
                ahRetriesEntries.length,
                rc_payload.retries.length,
                'Retries map length on Asset Hub should match the RC value'
            );
            assert.deepEqual(
                ahRetriesEntries.map(([key, value]: any) => [key.toJSON(), value.toJSON()]),
                rc_payload.retries.map(([key, value]: any) => [key.toJSON(), value.toJSON()]),
                'Retries map value on Asset Hub should match the RC value'
            );
            
            // Mirror the agenda conversion from RC to AH
            const expected_ah_agenda = rc_payload.agenda_and_call_encodings
                .map(([blockNumber, rcTasks, rcTaskCallEncodings]: AgendaEntry) => {
                    if (rcTasks.length !== rcTaskCallEncodings.length) {
                        return null;
                    }
                    
                    const ahTasks: PalletSchedulerScheduled[] = [];
                    // Iterate over task and its corresponding encoded call
                    for (let i = 0; i < rcTasks.length; i++) {
                        const rcTask = rcTasks[i];
                        const encodedCall = rcTaskCallEncodings[i];

                        // Skip if no scheduled task for block number
                        if (!rcTask) {
                            console.log(`Task for block number ${blockNumber} didn't come through.`);
                            continue;
                        }

                        // Skip if call for scheduled task didn't come through
                        if (!encodedCall) {
                            console.log(`Call for task scheduled at block number ${blockNumber} didn't come through.`);
                            continue;
                        }
                    
                        console.log('unwrapped origin is ', rcTask.unwrap().origin.type);
                        // Build new task
                        const ahTask = api.registry.createType('PalletSchedulerScheduled', {
                            maybeId: rcTask.unwrap().maybeId.toJSON(),
                            priority: rcTask.unwrap().priority.toNumber(),
                            // TODO: This had a separate conversion logic, I tried to replace it with JSON conversion, might work.
                            origin: rcTask.unwrap().origin.type,
                            // TODO: This had a separate conversion logic too. For sure won't work, needs proper conversion.
                            call: {
                                Inline: encodedCall
                            },
                            maybePeriodic: rcTask.unwrap().maybePeriodic.toJSON(),
                        });

                        ahTasks.push(ahTask as unknown as PalletSchedulerScheduled);
                    }

                    // Filter out blocks that end up with no valid tasks after conversion
                    if (ahTasks.length > 0) {
                        return [blockNumber, ahTasks];
                    }
                    return null;
                })
                .filter((entry: [number, PalletSchedulerScheduled[]] | null) => 
                    entry !== null
                );
                
                

            const ah_agenda_entries = await api.query.scheduler.agenda.entries();
            const ah_agenda = ah_agenda_entries.map(([key, tasks]) => [
                (key.args[0] as any).toNumber(),
                tasks.toJSON()
            ]);

            // Check length
            assert.equal(
                ah_agenda.length,
                expected_ah_agenda.length,
                'Agenda map length on Asset Hub should match converted RC value'
            );

            // // Check values
            // assert.deepEqual(
            //     ahAgenda,
            //     expectedAhAgenda.map(([bn, tasks]) => [bn, tasks.map(t => t.toJSON())]),
            //     'Agenda map value on Asset Hub should match the converted RC value'
            // );
        }

        await check_rc(rc_api_after);
        await check_ah(ah_api_after, pre_payload.rc_pre_payload);
    }
};
