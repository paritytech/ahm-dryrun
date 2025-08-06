import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import { logger } from "../../shared/logger.js"; 


// Constants for validation - SS58 address length
const MIN_SS58_ADDRESS_LENGTH = 48;
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
        logger.info(`Found ${rc_multisigEntries.length} RC multisig entries`);

        const rc_multisigs: MultisigEntry[] = rc_multisigEntries.map(([key, value]) => {
            
            const multisigData = value.toJSON() as any;
            
            return {
                creator: multisigData.depositor,
                deposit: multisigData.deposit.toString(),
                details: key.args?.[0]?.toString() || 'unknown',
            };
        });

        // AH Pre-check: record current state
        const ah_multisigEntries = await ah_api_before.query.multisig.multisigs.entries();
        logger.info(`Found ${ah_multisigEntries.length} AH multisig entries before migration`);

        // Store the count for later 
        const ah_pre_count = ah_multisigEntries.length;

        return {
            rc_pre_payload: {
                multisigEntries: rc_multisigs
            },
            ah_pre_payload: ah_pre_count 
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
        logger.info(`RC multisigs: before=${rc_multisigs_before.length}, after=${rc_multisig_after.length}`);
    
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
        logger.info(`AH multisig count: before=${ah_pre_count}, after=${ah_multisig_after.length}`);

        // Check that depositor accounts exist on AH and can access funds
        let countOfAccountsWithBalance = 0;
        for (const rcEntry of rc_multisigs_before) {
            try {
                // Validate that creator is a proper account ID before querying
                if (!rcEntry.creator || rcEntry.creator.length < MIN_SS58_ADDRESS_LENGTH) {
                    logger.warn(`Skipping invalid creator account: ${rcEntry.creator}`);
                    continue;
                }

                const ahAccountRaw = await ah_api_after.query.system.account(rcEntry.creator);
                
                // JSON approach for safer access
                const ahAccountJson = ahAccountRaw.toJSON() as any;
                
                if (!ahAccountJson || !ahAccountJson.data) {
                    logger.warn(`Account ${rcEntry.creator} not found or has no data on AH`);
                    continue;
                }
                
                const freeBalance = Number(ahAccountJson.data.free || 0);
                const reservedBalance = Number(ahAccountJson.data.reserved || 0);
 
                // The depositor should have some balance (including the unreserved deposit)
                assert(
                    freeBalance > 0 || reservedBalance > 0,
                    `Depositor ${rcEntry.creator} should have balance on AH after migration`
                );
                countOfAccountsWithBalance++;

            } catch (error) {
                logger.error(`Error checking account ${rcEntry.creator}:`, error);
                throw error;
            }
        }
        // countOfAccountsWithBalance should be equal to rc_multisigs_before.length. 
        // As each multisig has some deposits, which gets unreserved on AH, the depositor should have some balance on AH.
        assert(
            countOfAccountsWithBalance === rc_multisigs_before.length,
            `Count of creator accounts with balance on AH should be equal to the number of multisig entries before migration: expected ${rc_multisigs_before.length}, got ${countOfAccountsWithBalance}`
        );

        logger.info(`Post-migration count of creator accounts with balance on AH: ${countOfAccountsWithBalance}`);
    }
} as const;

