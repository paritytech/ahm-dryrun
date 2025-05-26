import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { Codec } from '@polkadot/types/types';
import type { StorageKey } from '@polkadot/types';

export const vestingTests: MigrationTest = {
    name: 'vesting_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // Collect RC data
        const rc_vestingEntries = await rc_api_before.query.vesting.vesting.entries();
        const rc_storageVersion = await rc_api_before.query.vesting.storageVersion();

        // AH Pre-check assertions
        const ah_vestingStorageVersion = await ah_api_before.query.vesting.storageVersion();
        assert.equal(
            ah_vestingStorageVersion.toHuman(),
            'V0',
            'Vesting storage version should be V0 before migration'
        );

        const ah_vestingEntries = await ah_api_before.query.vesting.vesting([]);
        assert(
            ah_vestingEntries.isEmpty,
            'Vesting entries before migration should be empty'
        );

        return {
            rc_pre_payload: {
                vestingEntries: rc_vestingEntries,
                storageVersion: rc_storageVersion
            },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { vestingEntries: rc_vestingEntries_before } = pre_payload.rc_pre_payload;

        // Check RC is empty after migration
        const rc_vestingEntries_after = await rc_api_after.query.vesting.vesting([]);
        assert(
            rc_vestingEntries_after.isEmpty,
            'Vesting entries after migration should be empty'
        );

        // Get AH entries after migration
        const ah_vestingEntries_after = await ah_api_after.query.vesting.vesting.entries();

        // Check if each entry from RC exists in AH after migration with same values
        for (const [key, value] of rc_vestingEntries_before) {
            const accountId = key.args[0].toString();
            const matchingEntry = ah_vestingEntries_after.find(
                ([k, _]: [StorageKey, Codec]) => k.args[0].toString() === accountId
            );

            assert(
                matchingEntry !== undefined,
                `Account ${accountId} vesting entry not found after migration`
            );

            const [_, afterValue] = matchingEntry;
            assert.deepStrictEqual(
                value.toJSON(),
                afterValue.toJSON(),
                `Vesting details mismatch for account ${accountId}`
            );
        }

        // Check no extra entries in AH after migration
        for (const [key, _] of ah_vestingEntries_after) {
            const accountId = key.args[0].toString();
            const matchingEntry = rc_vestingEntries_before.find(
                ([k, _]: [StorageKey, Codec]) => k.args[0].toString() === accountId
            );

            assert(
                matchingEntry !== undefined,
                `Unexpected vesting entry found after migration for account ${accountId}`
            );
        }

        // Check storage version consistency
        const ah_vesting_storage_version_after = await ah_api_after.query.vesting.storageVersion();
        assert.equal(
            ah_vesting_storage_version_after.toHuman(),
            'V1',
            'vesting storage version should be V1 after migration'
        );
    }
}; 