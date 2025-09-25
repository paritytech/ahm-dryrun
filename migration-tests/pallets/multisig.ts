import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import { logger } from "../../shared/logger.js"; 
import { translateAccountRcToAh } from '../utils/account_translation.js';


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
        // Get existential deposit value
        const existentialDeposit = await rc_api_before.consts.balances.existentialDeposit;

        const rc_multisigs: MultisigEntry[] = rc_multisigEntries.map(([key, value]) => {
            const multisigData = value.toJSON() as any;
            if (multisigData.deposit < existentialDeposit) {
                logger.warn(`Skipping multisig with deposit less than existential deposit: ${multisigData.deposit.toString()}`);
            }
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
        const rc_multisig_after = await rc_api_after.query.multisig.multisigs.entries();
        assert(
            rc_multisig_after.length === 0,
            `RC should be empty after migration, but found ${rc_multisig_after.length} entries`
        );
        
        const ah_pre_count = pre_payload.ah_pre_payload as number;
        const ah_multisig_after = await ah_api_after.query.multisig.multisigs.entries();
        assert(
            ah_multisig_after.length === ah_pre_count,  
            `AH multisig count should be unchanged: expected ${ah_pre_count}, got ${ah_multisig_after.length}`
        );

        let improper_accounts = 0;
        // Check that depositor accounts exist on AH and can access funds
        const { multisigEntries: rc_multisigs_before } = pre_payload.rc_pre_payload;
        let accountsWithBalanceCount = 0;
        for (const rcEntry of rc_multisigs_before) {
            // Validate that depositor is a proper account ID before querying
            if (!rcEntry.depositor || rcEntry.depositor.length < MIN_SS58_ADDRESS_LENGTH) {
                logger.debug(`Skipping invalid depositor account: ${rcEntry.depositor}`);
                improper_accounts++;
                continue;
            }

            let translatedAhAccountJson: any;
            let translatedAhAccount = translateAccountRcToAh(rcEntry.depositor);
            try {
                const translatedAhAccountRaw = await ah_api_after.query.system.account(translatedAhAccount);
                translatedAhAccountJson = translatedAhAccountRaw.toJSON() as any;
            } catch(error) {
                logger.error(`Error querying translated account ${translatedAhAccount}:`, error);
                throw error;
            }
                
            if (!translatedAhAccountJson?.data) {
                logger.warn(`Translated account ${translatedAhAccount} not found or has no data on AH`);
                continue;
            }
                
            // The depositor should have some balance (including the unreserved deposit)
            const freeBalance = Number(translatedAhAccountJson.data.free || 0);
            const reservedBalance = Number(translatedAhAccountJson.data.reserved || 0);
            assert(
              freeBalance > 0 || reservedBalance > 0,
              `Translated depositor ${translatedAhAccount} should have balance on AH after migration`
            );
            accountsWithBalanceCount++;
        }
        
        assert(
            accountsWithBalanceCount + improper_accounts === rc_multisigs_before.length,
            `Expected ${rc_multisigs_before.length} depositor accounts to have balance on AH, but found ${accountsWithBalanceCount + improper_accounts}.`
        );

    }
} as const;

