import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import { logger } from "../../shared/logger.js"; 


// Constants for validation - SS58 address length
const MIN_SS58_ADDRESS_LENGTH = 48;
interface MultisigEntry {
    depositor: string;
    deposit: string;
    details?: string;
}

export const multisigTests: MigrationTest = {
    name: 'multisig_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // Collect RC multisig data 
        const rc_multisigEntries = await rc_api_before.query.multisig.multisigs.entries();

        const rc_multisigs: MultisigEntry[] = rc_multisigEntries.map(([key, value]) => {
            const multisigData = value.toJSON() as any;
            return {
                depositor: multisigData.depositor,
                deposit: multisigData.deposit.toString(),
                details: key.args?.[0]?.toString() || 'unknown',
            };
        });

        // AH Pre-check: record current state
        const ah_multisigEntries = await ah_api_before.query.multisig.multisigs.entries();

        return {
            rc_pre_payload: {
                multisigEntries: rc_multisigs
            },
            ah_pre_payload: ah_multisigEntries.length
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { multisigEntries: rc_multisigs_before } = pre_payload.rc_pre_payload;
        const ah_pre_count = pre_payload.ah_pre_payload as number;
        
        // Check RC state after migration
        const rc_multisig_after = await rc_api_after.query.multisig.multisigs.entries();
    
        // RC should be empty after migration
        assert(
            rc_multisig_after.length === 0,
            `RC should be empty after migration, but found ${rc_multisig_after.length} entries`
        );

        // AH multisig count should remain same as before
        const ah_multisig_after = await ah_api_after.query.multisig.multisigs.entries();
        assert(
            ah_multisig_after.length === ah_pre_count,  
            `AH multisig count should be unchanged: expected ${ah_pre_count}, got ${ah_multisig_after.length}`
        );

        // Check that depositor accounts exist on AH and can access funds
        let countOfAccountsWithBalance = 0;
        for (const rcEntry of rc_multisigs_before) {
            try {
                // Validate that depositor is a proper account ID before querying
                if (!rcEntry.depositor || rcEntry.depositor.length < MIN_SS58_ADDRESS_LENGTH) {
                    logger.warn(`Skipping invalid depositor account: ${rcEntry.depositor}`);
                    continue;
                }

                const ahAccountRaw = await ah_api_after.query.system.account(rcEntry.depositor);
                
                // JSON approach for safer access
                const ahAccountJson = ahAccountRaw.toJSON() as any;
                
                if (!ahAccountJson || !ahAccountJson.data) {
                    logger.warn(`Account ${rcEntry.depositor} not found or has no data on AH`);
                    continue;
                }
                
                const freeBalance = Number(ahAccountJson.data.free || 0);
                const reservedBalance = Number(ahAccountJson.data.reserved || 0);
 
                // The depositor should have some balance (including the unreserved deposit)
                assert(
                    freeBalance > 0 || reservedBalance > 0,
                    `Depositor ${rcEntry.depositor} should have balance on AH after migration`
                );
                countOfAccountsWithBalance++;

            } catch (error) {
                logger.error(`Error checking account ${rcEntry.depositor}:`, error);
                throw error;
            }
        }
        
        // countOfAccountsWithBalance should be equal to rc_multisigs_before.length. 
        // As each multisig has some deposits, which gets unreserved on AH, the depositor should have some balance on AH.
        assert(
            countOfAccountsWithBalance === rc_multisigs_before.length,
            `Count of depositor accounts with balance on AH should be equal to the number of multisig entries before migration: expected ${rc_multisigs_before.length}, got ${countOfAccountsWithBalance}`
        );

    }
} as const;

