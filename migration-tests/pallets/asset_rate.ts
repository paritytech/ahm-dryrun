import '@polkadot/api-augment';
import { PalletTest } from '../types.js';
import assert from 'assert';

export const assetRateTests: PalletTest = {
    pallet_name: 'asset_rate',
    pre_check: async ({ ah_api_before }) => {
        const ah_before_entries = await ah_api_before.query.assetRate.conversionRateToNative.entries();
        assert.equal(ah_before_entries.length, 0, 'Assert AH storage assetRate.conversionRateToNative() is empty before migration');
    },
    post_check: async ({ rc_api_before, ah_api_after, rc_api_after }) => {        
        // Check RC is empty after migration
        const rc_after_entries = await rc_api_after.query.assetRate.conversionRateToNative.entries();
        assert.equal(rc_after_entries.length, 0, 'Assert RC storage assetRate.conversionRateToNative() is empty after migration');

        console.log('rc_api_before.query.assetRate.conversionRateToNative()).toHuman(): ', ((await rc_api_before.query.assetRate.conversionRateToNative(null)).toHuman()));
        // Get all entries before migration from RC
        const rc_before_entries = await rc_api_before.query.assetRate.conversionRateToNative.entries();
        // assert(rc_before_entries.length > 0, 'Assert RC assetRate.conversionRateToNative() is not empty before migration');
        
        // Get all entries after migration from AH
        const ah_after_entries = await ah_api_after.query.assetRate.conversionRateToNative.entries();

        // Convert entries to Maps for comparison
        const rc_before_map = new Map(rc_before_entries);
        const ah_after_map = new Map(ah_after_entries);

        // Check sizes match
        assert.equal(
            rc_before_map.size,
            ah_after_map.size,
            'Assert rc_before and ah_after storage assetRate.conversionRateToNative() has same number of entries'
        );

        // Check all entries match
        for (const [key, value] of rc_before_map) {
            const ah_value = ah_after_map.get(key);
            assert(ah_value !== undefined, `[AH post] Missing key ${key} in post-migration assetRate.conversionRateToNative()`);
            assert.deepStrictEqual(
                value,
                ah_value,
                `[AH post] Value mismatch for key ${key} in assetRate.conversionRateToNative()`
            );
        }

        // Check no extra entries exist
        for (const [key] of ah_after_map) {
            assert(rc_before_map.has(key), `[AH post] Unexpected key ${key} in post-migration assetRate.conversionRateToNative()`);
        }
    }
}; 