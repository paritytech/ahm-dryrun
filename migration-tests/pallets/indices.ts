import '@polkadot/api-augment';
import { PalletTest } from '../types.js';
import assert from 'assert';

const formatIndicesEntry = ([key, value]: any) => {
    const index = key.args[0].toNumber();
    if (value.isSome) {
        const [who, deposit, frozen] = value.unwrap();
        return {
            index,
            who: who.toString(),
            deposit: deposit.toBigInt(),
            frozen: frozen.isTrue
        };
    }
    return null;
};

export const indicesTests: PalletTest = {
    pallet_name: 'indices',
    pre_check: async ({ ah_api_before }) => {
        const indices = await ah_api_before.query.indices.accounts.entries();
        assert(indices.length === 0, "[AH] Assert storage indices.accounts() is empty before migration");
    },
    post_check: async ({ rc_api_before, rc_api_after, ah_api_before, ah_api_after }) => {
        const indices = await rc_api_after.query.indices.accounts.entries();
        assert(indices.length === 0, "[RC] Assert storage indices.accounts() is empty after migration");

        // Get RC indices before migration
        const rc_indices_before = await rc_api_before.query.indices.accounts.entries();
        const rc_before_formatted = rc_indices_before
            .map(formatIndicesEntry)
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        // Get AH indices before migration
        const ah_indices_before = await ah_api_before.query.indices.accounts.entries();
        const ah_before_formatted = ah_indices_before
            .map(formatIndicesEntry)
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        // Convert to Map for comparison (equivalent to BTreeMap in Rust)
        const all_pre = new Map(
            [...rc_before_formatted, ...ah_before_formatted].map(({ index, who, deposit, frozen }) => 
                [index, { who, deposit, frozen }]
            )
        );

        // Assert that we have indices to migrate
        assert(all_pre.size > 0, "[AH] Assert storage indices.accounts() is not empty before migration");

        // Get AH indices after migration
        const ah_indices_after = await ah_api_after.query.indices.accounts.entries();
        const all_post = new Map(
            ah_indices_after
                .map(formatIndicesEntry)
                .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
                .map(({ index, who, deposit, frozen }) => [
                    index,
                    { who, deposit, frozen }
                ])
        );

        // Compare maps for equality
        assert.strictEqual(
            all_pre.size,
            all_post.size,
            "Assert pre & post storage indices.accounts() length matches"
        );

        // Check that all entries match
        for (const [index, preValue] of all_pre) {
            const postValue = all_post.get(index);
            assert(postValue !== undefined, `[AH post] Missing index ${index} in post-migration indices`);
            assert.deepStrictEqual(
                preValue,
                postValue,
                `[AH post] Mismatch for index ${index} in indices.accounts()`
            );
        }

        // Check no extra entries exist
        for (const [index] of all_post) {
            assert(all_pre.has(index), `[AH post] Unexpected index ${index} in post-migration indices`);
        }
    }
}; 