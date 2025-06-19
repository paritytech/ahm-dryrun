import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { Codec } from '@polkadot/types/types';
import type { StorageKey } from '@polkadot/types';

export const treasuryTests: MigrationTest = {
    name: 'treasury_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // Collect RC data
        const rc_proposals = await rc_api_before.query.treasury.proposals.entries();
        const rc_proposal_count = await rc_api_before.query.treasury.proposalCount();
        const rc_approvals = await rc_api_before.query.treasury.approvals();
        const rc_spends = await rc_api_before.query.treasury.spends.entries();
        const rc_spend_count = await rc_api_before.query.treasury.spendCount();

        // Print collected RC data
        console.log('=== Relay Chain Treasury Data (Before Migration) ===');
        console.log('Proposal Count:', rc_proposal_count.toHuman());
        console.log('Spend Count:', rc_spend_count.toHuman());
        console.log('Approvals:', rc_approvals.toHuman());
        
        console.log(`\nProposals (${rc_proposals.length} entries):`);
        for (const [key, value] of rc_proposals) {
            const proposalId = key.args[0].toString();
            console.log(`  Proposal ${proposalId}:`, value.toHuman());
        }
        
        console.log(`\nSpends (${rc_spends.length} entries):`);
        for (const [key, value] of rc_spends) {
            const spendId = key.args[0].toString();
            console.log(`  Spend ${spendId}:`, value.toHuman());
        }

        // AH Pre-check assertions
        const ah_proposal_count = await ah_api_before.query.treasury.proposalCount();
        const ah_approvals = await ah_api_before.query.treasury.approvals();
        const ah_proposals = await ah_api_before.query.treasury.proposals.entries();
        const ah_spend_count = await ah_api_before.query.treasury.spendCount();
        const ah_spends = await ah_api_before.query.treasury.spends.entries();

        // Print collected AH data
        console.log('\n=== Asset Hub Treasury Data (Before Migration) ===');
        console.log('Proposal Count:', ah_proposal_count.toHuman());
        console.log('Spend Count:', ah_spend_count.toHuman());
        console.log('Approvals:', ah_approvals.toHuman());
        console.log(`Proposals: ${ah_proposals.length} entries`);
        console.log(`Spends: ${ah_spends.length} entries`);

        assert.equal(
            (ah_proposal_count as any).toNumber(),
            0,
            'ProposalCount should be 0 on Asset Hub before migration'
        );

        assert(
            ah_approvals.isEmpty,
            'Approvals should be empty on Asset Hub before migration'
        );

        assert.equal(
            ah_proposals.length,
            0,
            'Proposals should be empty on Asset Hub before migration'
        );

        assert.equal(
            (ah_spend_count as any).toNumber(),
            0,
            'SpendCount should be 0 on Asset Hub before migration'
        );

        assert.equal(
            ah_spends.length,
            0,
            'Spends should be empty on Asset Hub before migration'
        );

        return {
            rc_pre_payload: {
                proposals: rc_proposals,
                proposal_count: rc_proposal_count,
                approvals: rc_approvals,
                spends: rc_spends,
                spend_count: rc_spend_count
            },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { 
            proposals: rc_proposals_before, 
            proposal_count: rc_proposal_count_before,
            approvals: rc_approvals_before,
            spends: rc_spends_before,
            spend_count: rc_spend_count_before
        } = pre_payload.rc_pre_payload;

        // Check RC is empty after migration
        // const rc_proposal_count_after = await rc_api_after.query.treasury.proposalCount();
        // assert.equal(
        //     (rc_proposal_count_after as any).toNumber(),
        //     0,
        //     'ProposalCount should be 0 on relay chain after migration'
        // );

        // const rc_approvals_after = await rc_api_after.query.treasury.approvals();
        // assert(
        //     rc_approvals_after.isEmpty,
        //     'Approvals should be empty on relay chain after migration'
        // );

        // const rc_proposals_after = await rc_api_after.query.treasury.proposals.entries();
        // assert.equal(
        //     rc_proposals_after.length,
        //     0,
        //     'Proposals should be empty on relay chain after migration'
        // );

        // const rc_spend_count_after = await rc_api_after.query.treasury.spendCount();
        // assert.equal(
        //     (rc_spend_count_after as any).toNumber(),
        //     0,
        //     'SpendCount should be 0 on relay chain after migration'
        // );

        // const rc_spends_after = await rc_api_after.query.treasury.spends.entries();
        // assert.equal(
        //     rc_spends_after.length,
        //     0,
        //     'Spends should be empty on relay chain after migration'
        // );

        // Check AH has migrated data
        const ah_proposal_count_after = await ah_api_after.query.treasury.proposalCount();
        const ah_spend_count_after = await ah_api_after.query.treasury.spendCount();
        const ah_proposals_after = await ah_api_after.query.treasury.proposals.entries();
        const ah_approvals_after = await ah_api_after.query.treasury.approvals();
        const ah_spends_after = await ah_api_after.query.treasury.spends.entries();
        
        // Print post-migration Asset Hub treasury data
        console.log('\n=== Asset Hub Treasury Data (After Migration) ===');
        console.log('Proposal Count:', ah_proposal_count_after.toHuman());
        console.log('Spend Count:', ah_spend_count_after.toHuman());
        console.log('Approvals:', ah_approvals_after.toHuman());

        const rc_proposals_after = await rc_api_after.query.treasury.proposals.entries();
        const rc_spends_after = await rc_api_after.query.treasury.spends.entries();
        const rc_approvals_after = await rc_api_after.query.treasury.approvals();

        console.log('\n=== Relay Chain Treasury Data (After Migration) ===');
        console.log('Proposal Count:', rc_proposals_after.length);
        console.log('Spend Count:', rc_spends_after.length);
        console.log('Approvals:', rc_approvals_after.toHuman());


        console.log(`\nProposals (${rc_proposals_after.length} entries):`);
        for (const [key, value] of rc_proposals_after) {
            const proposalId = key.args[0].toString();
            console.log(`  Proposal ${proposalId}:`, value.toHuman());
        }
        
        console.log(`\nSpends (${rc_spends_after.length} entries):`);
        for (const [key, value] of rc_spends_after) {
            const spendId = key.args[0].toString();
            console.log(`  Spend ${spendId}:`, value.toHuman());
        }
        
        assert.equal(
            (ah_proposal_count_after as any).toNumber(),
            (rc_proposal_count_before as any).toNumber(),
            'ProposalCount on Asset Hub should match Relay Chain value'
        );

        
        assert.equal(
            (ah_spend_count_after as any).toNumber(),
            (rc_spend_count_before as any).toNumber(),
            'SpendCount on Asset Hub should match Relay Chain value'
        );

        // Check proposals migration
        assert.equal(
            ah_proposals_after.length,
            rc_proposals_before.length,
            'Number of active proposals on Asset Hub should match Relay Chain value'
        );

        // Check each proposal exists with same values
        for (const [rcKey, rcValue] of rc_proposals_before) {
            const proposalId = rcKey.args[0].toString();
            const matchingEntry = ah_proposals_after.find(
                ([ahKey, _]) => ahKey.args[0].toString() === proposalId
            );

            assert(
                matchingEntry !== undefined,
                `Proposal ${proposalId} not found after migration`
            );

            const [_, ahValue] = matchingEntry;
            assert.deepStrictEqual(
                rcValue.toJSON(),
                ahValue.toJSON(),
                `Proposal details mismatch for proposal ${proposalId}`
            );
        }

        // Check approvals migration
        
        assert.equal(
            (ah_approvals_after as any).length,
            (rc_approvals_before as any).length,
            'Number of approvals on Asset Hub should match Relay Chain value'
        );

        assert.deepStrictEqual(
            rc_approvals_before.toJSON(),
            ah_approvals_after.toJSON(),
            'Approvals on Asset Hub should match Relay Chain approvals'
        );

        // Check spends migration
        assert.equal(
            ah_spends_after.length,
            rc_spends_before.length,
            'Number of active spends on Asset Hub should match Relay Chain value'
        );

        // Check each spend exists with same values
        for (const [rcKey, rcValue] of rc_spends_before) {
            const spendId = rcKey.args[0].toString();
            const matchingEntry = ah_spends_after.find(
                ([ahKey, _]) => ahKey.args[0].toString() === spendId
            );

            assert(
                matchingEntry !== undefined,
                `Spend ${spendId} not found after migration`
            );

            const [_, ahValue] = matchingEntry;
            assert.deepStrictEqual(
                rcValue.toJSON(),
                ahValue.toJSON(),
                `Spend details mismatch for spend ${spendId}`
            );
        }

        // Check no extra entries in AH
        for (const [ahKey] of ah_proposals_after) {
            const proposalId = ahKey.args[0].toString();
            const exists = rc_proposals_before.some(
                ([rcKey]: [StorageKey, Codec]) => rcKey.args[0].toString() === proposalId
            );
            assert(
                exists,
                `Unexpected proposal found after migration for proposal ${proposalId}`
            );
        }

        for (const [ahKey] of ah_spends_after) {
            const spendId = ahKey.args[0].toString();
            const exists = rc_spends_before.some(
                ([rcKey]: [StorageKey, Codec]) => rcKey.args[0].toString() === spendId
            );
            assert(
                exists,
                `Unexpected spend found after migration for spend ${spendId}`
            );
        }
    }
};
