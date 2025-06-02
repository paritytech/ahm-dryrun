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

            const call = maybeSchedule.unwrap().call;
            if (call.isInline) {
                return call.asInline;
            } else if (call.isLookup) {
                const { hash, len } = call.asLookup;
                try {
                    const preimage = await api.query.preimage.preimageFor([hash, len]) as Option<any>;
                    return preimage.isSome ? preimage.unwrap() : null;
                } catch {
                    return null;
                }
            } else if (call.isLegacy) {
                const { hash } = call.asLegacy;
                try {
                    const preimage = await api.query.preimage.preimageFor([hash, null]) as Option<any>;
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
            const incompleteSince = await api.query.scheduler.incompleteSince();
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
            const incompleteSince = await api.query.scheduler.incompleteSince();
            const retries = await api.query.scheduler.retries.entries();        
            const lookup = await api.query.scheduler.lookup.entries();
            
            const rawAgendaEntries = await api.query.scheduler.agenda.entries();
            const agendaEntriesWithEncodings = await Promise.all(
                rawAgendaEntries.map(async ([key, tasks]) => {
                    const blockNumber = key.args[0].toNumber();
                    return [
                        blockNumber,
                        tasks.toJSON(),
                        await getTaskCallEncodings(api, tasks)
                    ];
                })
            );

            return {
                incompleteSince,
                agendaEntries: agendaEntriesWithEncodings,
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
            const incompleteSinceAfter = await api.query.scheduler.incompleteSince();
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
            const incompleteSinceAfter = await api.query.scheduler.incompleteSince();
            assert.deepEqual(
                incompleteSinceAfter.toJSON(),
                rc_payload.incompleteSince.toJSON(),
                'IncompleteSince on Asset Hub should match the RC value'
            );

            // Collect and check Agenda
            // const ahAgendaEntries = await api.query.scheduler.agenda.entries();
            // const ahAgenda = ahAgendaEntries.map(([key, tasks]) => [
            //     key.args[0].toNumber(),
            //     tasks.toJSON()
            // ]);

            // assert.equal(
            //     ahAgenda.length,
            //     rc_payload.agendaEntries.length,
            //     'Agenda map length on Asset Hub should match converted RC value'
            // );

            // ahAgenda.sort(([a], [b]) => Number(a) - Number(b));
            // rc_payload.agendaEntries.sort(([a], [b]) => Number(a) - Number(b));

            // assert.deepEqual(
            //     ahAgenda,
            //     expectedAhAgenda,
            //     'Agenda map value on Asset Hub should match the converted RC value'
            // );

            // Check Lookup
            const ahLookupEntries = await api.query.scheduler.lookup.entries();
            assert.equal(
                ahLookupEntries.length,
                rc_payload.lookup.length,
                'Lookup map length on Asset Hub should match the RC value'
            );
            assert.deepEqual(
                ahLookupEntries.map(([key, value]: [StorageKey, Option<ITuple<[u32, u32]>>]) => [key.toJSON(), value.toJSON()]),
                rc_payload.lookup.map(([key, value]: [StorageKey, Option<ITuple<[u32, u32]>>]) => [key.toJSON(), value.toJSON()]),
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
                ahRetriesEntries.map(([key, value]: [StorageKey, Option<PalletSchedulerRetryConfig>]) => [key.toJSON(), value.toJSON()]),
                rc_payload.retries.map(([key, value]: [StorageKey, Option<PalletSchedulerRetryConfig>]) => [key.toJSON(), value.toJSON()]),
                'Retries map value on Asset Hub should match the RC value'
            );
        }

        await check_rc(rc_api_after);
        await check_ah(ah_api_after, pre_payload.rc_pre_payload);
    }
};
