import '@polkadot/api-augment';
import assert from 'assert';
import { MigrationTest, PreCheckContext, PostCheckContext, PreCheckResult } from '../types.js';

export const bountiesTests: MigrationTest = {
    name: 'bounties_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;
        
        // Collect RC data
        const count = await rc_api_before.query.bounties.bountyCount();
        const bounties = await rc_api_before.query.bounties.bounties.entries();
        const descriptions = await rc_api_before.query.bounties.bountyDescriptions.entries();
        const approvals = await rc_api_before.query.bounties.bountyApprovals();

        // AH Pre-check assertions
        const ah_count = await ah_api_before.query.bounties.bountyCount();
        assert.equal(
            ah_count.toNumber(),
            0,
            "Bounty count should be empty on asset hub before migration"
        );

        const ah_bounties = await ah_api_before.query.bounties.bounties.entries();
        assert.equal(
            ah_bounties.length,
            0,
            "The Bounties map should be empty on asset hub before migration"
        );

        const ah_descriptions = await ah_api_before.query.bounties.bountyDescriptions.entries();
        assert.equal(
            ah_descriptions.length,
            0,
            "The Bounty Descriptions map should be empty on asset hub before migration"
        );

        const ah_approvals = await ah_api_before.query.bounties.bountyApprovals();
        assert(
            ah_approvals.isEmpty,
            "The Bounty Approvals vec should be empty on asset hub before migration"
        );

        return {
            rc_pre_payload: [count, bounties, descriptions, approvals],
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const [rc_count, rc_bounties, rc_descriptions, rc_approvals] = pre_payload.rc_pre_payload;

        // RC Post-check - verify RC storage is empty
        const rc_count_after = await rc_api_after.query.bounties.bountyCount();
        assert.equal(
            rc_count_after.toNumber(),
            0,
            "Bounty count should be 0 on RC after migration"
        );

        const rc_bounties_after = await rc_api_after.query.bounties.bounties.entries();
        assert.equal(
            rc_bounties_after.length,
            0,
            "Bounties map should be empty on RC after migration"
        );

        const rc_descriptions_after = await rc_api_after.query.bounties.bountyDescriptions.entries();
        assert.equal(
            rc_descriptions_after.length,
            0,
            "Bounty descriptions map should be empty on RC after migration"
        );

        const rc_approvals_after = await rc_api_after.query.bounties.bountyApprovals();
        assert(
            rc_approvals_after.isEmpty,
            "Bounty Approvals vec should be empty on RC after migration"
        );

        // AH Post-check - verify AH storage matches RC pre-migration data
        const ah_count = await ah_api_after.query.bounties.bountyCount();
        assert.equal(
            ah_count.toNumber(),
            rc_count.toNumber(),
            "Bounty count on Asset Hub should match the RC value"
        );

        const ah_bounties = await ah_api_after.query.bounties.bounties.entries();
        assert.equal(
            ah_bounties.length,
            rc_bounties.length,
            "Bounties map length on Asset Hub should match the RC value"
        );

        // Compare bounties data
        for (const [i, [key, value]] of rc_bounties.entries()) {
            const [ah_key, ah_value] = ah_bounties[i];
            assert.deepStrictEqual(
                key.args.toString(),
                ah_key.args.toString(),
                "Bounties map keys should match between RC and Asset Hub"
            );
            assert.deepStrictEqual(
                value.toJSON(),
                ah_value.toJSON(),
                "Bounties map values should match between RC and Asset Hub"
            );
        }

        const ah_descriptions = await ah_api_after.query.bounties.bountyDescriptions.entries();
        assert.equal(
            ah_descriptions.length,
            rc_descriptions.length,
            "Bounty description map length on Asset Hub should match RC value"
        );

        // Compare descriptions data
        for (const [i, [key, value]] of rc_descriptions.entries()) {
            const [ah_key, ah_value] = ah_descriptions[i];
            assert.deepStrictEqual(
                key.args.toString(),
                ah_key.args.toString(),
                "Bounty descriptions map keys should match between RC and Asset Hub"
            );
            assert.deepStrictEqual(
                value.toJSON(),
                ah_value.toJSON(),
                "Bounty descriptions map values should match between RC and Asset Hub"
            );
        }

        const ah_approvals = await ah_api_after.query.bounties.bountyApprovals();
        assert.equal(
            ah_approvals.length,
            rc_approvals.length,
            "Bounty approvals vec length on Asset Hub should match RC values"
        );

        assert.deepStrictEqual(
            ah_approvals.toJSON(),
            rc_approvals.toJSON(),
            "Bounty approvals vec value on Asset Hub should match RC values"
        );
    }
};
