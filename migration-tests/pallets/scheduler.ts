import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { PalletSchedulerScheduled } from '@polkadot/types/lookup';
import type { Option } from '@polkadot/types/codec';
import type { Vec } from '@polkadot/types/codec';
import { ApiDecoration } from '@polkadot/api/types';
import type { Bytes } from '@polkadot/types/primitive';

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
        const { rc_api_after } = context;

        async function rc_check(api: ApiDecoration<'promise'>) {
            // Check IncompleteSince is None after migration
            const incompleteSinceAfter = await api.query.scheduler.incompleteSince();
            assert(
                incompleteSinceAfter.isNone,
                'IncompleteSince should be None on RC after migration'
            );

            // Check Agenda is empty after migration
            const agendaEntriesAfter = await api.query.scheduler.agenda.entries();
            assert(
                agendaEntriesAfter.length === 0,
                'Agenda map should be empty on RC after migration'
            );

            // Check Retries is empty after migration
            const retriesAfter = await api.query.scheduler.retries.entries();
            assert(
                retriesAfter.length === 0,
                'Retries map should be empty on RC after migration'
            );

            // Check Lookup is empty after migration
            const lookupAfter = await api.query.scheduler.lookup.entries();
            assert(
                lookupAfter.length === 0,
                'Lookup map should be empty on RC after migration'
            );
        }

        await rc_check(rc_api_after);
    }
};
