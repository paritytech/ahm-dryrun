import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import { ApiDecoration } from '@polkadot/api/types/index.js';

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
        const ahCount = await ah_api_before.query.bounties.bountyCount();
        assert.equal(
            (ahCount as any).toNumber(),
            0,
            "Bounty count should be empty on asset hub before migration"
        );

        const ahBounties = await ah_api_before.query.bounties.bounties.entries();
        assert.equal(
            ahBounties.length,
            0,
            "The Bounties map should be empty on asset hub before migration"
        );

        const ahDescriptions = await ah_api_before.query.bounties.bountyDescriptions.entries();
        assert.equal(
            ahDescriptions.length,
            0,
            "The Bounty Descriptions map should be empty on asset hub before migration"
        );

        const ahApprovals = await ah_api_before.query.bounties.bountyApprovals();
        assert(
            ahApprovals.isEmpty,
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

        // RC Post-check - verify RC storage is empty
        async function verifyRcStorageEmpty(rc_api_after: ApiDecoration<'promise'>) {
            const rcCountAfter = await rc_api_after.query.bounties.bountyCount();
            assert.equal(
                (rcCountAfter as any).toNumber(),
                0,
                "Bounty count should be 0 on RC after migration"
            );

            const rcBountiesAfter = await rc_api_after.query.bounties.bounties.entries();
            assert.equal(
                rcBountiesAfter.length,
                0,
                "Bounties map should be empty on RC after migration"
            );

            const rcDescriptionsAfter = await rc_api_after.query.bounties.bountyDescriptions.entries();
            assert.equal(
                rcDescriptionsAfter.length,
                0,
                "Bounty descriptions map should be empty on RC after migration"
            );

            const rcApprovalsAfter = await rc_api_after.query.bounties.bountyApprovals();
            assert(
                rcApprovalsAfter.isEmpty,
                "Bounty Approvals vec should be empty on RC after migration"
            );
        }

        async function verifyAhStorageMatchesRcPreMigrationData(ah_api_after: ApiDecoration<'promise'>) {
            // AH Post-check - verify AH storage matches RC pre-migration data
            const [rcCount, rcBounties, rcDescriptions, rcApprovals] = pre_payload.rc_pre_payload;
            const ahCount = await ah_api_after.query.bounties.bountyCount();
            assert.equal(
                (ahCount as any).toNumber(),
                (rcCount as any).toNumber(),
                "Bounty count on Asset Hub should match the RC value"
            );

            const ahBounties = await ah_api_after.query.bounties.bounties.entries();
            assert.equal(
                ahBounties.length,
                rcBounties.length,
                "Bounties map length on Asset Hub should match the RC value"
            );

            // Compare bounties data
            for (const [i, [key, value]] of rcBounties.entries()) {
                const [ahKey, ahValue] = ahBounties[i];
                assert.deepStrictEqual(
                    key.args.toString(),
                    ahKey.args.toString(),
                    "Bounties map keys should match between RC and Asset Hub"
                );
                assert.deepStrictEqual(
                    value.toJSON(),
                    ahValue.toJSON(),
                    "Bounties map values should match between RC and Asset Hub"
                );
            }

            const ahDescriptions = await ah_api_after.query.bounties.bountyDescriptions.entries();
            assert.equal(
                ahDescriptions.length,
                rcDescriptions.length,
                "Bounty description map length on Asset Hub should match RC value"
            );

            // Compare descriptions data
            for (const [i, [key, value]] of rcDescriptions.entries()) {
                const [ahKey, ahValue] = ahDescriptions[i];
                assert.deepStrictEqual(
                    key.args.toString(),
                    ahKey.args.toString(),
                    "Bounty descriptions map keys should match between RC and Asset Hub"
                );
                assert.deepStrictEqual(
                    value.toJSON(),
                    ahValue.toJSON(),
                    "Bounty descriptions map values should match between RC and Asset Hub"
                );
            }

            const ahApprovals = await ah_api_after.query.bounties.bountyApprovals();
            assert.equal(
                (ahApprovals as any).length,
                rcApprovals.length,
                "Bounty approvals vec length on Asset Hub should match RC values"
            );

            assert.deepStrictEqual(
                ahApprovals.toJSON(),
                rcApprovals.toJSON(),
                "Bounty approvals vec value on Asset Hub should match RC values"
            );
        }

        await verifyRcStorageEmpty(rc_api_after);
        await verifyAhStorageMatchesRcPreMigrationData(ah_api_after);
    }
};
