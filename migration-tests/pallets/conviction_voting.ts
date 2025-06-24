import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { PalletConvictionVotingVoteVoting } from '@polkadot/types/lookup';
import type { AccountId32 } from '@polkadot/types/interfaces/runtime';
import type { u16, u128 } from '@polkadot/types';
import { ApiDecoration } from '@polkadot/api/types';

interface VotingForMessage {
    accountId: AccountId32;
    class: u16;
    voting: PalletConvictionVotingVoteVoting;
}

interface ClassLocksForMessage {
    accountId: AccountId32;
    balancePerClass: [u16, u128][];
}

async function collect_voting_for_messages(api: ApiDecoration<'promise'>): Promise<VotingForMessage[]> {
    const voting_for_messages: VotingForMessage[] = [];
    const votingForEntries = await api.query.convictionVoting.votingFor.entries();
    for (const [key, voting] of votingForEntries) {
        const [accountId, class_] = key.args;

        if (!voting.isEmpty) {
            voting_for_messages.push({ 
                accountId: accountId as unknown as AccountId32, 
                class: class_ as unknown as u16, 
                voting: voting as unknown as PalletConvictionVotingVoteVoting 
            });
        }
    }
    return voting_for_messages.sort((a, b) => {
        const accountCompare = a.accountId.toString().localeCompare(b.accountId.toString());
        if (accountCompare !== 0) return accountCompare;
        return a.class.toNumber() - b.class.toNumber();
    });
}

async function collect_class_locks_for_messages(api: ApiDecoration<'promise'>): Promise<ClassLocksForMessage[]> {
    const class_locks_for_messages: ClassLocksForMessage[] = [];
    const classLocksEntries = await api.query.convictionVoting.classLocksFor.entries();
    for (const [key, balancePerClass] of classLocksEntries) {
        const accountId = key.args[0] as unknown as AccountId32;
        const filteredBalances = (balancePerClass as unknown as [u16, u128][]).filter(([_, balance]: [u16, u128]) => !balance.isZero());

        if (filteredBalances.length > 0) {
            class_locks_for_messages.push({ 
                accountId, 
                balancePerClass: filteredBalances.sort(([a_class, _a]: [u16, u128], [b_class, _b]: [u16, u128]) => a_class.toNumber() - b_class.toNumber())
            });
        }
    }
    return class_locks_for_messages.sort((a, b) => a.accountId.toString().localeCompare(b.accountId.toString()));
}

export const convictionVotingTests: MigrationTest = {
    name: 'conviction_voting_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // AH Pre-check assertions
        const ah_votingForEntries = await ah_api_before.query.convictionVoting.votingFor.entries();
        assert(
            ah_votingForEntries.length === 0,
            "Assert storage 'ah_api_before.query.convictionVoting.votingFor.entries() is empty'"
        );

        const ah_classLocksEntries = await ah_api_before.query.convictionVoting.classLocksFor.entries();
        assert(
            ah_classLocksEntries.length === 0,
            "Assert storage 'ah_api_before.query.convictionVoting.classLocksFor.entries() is empty'"
        );

        const voting_for_messages = await collect_voting_for_messages(rc_api_before);
        const class_locks_for_messages = await collect_class_locks_for_messages(rc_api_before);
        return {
            rc_pre_payload: { voting_for_messages, class_locks_for_messages },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;

        // RC Post-check - Verify RC storages are empty
        const rc_votingForEntries = await rc_api_after.query.convictionVoting.votingFor.entries();
        assert(
            rc_votingForEntries.length === 0,
            "rc_api_after.query.convictionVoting.votingFor.entries() is empty"
        );

        const rc_classLocksEntries = await rc_api_after.query.convictionVoting.classLocksFor.entries();
        assert(
            rc_classLocksEntries.length === 0,
            "rc_api_after.query.convictionVoting.classLocksFor.entries() is empty"
        );

        // AH Post-check - Collect and verify migrated data
        const ah_voting_for_messages = await collect_voting_for_messages(ah_api_after);
        const ah_class_locks_for_messages = await collect_class_locks_for_messages(ah_api_after);

        const { 
            voting_for_messages: rc_voting_for_messages, 
            class_locks_for_messages: rc_class_locks_for_messages 
        }: { 
            voting_for_messages: VotingForMessage[], 
            class_locks_for_messages: ClassLocksForMessage[] 
        } = pre_payload.rc_pre_payload;

        compare_class_locks_for_messages(rc_class_locks_for_messages, ah_class_locks_for_messages);
        compare_voting_for_messages(rc_voting_for_messages, ah_voting_for_messages);
    }
};

function compare_class_locks_for_messages(rc_class_locks_for_messages: ClassLocksForMessage[], ah_class_locks_for_messages: ClassLocksForMessage[]) {
    assert.equal(
        rc_class_locks_for_messages.length,
        ah_class_locks_for_messages.length,
        "Length mismatch in class locks messages"
    );

    for (let i = 0; i < rc_class_locks_for_messages.length; i++) {
        const rc_msg = rc_class_locks_for_messages[i];
        const ah_msg = ah_class_locks_for_messages[i];

        // Compare account IDs
        assert.equal(
            rc_msg.accountId.toString(),
            ah_msg.accountId.toString(),
            `Account ID mismatch at index ${i}: rc=${rc_msg.accountId.toString()} ah=${ah_msg.accountId.toString()}`
        );

        // Compare balance arrays length
        assert.equal(
            rc_msg.balancePerClass.length,
            ah_msg.balancePerClass.length,
            `Balance array length mismatch for account ${rc_msg.accountId.toString()}`
        );

        // Compare each balance pair
        for (let j = 0; j < rc_msg.balancePerClass.length; j++) {
            const [rc_class, rc_balance] = rc_msg.balancePerClass[j];
            const [ah_class, ah_balance] = ah_msg.balancePerClass[j];

            assert.equal(
                rc_class.toString(),
                ah_class.toString(),
                `Class mismatch at index ${j} for account ${rc_msg.accountId.toString()}`
            );

            assert.equal(
                rc_balance.toString(),
                ah_balance.toString(),
                `Balance mismatch at index ${j} for account ${rc_msg.accountId.toString()}`
            );
        }
    }
}

function compare_voting_for_messages(rc_voting_for_messages: VotingForMessage[], ah_voting_for_messages: VotingForMessage[]) {
    assert.equal(
        rc_voting_for_messages.length,
        ah_voting_for_messages.length,
        "Length mismatch in voting for messages"
    );

    for (let i = 0; i < rc_voting_for_messages.length; i++) {
        const rc_msg = rc_voting_for_messages[i];
        const ah_msg = ah_voting_for_messages[i];

        // Compare account IDs
        assert.equal(
            rc_msg.accountId.toString(),
            ah_msg.accountId.toString(),
            `Account ID mismatch at index ${i}}`
        );

        // Compare class
        assert.equal(
            rc_msg.class.toString(),
            ah_msg.class.toString(),
            `Class mismatch at index ${i} for account ${rc_msg.accountId.toString()}`
        );

        // Compare voting
        assert.equal(
            rc_msg.voting.toString(),
            ah_msg.voting.toString(),
            `Voting mismatch at index ${i} for account ${rc_msg.accountId.toString()}`
        );
    }
}

function log_diff(rc_voting_for_messages: VotingForMessage[], ah_voting_for_messages: VotingForMessage[]) {
    console.log('RC voting messages length:', rc_voting_for_messages.length);
    console.log('AH voting messages length:', ah_voting_for_messages.length);
    // Find messages that exist in RC but not in AH
    const rcOnly = rc_voting_for_messages.filter(rcMsg => 
        !ah_voting_for_messages.some(ahMsg => 
            rcMsg.accountId.toString() === ahMsg.accountId.toString() &&
            rcMsg.class.toString() === ahMsg.class.toString()
        )
    );

    // Find messages that exist in AH but not in RC
    const ahOnly = ah_voting_for_messages.filter(ahMsg =>
        !rc_voting_for_messages.some(rcMsg =>
            ahMsg.accountId.toString() === rcMsg.accountId.toString() &&
            ahMsg.class.toString() === rcMsg.class.toString() 
        )
    );

    if (rcOnly.length > 0) {
        console.warn('\nEntries only in RC:');
        rcOnly.forEach(msg => {
            console.warn(`Account: ${msg.accountId.toString()}, Class: ${msg.class.toString()}, Voting: ${msg.voting.toString()}`);
        });
        console.warn(`\nTotal number of RC only entries: ${rcOnly.length}`);
    }

    if (ahOnly.length > 0) {
        console.warn('\nEntries only in AH:');
        ahOnly.forEach(msg => {
            console.warn(`Account: ${msg.accountId.toString()}, Class: ${msg.class.toString()}, Voting: ${msg.voting.toString()}`);
        });
        console.warn(`\nTotal number of AH only entries: ${ahOnly.length}`);
    }

    // Find messages that exist in both RC and AH
    const commonEntries = rc_voting_for_messages.filter(rcMsg =>
        ah_voting_for_messages.some(ahMsg =>
            rcMsg.accountId.toString() === ahMsg.accountId.toString() &&
            rcMsg.class.toString() === ahMsg.class.toString()
        )
    );

    if (commonEntries.length > 0) {
        console.warn('\nEntries found in both RC and AH:');
        commonEntries.forEach(msg => {
            console.warn(`Account: ${msg.accountId.toString()}, Class: ${msg.class.toString()}, Voting: ${msg.voting.toString()}`);
        });
        console.warn(`\nTotal number of common entries: ${commonEntries.length}`);
    }
}