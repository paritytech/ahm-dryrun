import '@polkadot/api-augment';
import { PalletTest } from '../types.js';
import assert from 'assert';

export const vestingTests: PalletTest = {
    pallet_name: 'vesting',
    pre_check: async ({ ah_api_before }) => {
        const ah_vestingStorageVersion = await ah_api_before.query.vesting.storageVersion();
        assert.equal(ah_vestingStorageVersion.toHuman(), 'V0', 'Vesting storage version should be V0 before migration');

        // Check if vesting entries are empty before migration
        const vestingEntries_before = await ah_api_before.query.vesting.vesting([]);
        assert(vestingEntries_before.isEmpty, 'Vesting entries before migration should be empty');
    },
    post_check: async ({ rc_api_before, ah_api_after, rc_api_after }) => {
        // Check if vesting entries are empty after migration where they should be
        const vestingEntries_after = await rc_api_after.query.vesting.vesting([]);
        assert(vestingEntries_after.isEmpty, 'Vesting entries after migration should be empty');

        // Check consistency of vesting entries
        const rc_vestingEntries_before = await rc_api_before.query.vesting.vesting.entries();
        const ah_vestingEntries_after = await ah_api_after.query.vesting.vesting.entries();

        // Check if each entry from `before` exists `after` migration with the same values
        for (const [key, value] of rc_vestingEntries_before) {
            const accountId = key.args[0].toString();
            const matchingEntry = ah_vestingEntries_after.find(([k, _]) => k.args[0].toString() === accountId);

            assert(matchingEntry !== undefined, `Account ${accountId} vesting entry not found after migration`);

            const [_, afterValue] = matchingEntry;
            assert.deepStrictEqual(
                value.toJSON(),
                afterValue.toJSON(),
                `Vesting details mismatch for account ${accountId}`
            );
        }

        // Check if there are no extra entries after migration
        for (const [key, _] of ah_vestingEntries_after) {
            const accountId = key.args[0].toString();
            const matchingEntry = rc_vestingEntries_before.find(([k, _]) => k.args[0].toString() === accountId);

            assert(matchingEntry !== undefined, `Unexpected vesting entry found after migration for account ${accountId}`);
        }

        // Check storage version consistency
        const rc_vesting_storage_version_after = await rc_api_before.query.vesting.storageVersion();
        const ah_vesting_storage_version_after = await ah_api_after.query.vesting.storageVersion();
        assert.equal(ah_vesting_storage_version_after, 'V1', 'vesting storage version should be V1 after migration');
        assert.equal(
            rc_vesting_storage_version_after.toHex(), 
            ah_vesting_storage_version_after.toHex(), 
            'Vesting storage versions should be the same'
        );
    }
}; 