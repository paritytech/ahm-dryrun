import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { Codec } from '@polkadot/types/types';
import type { AccountId32 } from '@polkadot/types/interfaces';
import type { IOption, ITuple } from '@polkadot/types/types';

interface IndicesEntry {
    index: number;
    who: string;
    deposit: string;
    frozen: boolean;
}

export const indicesTests: MigrationTest = {
    name: 'indices_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // Collect RC data
        const rc_indicesEntries = await rc_api_before.query.indices.accounts.entries();
        const rc_indices: IndicesEntry[] = rc_indicesEntries.map(([key, value]) => {
            const entryValue = value as IOption<ITuple<[AccountId32, Codec, Codec]>>;
            if (entryValue.isSome) {
                const [who, deposit, frozen] = entryValue.unwrap();
                return {
                    index: key.args[0].toNumber(),
                    who: who.toString(),
                    deposit: deposit.toString(),
                    frozen: frozen.eq(true)
                };
            }
            throw new Error(`Unexpected None value for index ${key.args[0].toString()}`);
        });

        // AH Pre-check assertions
        const ah_indicesEntries = await ah_api_before.query.indices.accounts.entries();
        assert(
            ah_indicesEntries.length === 0,
            'Indices entries before migration should be empty'
        );

        return {
            rc_pre_payload: {
                indicesEntries: rc_indices
            },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { indicesEntries: rc_indices_before } = pre_payload.rc_pre_payload;

        // Check RC is empty after migration
        const rc_indices_after = await rc_api_after.query.indices.accounts.entries();
        assert(
            rc_indices_after.length === 0,
            'Indices entries after migration should be empty in RC'
        );

        // Get AH entries after migration
        const ah_indices_after = await ah_api_after.query.indices.accounts.entries();

        // Check if each entry from RC exists in AH after migration with same values
        for (const rcEntry of rc_indices_before) {
            const matchingEntry = ah_indices_after.find(
                ([key, _]) => key.args[0].toNumber() === rcEntry.index
            );

            assert(
                matchingEntry !== undefined,
                `Index ${rcEntry.index} not found after migration`
            );

            const [_, value] = matchingEntry;
            const entryValue = value as IOption<ITuple<[AccountId32, Codec, Codec]>>;
            assert(entryValue.isSome, `Value for index ${rcEntry.index} is None`);
            
            const [who, deposit, frozen] = entryValue.unwrap();
            
            assert.strictEqual(
                who.toString(),
                rcEntry.who,
                `Account mismatch for index ${rcEntry.index}`
            );
            assert.strictEqual(
                deposit.toString(),
                rcEntry.deposit,
                `Deposit mismatch for index ${rcEntry.index}`
            );
            assert.strictEqual(
                frozen.eq(true),
                rcEntry.frozen,
                `Frozen status mismatch for index ${rcEntry.index}`
            );
        }

        // Check no extra entries in AH after migration
        for (const [key, _] of ah_indices_after) {
            const index = key.args[0].toNumber();
            const matchingEntry = rc_indices_before.find(
                (entry: IndicesEntry) => entry.index === index
            );

            assert(
                matchingEntry !== undefined,
                `Unexpected index entry found after migration: ${index}`
            );
        }

        // Verify total count matches
        assert.strictEqual(
            ah_indices_after.length,
            rc_indices_before.length,
            'Number of indices entries should match before and after migration'
        );
    }
} as const;
