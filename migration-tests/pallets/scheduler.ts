import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { ApiTypes, QueryableStorageEntry } from '@polkadot/api/types';
import type { PalletSchedulerScheduled } from '@polkadot/types/lookup';
import type { Option } from '@polkadot/types/codec';
import type { Vec } from '@polkadot/types/codec';
import { ApiDecoration } from '@polkadot/api/types';

async function getTaskCallEncodings(
    api: ApiDecoration<'promise'>,
    tasks: Vec<Option<PalletSchedulerScheduled>>
): Promise<(Uint8Array | null)[]> {
    // Convert based on Schedules existence and call type
    return Promise.all(
        tasks.map(async (maybeSchedule) => {
            if (!maybeSchedule.isSome) {
                return null;
            }

            const call = maybeSchedule.unwrap().call;

            // Match the call type similar to Rust implementation
            if (call.isInline) {
                // Inline. Grab inlined call.
                return call.asInline.toU8a();
            } else if (call.isLookup) {
                // Lookup. Fetch preimage and store.
                const { hash, len } = call.asLookup;
                try {
                    const preimage = await api.query.preimage.preimageFor([hash, len]) as Option<any>;
                    return preimage.isSome ? preimage.unwrap().toU8a() : null;
                } catch {
                    return null;
                }
            } else if (call.isLegacy) {
                // Legacy. Fetch preimage and store.
                const { hash } = call.asLegacy;
                try {
                    const preimage = await api.query.preimage.preimageFor([hash, null]) as Option<any>;
                    return preimage.isSome ? preimage.unwrap().toU8a() : null;
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
        const { rc_api_before } = context;

        // Collect IncompleteSince
        const incompleteSince = await rc_api_before.query.scheduler.incompleteSince();
        
        // Collect all agenda entries and map them with their call encodings
        const rawAgendaEntries = await rc_api_before.query.scheduler.agenda.entries();
        const agendaEntriesWithEncodings = await Promise.all(
            rawAgendaEntries.map(async ([key, tasks]) => {
                const blockNumber = key.args[0].toNumber();
                return [
                    blockNumber,
                    tasks.toJSON(),
                    await getTaskCallEncodings(rc_api_before, tasks)
                ];
            })
        );
        
        // Collect retries
        const retries = await rc_api_before.query.scheduler.retries.entries();
        
        // Collect lookup entries
        const lookup = await rc_api_before.query.scheduler.lookup.entries();

        return {
            rc_pre_payload: {
                incompleteSince,
                agendaEntries: agendaEntriesWithEncodings,
                retries,
                lookup
            },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after } = context;

        // Check IncompleteSince is None after migration
        const incompleteSinceAfter = await rc_api_after.query.scheduler.incompleteSince();
        assert(
            incompleteSinceAfter.isNone,
            'IncompleteSince should be None on RC after migration'
        );

        // Check Agenda is empty after migration
        const agendaEntriesAfter = await rc_api_after.query.scheduler.agenda.entries();
        assert(
            agendaEntriesAfter.length === 0,
            'Agenda map should be empty on RC after migration'
        );

        // Check Retries is empty after migration
        const retriesAfter = await rc_api_after.query.scheduler.retries.entries();
        assert(
            retriesAfter.length === 0,
            'Retries map should be empty on RC after migration'
        );

        // Check Lookup is empty after migration
        const lookupAfter = await rc_api_after.query.scheduler.lookup.entries();
        assert(
            lookupAfter.length === 0,
            'Lookup map should be empty on RC after migration'
        );
    }
};
