import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { PalletConvictionVotingVoteVoting } from '@polkadot/types/lookup';
import type { AccountId32 } from '@polkadot/types/interfaces/runtime';
import type { u16, u128 } from '@polkadot/types';
import { ApiDecoration } from '@polkadot/api/types';
import { translateAccountRcToAh } from '../utils/account_translation.js';

interface VotingFor {
    accountId: AccountId32;
    class: u16;
    voting: PalletConvictionVotingVoteVoting;
}

interface ClassLocksFor {
    accountId: AccountId32;
    balancePerClass: [u16, u128][];
}

async function collectVotingForMessages(api: ApiDecoration<'promise'>): Promise<VotingFor[]> {
    const votingForMessages: VotingFor[] = [];
    const votingForEntries = await api.query.convictionVoting.votingFor.entries();
    for (const [key, voting] of votingForEntries) {
        const [accountId, class_] = key.args;

        if (!voting.isEmpty) {
            votingForMessages.push({ 
                accountId: accountId as unknown as AccountId32, 
                class: class_ as unknown as u16, 
                voting: voting as unknown as PalletConvictionVotingVoteVoting 
            });
        }
    }
    return votingForMessages.sort((a, b) => {
        const accountCompare = a.accountId.toString().localeCompare(b.accountId.toString());
        if (accountCompare !== 0) return accountCompare;
        return a.class.toNumber() - b.class.toNumber();
    });
}

async function collectClassLocksForMessages(api: ApiDecoration<'promise'>): Promise<ClassLocksFor[]> {
    const classLocksForMessages: ClassLocksFor[] = [];
    const classLocksEntries = await api.query.convictionVoting.classLocksFor.entries();
    for (const [key, balancePerClass] of classLocksEntries) {
        const accountId = key.args[0] as unknown as AccountId32;
        const filteredBalances = (balancePerClass as unknown as [u16, u128][]).filter(([_, balance]: [u16, u128]) => !balance.isZero());

        if (filteredBalances.length > 0) {
            classLocksForMessages.push({ 
                accountId, 
                balancePerClass: filteredBalances.sort(([aClass, _a]: [u16, u128], [bClass, _b]: [u16, u128]) => aClass.toNumber() - bClass.toNumber())
            });
        }
    }
    return classLocksForMessages.sort((a, b) => a.accountId.toString().localeCompare(b.accountId.toString()));
}

export const convictionVotingTests: MigrationTest = {
    name: 'conviction_voting_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // AH Pre-check assertions
        const ahVotingForEntries = await ah_api_before.query.convictionVoting.votingFor.entries();
        assert(
            ahVotingForEntries.length === 0,
            "Assert storage 'ah_api_before.query.convictionVoting.votingFor.entries() is empty'"
        );

        const ahClassLocksEntries = await ah_api_before.query.convictionVoting.classLocksFor.entries();
        assert(
            ahClassLocksEntries.length === 0,
            "Assert storage 'ah_api_before.query.convictionVoting.classLocksFor.entries() is empty'"
        );

        const votingForMessages = await collectVotingForMessages(rc_api_before);
        const classLocksForMessages = await collectClassLocksForMessages(rc_api_before);
        return {
            rc_pre_payload: { votingForMessages, classLocksForMessages },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;

        // RC Post-check - Verify RC storages are empty
        const rcVotingForEntries = await rc_api_after.query.convictionVoting.votingFor.entries();
        assert(
            rcVotingForEntries.length === 0,
            "rc_api_after.query.convictionVoting.votingFor.entries() is empty"
        );

        const rcClassLocksEntries = await rc_api_after.query.convictionVoting.classLocksFor.entries();
        assert(
            rcClassLocksEntries.length === 0,
            "rc_api_after.query.convictionVoting.classLocksFor.entries() is empty"
        );

        // AH Post-check - Collect and verify migrated data
        const ahVotingForMessages = await collectVotingForMessages(ah_api_after);
        const ahClassLocksForMessages = await collectClassLocksForMessages(ah_api_after);

        const { 
            votingForMessages: rcVotingForMessages, 
            classLocksForMessages: rcClassLocksForMessages 
        }: { 
            votingForMessages: VotingFor[], 
            classLocksForMessages: ClassLocksFor[] 
        } = pre_payload.rc_pre_payload;

        compareClassLocksForMessages(rcClassLocksForMessages, ahClassLocksForMessages);
        compareVotingForMessages(rcVotingForMessages, ahVotingForMessages);
    }
};

function compareClassLocksForMessages(rcClassLocksForMessages: ClassLocksFor[], ahClassLocksForMessages: ClassLocksFor[]) {
    assert.equal(
        rcClassLocksForMessages.length,
        ahClassLocksForMessages.length,
        "Length mismatch in class locks messages"
    );

    for (let i = 0; i < rcClassLocksForMessages.length; i++) {
        const rcMsg = rcClassLocksForMessages[i];
        const ahMsg = ahClassLocksForMessages[i];

        // Translate RC account ID for comparison
        const translatedRcAccountId = translateAccountRcToAh(rcMsg.accountId.toString());
        
        // Compare account IDs
        assert.equal(
            translatedRcAccountId,
            ahMsg.accountId.toString(),
            `Account ID mismatch at index ${i}: rc=${rcMsg.accountId.toString()} translated=${translatedRcAccountId} ah=${ahMsg.accountId.toString()}`
        );

        // Compare balance arrays length
        assert.equal(
            rcMsg.balancePerClass.length,
            ahMsg.balancePerClass.length,
            `Balance array length mismatch for account ${translatedRcAccountId}`
        );

        // Compare each balance pair
        for (let j = 0; j < rcMsg.balancePerClass.length; j++) {
            const [rcClass, rcBalance] = rcMsg.balancePerClass[j];
            const [ahClass, ahBalance] = ahMsg.balancePerClass[j];

            assert.equal(
                rcClass.toString(),
                ahClass.toString(),
                `Class mismatch at index ${j} for account ${translatedRcAccountId}`
            );

            assert.equal(
                rcBalance.toString(),
                ahBalance.toString(),
                `Balance mismatch at index ${j} for account ${translatedRcAccountId}`
            );
        }
    }
}

function compareVotingForMessages(rcVotingForMessages: VotingFor[], ahVotingForMessages: VotingFor[]) {
    assert.equal(
        rcVotingForMessages.length,
        ahVotingForMessages.length,
        "Length mismatch in voting for messages"
    );

    for (let i = 0; i < rcVotingForMessages.length; i++) {
        const rcMsg = rcVotingForMessages[i];
        const ahMsg = ahVotingForMessages[i];

        // Translate RC account ID for comparison
        const translatedRcAccountId = translateAccountRcToAh(rcMsg.accountId.toString());
        
        // Compare account IDs
        assert.equal(
            translatedRcAccountId,
            ahMsg.accountId.toString(),
            `Account ID mismatch at index ${i}: rc=${rcMsg.accountId.toString()} translated=${translatedRcAccountId} ah=${ahMsg.accountId.toString()}`
        );

        // Compare class
        assert.equal(
            rcMsg.class.toString(),
            ahMsg.class.toString(),
            `Class mismatch at index ${i} for account ${translatedRcAccountId}`
        );

        // Compare voting - need to handle delegate account translation within voting structure
        const rcVotingJson = rcMsg.voting.toJSON() as any;
        const ahVotingJson = ahMsg.voting.toJSON() as any;
        
        // If it's a delegating vote, translate the delegate target account
        if (rcVotingJson.Delegating && ahVotingJson.Delegating) {
            const translatedDelegateTarget = translateAccountRcToAh(rcVotingJson.Delegating.target);
            const translatedRcVoting = {
                ...rcVotingJson,
                Delegating: {
                    ...rcVotingJson.Delegating,
                    target: translatedDelegateTarget
                }
            };
            
            assert.deepStrictEqual(
                translatedRcVoting,
                ahVotingJson,
                `Voting mismatch at index ${i} for account ${translatedRcAccountId}`
            );
        } else {
            // For non-delegating votes, compare directly
            assert.deepStrictEqual(
                rcVotingJson,
                ahVotingJson,
                `Voting mismatch at index ${i} for account ${translatedRcAccountId}`
            );
        }
    }
}

function logDiff(rcVotingForMessages: VotingFor[], ahVotingForMessages: VotingFor[]) {
    console.log('RC voting messages length:', rcVotingForMessages.length);
    console.log('AH voting messages length:', ahVotingForMessages.length);
    // Find messages that exist in RC but not in AH
    const rcOnly = rcVotingForMessages.filter(rcMsg => 
        !ahVotingForMessages.some(ahMsg => 
            rcMsg.accountId.toString() === ahMsg.accountId.toString() &&
            rcMsg.class.toString() === ahMsg.class.toString()
        )
    );

    // Find messages that exist in AH but not in RC
    const ahOnly = ahVotingForMessages.filter(ahMsg =>
        !rcVotingForMessages.some(rcMsg =>
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
    const commonEntries = rcVotingForMessages.filter(rcMsg =>
        ahVotingForMessages.some(ahMsg =>
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