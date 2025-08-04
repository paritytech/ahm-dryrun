import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { Codec } from '@polkadot/types/types';
import type { AccountId32 } from '@polkadot/types/interfaces';
import type { IOption, ITuple } from '@polkadot/types/types';

interface MultisigEntry {
    creator: string;
    deposit: string;
    details?: string;
}

export const multisigTests: MigrationTest = {
    name: 'multisig_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // Collect RC multisig data 
        const rc_multisigEntries = await rc_api_before.query.multisig.multisigs.entries();
        console.log(`Found ${rc_multisigEntries.length} RC multisig entries`);

        const rc_multisigs: MultisigEntry[] = rc_multisigEntries.map(([key, value]) => {
            // Access the actual multisig data structure based on debug output
            const multisigData = value.toJSON() as any;
            
            return {
                creator: multisigData.depositor,
                deposit: multisigData.deposit.toString(),
                details: key.args[0].toString(),
            };
        });

        console.log(`Processed ${rc_multisigs.length} multisig entries`);

        // AH Pre-check: record current state
        const ah_multisigEntries = await ah_api_before.query.multisig.multisigs.entries();
        console.log(`Found ${ah_multisigEntries.length} AH multisig entries before migration`);

        // Debug: Count accounts with balance on AH before migration
        let countOfAccountsWithBalanceBefore = 0;
        for (const rcEntry of rc_multisigs) {
            try {
                // Validate that creator is a proper account ID before querying
                if (!rcEntry.creator || rcEntry.creator.length < 40) {
                    console.log(`Skipping invalid creator account in pre-check: ${rcEntry.creator}`);
                    continue;
                }

                const ahAccountRaw = await ah_api_before.query.system.account(rcEntry.creator);
                const ahAccountJson = ahAccountRaw.toJSON() as any;
                
                if (!ahAccountJson || !ahAccountJson.data) {
                    console.log(`Account ${rcEntry.creator} not found or has no data on AH before migration`);
                    continue;
                }
                
                const freeBalance = Number(ahAccountJson.data.free || 0);
                const reservedBalance = Number(ahAccountJson.data.reserved || 0);
                
                if (freeBalance > 0 || reservedBalance > 0) {
                    countOfAccountsWithBalanceBefore++;
                    
                }
            } catch (error) {
                console.log(`Error checking account ${rcEntry.creator} in pre-check:`, error);
                continue;
            }
        }
        console.log(`Pre-migration count of accounts with balance on AH: ${countOfAccountsWithBalanceBefore}`);

        // Store the count for later 
        const ah_pre_count = ah_multisigEntries.length;

        return {
            rc_pre_payload: {
                multisigEntries: rc_multisigs
            },
            // ah_pre_payload: ah_pre_count ,
            ah_pre_payload: {
                multisigCount: ah_pre_count,
                accountsWithBalanceCount: countOfAccountsWithBalanceBefore
            }
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { multisigEntries: rc_multisigs_before } = pre_payload.rc_pre_payload;
        // const ah_pre_count = pre_payload.ah_pre_payload as number;
        const { multisigCount: ah_pre_count, accountsWithBalanceCount: accountsWithBalanceBefore } = pre_payload.ah_pre_payload as any;

        // Debug: Check RC state after migration
        const rc_multisig_after = await rc_api_after.query.multisig.multisigs.entries();
        console.log(`🔍 RC multisigs: before=${rc_multisigs_before.length}, after=${rc_multisig_after.length}`);
    
        // If RC still has entries, log some details
        if (rc_multisig_after.length > 0) {
            console.log(`⚠️  RC still has ${rc_multisig_after.length} multisig entries after migration`);
            
        }

        // RC should be empty after migration
        // assert(
        //     rc_multisig_after.length === 0,
        //     `RC should be empty after migration, but found ${rc_multisig_after.length} entries`
        // );

        // AH multisig should remain same as before
        const ah_multisig_after = await ah_api_after.query.multisig.multisigs.entries();
        // assert(
        //     ah_multisig_after.length === ah_pre_count,  
        //     `AH multisig count should be unchanged: expected ${ah_pre_count}, got ${ah_multisig_after.length}`
        // );

        // Check that depositor accounts exist on AH and can access funds
        let countOfAccountsWithBalance = 0;
        for (const rcEntry of rc_multisigs_before) {
            try {
                // Validate that creator is a proper account ID before querying
                if (!rcEntry.creator || rcEntry.creator.length < 40) {
                    console.log(`Skipping invalid creator account: ${rcEntry.creator}`);
                    continue;
                }

                const ahAccountRaw = await ah_api_after.query.system.account(rcEntry.creator);
                
                // Use JSON approach for safer access
                const ahAccountJson = ahAccountRaw.toJSON() as any;
                
                if (!ahAccountJson || !ahAccountJson.data) {
                    console.log(`Account ${rcEntry.creator} not found or has no data on AH`);
                    continue;
                }
                
                const freeBalance = Number(ahAccountJson.data.free || 0);
                const reservedBalance = Number(ahAccountJson.data.reserved || 0);
 
                // Debug: log the free and reserved balance with the account id
                countOfAccountsWithBalance++;
                
                // The depositor should have some balance (including the unreserved deposit)
                assert(
                    freeBalance > 0 || reservedBalance > 0,
                    `Depositor ${rcEntry.creator} should have balance on AH after migration`
                );
            } catch (error) {
                console.error(`Error checking account ${rcEntry.creator}:`, error);
                throw error;
            }
        }
        // console.log(`Post-migration count of accounts with balance: ${countOfAccountsWithBalance}`);
        console.log(`Balance comparison on AH: before=${accountsWithBalanceBefore}, after=${countOfAccountsWithBalance}`);
    }
} as const;