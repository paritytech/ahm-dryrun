import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { StorageKey } from '@polkadot/types';
import type { FrameSupportTokensFungibleUnionOfNativeOrWithId } from '@polkadot/types/lookup';
import type { IOption } from '@polkadot/types/types';
import type { u128 } from '@polkadot/types-codec';

export const assetRateTests: MigrationTest = {
    name: 'asset_rate_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { ah_api_before } = context;

        // Collect RC data - all ConversionRateToNative entries
        const rc_asset_rate_entries = await context.rc_api_before.query.assetRate.conversionRateToNative.entries();

        // AH Pre-check assertions - verify no entries are present
        const ah_before_entries = await ah_api_before.query.assetRate.conversionRateToNative.entries();
        assert.equal(
            ah_before_entries.length, 
            0, 
            'Assert AH storage assetRate.conversionRateToNative() is empty before migration'
        );

        return {
            rc_pre_payload: {
                rc_asset_rate_entries
            },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { rc_asset_rate_entries: rc_before_entries } = pre_payload.rc_pre_payload;

        // Check RC is empty after migration
        const rc_after_entries = await rc_api_after.query.assetRate.conversionRateToNative.entries();
        assert.equal(
            rc_after_entries.length, 
            0, 
            'Assert RC storage assetRate.conversionRateToNative() is empty after migration'
        );

        // Get AH entries after migration
        const ah_after_entries = await ah_api_after.query.assetRate.conversionRateToNative.entries();

        // Check length matches
        assert.equal(
            rc_before_entries.length,
            ah_after_entries.length,
            'Assert rc_before and ah_after storage assetRate.conversionRateToNative() has same number of entries'
        );

        // Check values match
        for (const [rcKey, rcValue] of rc_before_entries) {
            const matchingEntry = ah_after_entries.find(
                ([ahKey, _]) => ahKey.toHex() === rcKey.toHex()
            );
            
            assert(
                matchingEntry !== undefined,
                `[AH post] Missing entry for key ${rcKey.toHex()}`
            );

            const [_, ahValue] = matchingEntry;
            assert.deepStrictEqual(
                rcValue.toHex(),
                ahValue.toHex(),
                `[AH post] Value mismatch for key ${rcKey.toHex()}`
            );
        }

        // Check no extra entries
        for (const [ahKey] of ah_after_entries) {
            const exists = rc_before_entries.some(
                ([rcKey]: [StorageKey<[FrameSupportTokensFungibleUnionOfNativeOrWithId]>]) => rcKey.toHex() === ahKey.toHex()
            );
            assert(
                exists,
                `[AH post] Unexpected entry with key ${ahKey.toHex()}`
            );
        }
    }
};
