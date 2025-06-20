import '@polkadot/api-augment';
import { MigrationTest, PostCheckContext, PreCheckContext, PreCheckResult } from '../../types.js';
import assert from 'assert';
import type { StorageKey } from '@polkadot/types/primitive';
import type { Codec } from '@polkadot/types/types';

export const voterListTests: MigrationTest = {
    name: 'voter_list_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { ah_api_before, rc_api_before } = context;

        const listNodes = await ah_api_before.query.voterList.listNodes.entries();
        assert(listNodes.length === 0, 'Assert storage voterList.listNodes() is empty before migration');

        const listBags = await ah_api_before.query.voterList.listBags.entries();
        assert(listBags.length === 0, 'Assert storage voterList.listBags() is empty before migration');

        const nodes_before = await rc_api_before.query.voterList.listNodes.entries();
        const bags_before = await rc_api_before.query.voterList.listBags.entries();

        return {
            rc_pre_payload: {
                nodes_before,
                bags_before
            },
            ah_pre_payload: undefined
        };
    },
    post_check: async (
        context:    PostCheckContext,
        pre_payload:    PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { 
            nodes_before, 
            bags_before 
        }: {
            nodes_before: [StorageKey, Codec][];
            bags_before: [StorageKey, Codec][];
        } = pre_payload.rc_pre_payload;

        const rc_nodes_after = await rc_api_after.query.voterList.listNodes.entries();
        const rc_bags_after = await rc_api_after.query.voterList.listBags.entries();
        assert(rc_nodes_after.length === 0, 'Assert RC storage voterList.listNodes() is empty after migration');
        assert(rc_bags_after.length === 0, 'Assert RC storage voterList.listBags() is empty after migration');

        const nodes_after = await ah_api_after.query.voterList.listNodes.entries();
        assert(nodes_before.length > 0, 'Assert storage voterList.listNodes() is not empty before migration');
        assert(nodes_before.length === nodes_after.length, 'Assert storage voterList.listNodes() length matches before and after migration');

        // Convert node entries to maps for comparison
        const nodes_before_map = new Map(nodes_before.map(([key, value]) => [key.toString(), value.toJSON()]));
        const nodes_after_map = new Map(nodes_after.map(([key, value]) => [key.toString(), value.toJSON()]));

        // Check that all node entries match
        for (const [key, beforeValue] of nodes_before_map) {
            const afterValue = nodes_after_map.get(key);
            assert(afterValue !== undefined, `Missing node key ${key} in post-migration nodes`);
            assert.deepStrictEqual(beforeValue, afterValue, `Node value mismatch for key ${key}`);
        }

        // Check no extra node entries exist
        for (const [key] of nodes_after_map) {
            assert(nodes_before_map.has(key), `Unexpected node key ${key} in post-migration nodes`);
        }

        const bags_after = await ah_api_after.query.voterList.listBags.entries();
        assert(bags_before.length > 0, 'Assert storage voterList.listBags() is not empty before migration');
        assert(bags_before.length === bags_after.length, 'Assert storage voterList.listBags() length matches before and after migration');

        // Convert bag entries to maps for comparison
        const bags_before_map = new Map(bags_before.map(([key, value]) => [key.toString(), value.toJSON()]));
        const bags_after_map = new Map(bags_after.map(([key, value]) => [key.toString(), value.toJSON()]));

        // Check that all bag entries match
        for (const [key, beforeValue] of bags_before_map) {
            const afterValue = bags_after_map.get(key);
            assert(afterValue !== undefined, `Missing bag key ${key} in post-migration bags`);
            assert.deepStrictEqual(beforeValue, afterValue, `Bag value mismatch for key ${key}`);
        }

        // Check no extra bag entries exist
        for (const [key] of bags_after_map) {
            assert(bags_before_map.has(key), `Unexpected bag key ${key} in post-migration bags`);
        }
    }
}; 