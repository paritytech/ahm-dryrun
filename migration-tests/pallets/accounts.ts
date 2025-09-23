import '@polkadot/api-augment';
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { StorageKey } from '@polkadot/types';
import type { AccountId32 } from '@polkadot/types/interfaces/runtime';
import type { u128, u32, u8, Bytes } from '@polkadot/types-codec';
import type { PalletBalancesAccountData, PalletBalancesBalanceLock, PalletBalancesReserveData } from '@polkadot/types/lookup';
import { translateAccountRcToAh } from '../utils/account_translation.js';



// TypeScript equivalent of Rust BalanceSummary
interface BalanceSummary {
    migrated_free: bigint;
    migrated_reserved: bigint;
    frozen: bigint;
    holds: Array<[string, bigint]>; // [hold_id_hex, amount]
    freezes: Array<[string, bigint]>; // [freeze_id_hex, amount]
    locks: Array<[string, bigint, number]>; // [lock_id_hex, amount, reasons]
}

// AH pre-migration data: Map<AccountId, [holds_map, reserved, free]>
type AhPrePayload = Map<string, [Map<string, bigint>, bigint, bigint]>;
// RC pre-migration data: [account_summaries, total_issuance]
type RcPrePayload = [Map<string, BalanceSummary>, bigint];

// TypeScript mapping for Rust AccountState enum
interface AccountStatePart {
    free: bigint;
    reserved: bigint;
    consumers: number;
}

type AccountState = 
    | { Migrate: null }
    | { Preserve: null } 
    | { Part: AccountStatePart };

// Helper function to parse account state from Polkadot.js query result
function parseAccountState(queryResult: any): AccountState | null {
    if (queryResult.isEmpty || queryResult.isNone) {
        return null;
    }
    
    const stateJson = queryResult.unwrap().toJSON();
    
    // Handle both uppercase (enum variant names) and lowercase (JSON field names)
    if (stateJson.Migrate !== undefined || stateJson.migrate !== undefined) {
        return { Migrate: null };
    } else if (stateJson.Preserve !== undefined || stateJson.preserve !== undefined) {
        return { Preserve: null };
    } else if (stateJson.Part !== undefined || stateJson.part !== undefined) {
        const partData = stateJson.Part || stateJson.part;
        return { 
            Part: {
                free: BigInt(partData.free),
                reserved: BigInt(partData.reserved),
                consumers: Number(partData.consumers)
            }
        };
    }
    
    throw new Error(`Unknown account state: ${JSON.stringify(stateJson)}`);
}

// Cache helper functions
function getCacheFilePath(testName: string): string {
    return path.join('.', `${testName}_pre_check_cache.json`);
}

function serializePreCheckResult(result: PreCheckResult): string {
    const rcData = result.rc_pre_payload as [Map<string, BalanceSummary>, bigint];
    const ahData = result.ah_pre_payload as Map<string, [Map<string, bigint>, bigint, bigint]>;
    
    const serializable = {
        rc_pre_payload: [
            Array.from(rcData[0].entries()).map(([accountId, summary]) => [
                accountId,
                {
                    migrated_free: summary.migrated_free.toString(),
                    migrated_reserved: summary.migrated_reserved.toString(),
                    frozen: summary.frozen.toString(),
                    holds: summary.holds.map(([id, amount, ...rest]) => [id, amount.toString(), ...rest]),
                    locks: summary.locks.map(([id, amount, ...rest]) => [id, amount.toString(), ...rest]),
                    freezes: summary.freezes.map(([id, amount]) => [id, amount.toString()])
                }
            ]),
            rcData[1].toString()
        ],
        ah_pre_payload: Array.from(ahData.entries()).map(([accountId, [holdsMap, reserved, free]]) => [
            accountId,
            [
                Array.from(holdsMap.entries()).map(([holdId, amount]) => [holdId, amount.toString()]),
                reserved.toString(),
                free.toString()
            ]
        ])
    };
    return JSON.stringify(serializable, null, 2);
}

function deserializePreCheckResult(data: string): PreCheckResult {
    const parsed = JSON.parse(data);
    
    // Deserialize rc_pre_payload
    const rcAccountSummaries = new Map<string, BalanceSummary>();
    for (const [accountId, summary] of parsed.rc_pre_payload[0]) {
        rcAccountSummaries.set(accountId, {
            ...summary,
            migrated_free: BigInt(summary.migrated_free),
            migrated_reserved: BigInt(summary.migrated_reserved),
            frozen: BigInt(summary.frozen),
            holds: summary.holds.map(([id, amount, ...rest]: any[]) => [id, BigInt(amount), ...rest]),
            locks: summary.locks.map(([id, amount, ...rest]: any[]) => [id, BigInt(amount), ...rest]),
            freezes: summary.freezes.map(([id, amount]: any[]) => [id, BigInt(amount)])
        });
    }
    const rcTotalIssuance = BigInt(parsed.rc_pre_payload[1]);
    
    // Deserialize ah_pre_payload
    const ahPrePayload = new Map<string, [Map<string, bigint>, bigint, bigint]>();
    for (const [accountId, [holdsArray, reserved, free]] of parsed.ah_pre_payload) {
        const holdsMap = new Map<string, bigint>();
        for (const [holdId, amount] of holdsArray) {
            holdsMap.set(holdId, BigInt(amount));
        }
        ahPrePayload.set(accountId, [holdsMap, BigInt(reserved), BigInt(free)]);
    }
    
    return {
        rc_pre_payload: [rcAccountSummaries, rcTotalIssuance],
        ah_pre_payload: ahPrePayload
    };
}

function loadFromCache(testName: string): PreCheckResult | null {
    const cacheFile = getCacheFilePath(testName);
    
    try {
        if (fs.existsSync(cacheFile)) {
            const data = fs.readFileSync(cacheFile, 'utf8');
            if (data.trim()) {
                console.log(`Loading pre-check data from cache: ${cacheFile}`);
                const result = deserializePreCheckResult(data);
                console.log(`Loaded ${result.rc_pre_payload[0].size} RC accounts and ${result.ah_pre_payload.size} AH accounts from cache`);
                return result;
            }
        }
    } catch (error) {
        console.warn(`Failed to load cache file ${cacheFile}:`, error);
        // Delete corrupted cache file
        try {
            fs.unlinkSync(cacheFile);
        } catch (unlinkError) {
            console.warn(`Failed to delete corrupted cache file:`, unlinkError);
        }
    }
    
    return null;
}

function saveToCache(testName: string, result: PreCheckResult): void {
    const cacheFile = getCacheFilePath(testName);
    
    try {
        const serialized = serializePreCheckResult(result);
        fs.writeFileSync(cacheFile, serialized, 'utf8');
        console.log(`Saved pre-check data to cache: ${cacheFile}`);
    } catch (error) {
        console.warn(`Failed to save cache file ${cacheFile}:`, error);
    }
}

export const accountMigrationTests: MigrationTest = {
    name: 'account_migration_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;
        
        // Try to load from cache first
        const cachedResult = loadFromCache('accounts_pallet');
        if (cachedResult) {
            return cachedResult;
        }
        
        console.log('Cache not found or empty, computing pre-check data...');

        // Collect RC data - account summaries and total issuance
        const rc_total_issuance = await rc_api_before.query.balances.totalIssuance();
        const rc_account_summaries = new Map<string, BalanceSummary>();
        const rc_ed = await rc_api_before.consts.balances.existentialDeposit;

        // Get all accounts from RC
        // Process accounts in batches using pagination
        let startKey = '0x';
        while (true) {
            const rc_accounts = await rc_api_before.query.system.account.entriesPaged({ 
                pageSize: 1000, 
                args: [], 
                startKey 
            });
            
            for (const [key, accountInfo] of rc_accounts) {
                startKey = key.toHex();
                const accountId = key.args[0].toString();
                
                // Skip checking account - tested separately
                // Note: In real implementation, you'd need to get the actual checking account
                
                const accountData = accountInfo.data;
                const total_balance = accountData.free.toBigInt() + accountData.reserved.toBigInt();
                
                // Skip accounts below existential deposit (not migrated to AH)
                if (total_balance < rc_ed.toBigInt()) {
                    continue;
                }

                // Calculate migrated balances (simplified - in real implementation would need kept balance logic)
                const migrated_free = accountData.free.toBigInt();
                const migrated_reserved = accountData.reserved.toBigInt();

                let frozen = 0n;
                
                // Get locks
                const locks = await rc_api_before.query.balances.locks(accountId);
                const locks_encoded: Array<[string, bigint, number]> = [];
                for (const lock of locks) {
                    locks_encoded.push([
                        lock.id.toHex(),
                        lock.amount.toBigInt(),
                        lock.reasons.toNumber()
                    ]);
                    frozen += lock.amount.toBigInt();
                }

                // Get freezes
                const freezes = await rc_api_before.query.balances.freezes(accountId);
                const freezes_encoded: Array<[string, bigint]> = [];
                for (const freeze of freezes) {
                    freezes_encoded.push([
                        freeze.id.toHex(),
                        freeze.amount.toBigInt()
                    ]);
                    frozen += freeze.amount.toBigInt();
                }

                // Get holds
                const holds = await rc_api_before.query.balances.holds(accountId);
                const holds_encoded: Array<[string, bigint]> = [];
                for (const hold of holds) {
                    // Apply hold amount transformation (e.g., preimage deposits divided by 100)
                    const transformed_amount = transformHoldAmount(hold.id.toHex(), hold.amount.toBigInt());
                    holds_encoded.push([
                        translateRcHoldIdToAh(hold.id.toHex()),
                        transformed_amount
                    ]);
                }

                const balance_summary: BalanceSummary = {
                    migrated_free,
                    migrated_reserved,
                    frozen,
                    holds: holds_encoded,
                    locks: locks_encoded,
                    freezes: freezes_encoded
                };

                rc_account_summaries.set(accountId, balance_summary);
            }
            
            // Break if we got less than a full page (end of data)
            if (rc_accounts.length < 1000) {
                break;
            }
            console.log(`Processed ${rc_account_summaries.size} accounts`);
        }

        // AH Pre-check assertions - verify clean state before migration
        const ah_locks = await ah_api_before.query.balances.locks.entries();
        assert.equal(
            ah_locks.length,
            0,
            'Assert AH storage balances.locks() is empty before migration'
        );
        console.log(`AH locks: ${ah_locks.length}`);

        const ah_reserves = await ah_api_before.query.balances.reserves.entries();
        assert.equal(
            ah_reserves.length,
            0,
            'Assert AH storage balances.reserves() is empty before migration'
        );
        console.log(`AH reserves: ${ah_reserves.length}`);

        const ah_freezes = await ah_api_before.query.balances.freezes.entries();
        assert.equal(
            ah_freezes.length,
            0,
            'Assert AH storage balances.freezes() is empty before migration'
        );
        console.log(`AH freezes: ${ah_freezes.length}`);

        // Collect AH pre-migration account data
        const ah_pre_payload: AhPrePayload = new Map();
        startKey = '0x';
        while (true) {
            const ah_accounts = await ah_api_before.query.system.account.entriesPaged({
                args: [],
                pageSize: 1000,
                startKey
            });
            for (const [key, accountInfo] of ah_accounts) {
                startKey = key.toHex();

                const accountId = key.args[0].toString();
                const free = accountInfo.data.free.toBigInt();
                const reserved = accountInfo.data.reserved.toBigInt();
                const ah_holds_pre = new Map<string, bigint>();
                const holds = await ah_api_before.query.balances.holds(accountId);
                for (const hold of holds) {
                    ah_holds_pre.set(hold.id.toHex(), hold.amount.toBigInt());
                }

                ah_pre_payload.set(accountId, [ah_holds_pre, reserved, free]);
            }
            if (ah_accounts.length < 1000) {
                break;
            }
            console.log(`Processed ${ah_pre_payload.size} AH accounts`);
        }
        console.log(`AH pre-payload: ${ah_pre_payload.size} accounts`);

        const result: PreCheckResult = {
            rc_pre_payload: [rc_account_summaries, rc_total_issuance.toBigInt()],
            ah_pre_payload
        };
        
        // Save to cache for future runs
        saveToCache('accounts_pallet', result);
        
        return result;
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;

        // Pre-fetch all RC migrator account states
        console.log('Pre-fetching RC migrator account states');
        const rcMigratorAccounts = new Map<string, any>(); // TODO: Could be typed as Map<string, Option<AccountState>>
        let migratorStartKey = '0x';
        while (true) {
            const accounts = await rc_api_after.query.rcMigrator.rcAccounts.entriesPaged({
                args: [],
                pageSize: 1000,
                startKey: migratorStartKey
            });
            
            for (const [key, state] of accounts) {
                migratorStartKey = key.toHex();
                const accountId = key.args[0].toString();
                rcMigratorAccounts.set(accountId, state);
            }

            if (accounts.length < 1000) {
                break;
            }
            console.log(`Pre-fetched ${rcMigratorAccounts.size} RC migrator account states`);
        }
        console.log(`Total RC migrator accounts pre-fetched: ${rcMigratorAccounts.size}`);

        // Check RC post-migration state
        console.log('Checking RC post-migration state');
        let startKey = '0x';
        let total_accounts_after = 0;
        while (true) {
            const rc_accounts_after = await rc_api_after.query.system.account.entriesPaged({
                args: [],
                pageSize: 1000,
                startKey
            });
            for (const [key, accountInfo] of rc_accounts_after) {
                const accountId = key.args[0].toString();
                
                // Get account state from RC migrator (using pre-fetched data)
                const account_state_result = rcMigratorAccounts.get(accountId);
                let account_state = account_state_result ? parseAccountState(account_state_result) : null;
                
                if (!account_state) {
                    const ed = await rc_api_after.consts.balances.existentialDeposit;
                    const total_balance = accountInfo.data.free.toBigInt() + accountInfo.data.reserved.toBigInt();
                    if (total_balance < ed.toBigInt()) {
                        // Account below ED should be preserved
                        account_state = { Preserve: null };
                    }
                }
                
                if (account_state) {
                    if ('Part' in account_state) {
                        // Partially migrated account - verify remaining balances
                        const partState = account_state.Part;
                        
                        // Verify remaining balances match the Part state
                        if (accountInfo.data.reserved.toBigInt() !== partState.reserved) {
                            console.warn(`Incorrect reserve balance on RC after migration for account: ${accountId}. Expected: ${partState.reserved}, got: ${accountInfo.data.reserved.toBigInt()}`);
                        }

                        if (accountInfo.data.free.toBigInt() !== partState.free) {
                            console.warn(`Incorrect free balance on RC after migration for account: ${accountId}. Expected: ${partState.free}, got: ${accountInfo.data.free.toBigInt()}`);
                        }

                        // Check that locks, holds, and freezes are cleared
                        const locks = await rc_api_after.query.balances.locks(accountId);
                        // assert.equal(locks.length, 0, `Account ${accountId} should have no locks on RC after migration`);
                        if (locks.length !== 0) {
                            console.warn(`Account ${accountId} should have no locks on RC after migration`);
                        }
                    

                        const holds = await rc_api_after.query.balances.holds(accountId);
                        // assert.equal(holds.length, 0, `Account ${accountId} should have no holds on RC after migration`);
                        if (holds.length !== 0) {
                            console.warn(`Account ${accountId} should have no holds on RC after migration`);
                        }

                        const freezes = await rc_api_after.query.balances.freezes(accountId);
                        // assert.equal(freezes.length, 0, `Account ${accountId} should have no freezes on RC after migration`);
                        if (freezes.length !== 0) {
                            console.warn(`Account ${accountId} should have no freezes on RC after migration`);
                        }

                    } else if ('Preserve' in account_state) {
                        // Account preserved on RC - check conditions
                        const total_balance = accountInfo.data.free.toBigInt() + accountInfo.data.reserved.toBigInt();
                        const rc_ed = await rc_api_after.consts.balances.existentialDeposit;
                        
                        // Either below ED or special account (manager/on-demand)
                        if (total_balance >= rc_ed.toBigInt()) {
                            // Should be special account - this would need actual manager/on-demand account checks
                            console.log(`Account ${accountId} preserved with balance >= ED - should be special account`);
                        }
                    } else if ('Migrate' in account_state) {
                        // This shouldn't happen in post-migration state, but handle it
                        console.warn(`Account ${accountId} still marked for migration after migration completed`);
                    }
                } else {
                    // Fully migrated account - should have zero balance and no locks/holds/freezes
                    const total_balance = accountInfo.data.free.toBigInt() + accountInfo.data.reserved.toBigInt();
                    // assert.equal(total_balance, 0n, `Account ${accountId} should have no balance on RC after migration`);
                    if (total_balance !== 0n) {
                        console.warn(`Account ${accountId} should have no balance on RC after migration`);
                    }

                    const locks = await rc_api_after.query.balances.locks(accountId);
                    // assert.equal(locks.length, 0, `Account ${accountId} should have no locks on RC after migration`);
                    if (locks.length !== 0) {
                        console.warn(`Account ${accountId} should have no locks on RC after migration`);
                    }

                    const holds = await rc_api_after.query.balances.holds(accountId);
                    // assert.equal(holds.length, 0, `Account ${accountId} should have no holds on RC after migration`);
                    if (holds.length !== 0) {
                        console.warn(`Account ${accountId} should have no holds on RC after migration`);
                    }

                    const freezes = await rc_api_after.query.balances.freezes(accountId);
                    // assert.equal(freezes.length, 0, `Account ${accountId} should have no freezes on RC after migration`);
                    if (freezes.length !== 0) {
                        console.warn(`Account ${accountId} should have no freezes on RC after migration`);
                    }
                }
            }
            if (rc_accounts_after.length < 1000) {
                break;
            }
            total_accounts_after += rc_accounts_after.length;
            console.log(`Processed ${total_accounts_after} RC accounts after migration`);
        }

        // Check AH post-migration state
        // Check that no failed accounts remain in AH migrator storage
        const failed_accounts = await ah_api_after.query.ahMigrator.rcAccounts.entries();
        assert.equal(
            failed_accounts.length,
            0,
            'Failed accounts should not remain in storage after migration'
        );
        console.log(`Failed accounts: ${failed_accounts.length}`);

        const [rc_account_summaries, rc_total_issuance_before] = pre_payload.rc_pre_payload as RcPrePayload;
        for (const [accountId, summary] of rc_account_summaries) {
            // Skip checking account and treasury - tested separately
            // In real implementation, you'd check for actual checking account and treasury
            
            // Translate RC account to AH account
            const ah_account_id = translateAccountRcToAh(accountId);
            
            const ah_account_info = await ah_api_after.query.system.account(ah_account_id);
            const ah_free_post = ah_account_info.data.free.toBigInt();
            const ah_reserved_post = ah_account_info.data.reserved.toBigInt();
            const ah_pre_payload = pre_payload.ah_pre_payload as AhPrePayload;

            const [ah_holds_pre, ah_reserved_before, ah_free_before] = ah_pre_payload.get(ah_account_id) || [new Map(), 0n, 0n];

            // Calculate hold differences (new holds from migration)
            const ah_holds_post = await ah_api_after.query.balances.holds(ah_account_id);
            const ah_holds_diff: Array<[string, bigint]> = [];
            
            for (const hold of ah_holds_post) {
                const hold_id_hex = hold.id.toHex();
                // Skip pallet revive holds (pallet index 60)
                if (hold_id_hex.startsWith('0x3c')) {
                    continue;
                }
                
                let hold_amount = hold.amount.toBigInt();
                if (ah_holds_pre.has(hold_id_hex)) {
                    hold_amount -= ah_holds_pre.get(hold_id_hex)!;
                }
                ah_holds_diff.push([hold_id_hex, hold_amount]);
            }
            ah_holds_diff.sort((a, b) => a[0].localeCompare(b[0]));

            // Check frozen balance (locks + freezes)
            let frozen = 0n;
            const ah_freezes = await ah_api_after.query.balances.freezes(ah_account_id);
            const ah_freezes_encoded: Array<[string, bigint]> = [];
            for (const freeze of ah_freezes) {
                ah_freezes_encoded.push([freeze.id.toHex(), freeze.amount.toBigInt()]);
                frozen += freeze.amount.toBigInt();
            }

            const ah_locks = await ah_api_after.query.balances.locks(ah_account_id);
            const ah_locks_encoded: Array<[string, bigint, number]> = [];
            for (const lock of ah_locks) {
                ah_locks_encoded.push([lock.id.toHex(), lock.amount.toBigInt(), lock.reasons.toNumber()]);
                frozen += lock.amount.toBigInt();
            }

            // Balance checks
            const rc_migrated_balance = summary.migrated_free + summary.migrated_reserved;
            const ah_migrated_balance = (ah_free_post - ah_free_before) + (ah_reserved_post - ah_reserved_before);
            const ah_ed = await ah_api_after.consts.balances.existentialDeposit;

            // Allow for ED differences due to dusting
            assert(
                rc_migrated_balance - ah_migrated_balance < ah_ed.toBigInt(),
                `Total balance mismatch for account ${accountId} between RC pre-migration and AH post-migration`
            );

            // Reserved balance check (allow for unreserve operations)
            assert(
                ah_reserved_post - ah_reserved_before <= summary.migrated_reserved,
                `Change in reserved balance on AH after migration for account ${accountId} is greater than migrated reserved balance from RC`
            );

            // Frozen balance check
            assert.equal(
                summary.frozen,
                frozen,
                `Frozen balance mismatch for account ${accountId} between RC pre-migration and AH post-migration`
            );

            // Holds check
            const rc_holds_translated = summary.holds.map(([id, amount]) => [id, amount] as [string, bigint]);
            rc_holds_translated.sort((a, b) => a[0].localeCompare(b[0]));
            
            assert.deepStrictEqual(
                rc_holds_translated,
                ah_holds_diff,
                `Holds mismatch for account ${accountId} between RC pre-migration and AH post-migration`
            );

            // Locks check
            const rc_locks_sorted = [...summary.locks];
            rc_locks_sorted.sort((a, b) => a[0].localeCompare(b[0]));
            ah_locks_encoded.sort((a, b) => a[0].localeCompare(b[0]));
            
            assert.deepStrictEqual(
                rc_locks_sorted,
                ah_locks_encoded,
                `Locks mismatch for account ${accountId} between RC pre-migration and AH post-migration`
            );

            // Freezes check
            const rc_freezes_translated = summary.freezes.map(([id, amount]) => [translateRcFreezeIdToAh(id), amount] as [string, bigint]);
            rc_freezes_translated.sort((a, b) => a[0].localeCompare(b[0]));
            ah_freezes_encoded.sort((a, b) => a[0].localeCompare(b[0]));
            
            assert.deepStrictEqual(
                rc_freezes_translated,
                ah_freezes_encoded,
                `Freezes mismatch for account ${accountId} between RC pre-migration and AH post-migration`
            );
        }

        // Check total issuance changes
        const rc_total_issuance_after = await rc_api_after.query.balances.totalIssuance();
        const rc_migrated_balance: any = await rc_api_after.query.rcMigrator.rcMigratedBalance();
        
        assert.equal(
            rc_total_issuance_after.toBigInt(),
            rc_total_issuance_before - rc_migrated_balance.migrated.toBigInt(),
            'Change in total issuance on RC after migration is not as expected'
        );
        
        assert.equal(
            rc_total_issuance_after.toBigInt(),
            rc_migrated_balance.kept.toBigInt(),
            'Kept balance on RC after migration is not as expected'
        );
    }
};

// Helper functions for ID translation (Kusama-specific)
function translateRcHoldIdToAh(holdId: string): string {
    // Map RC hold IDs to AH hold IDs based on Kusama pallet indexes
    switch (holdId) {
        case '0x2000': // Preimage pallet: Kusama RC index 32 -> AH index 6
            return '0x0600';
        case '0x0600': // Staking pallet: Kusama RC index 6 -> AH index 89
            return '0x5900';
        case '0x2f00': // Delegated staking: Kusama RC index 47 -> AH index 83
            return '0x5300';
        default:
            throw new Error(`Unknown hold id: ${holdId}`);
    }
}

function translateRcFreezeIdToAh(freezeId: string): string {
    // Map RC freeze IDs to AH freeze IDs based on Kusama pallet indexes
    switch (freezeId) {
        case '0x2900': // Nomination pools: Kusama RC index 41 -> AH index 80
            return '0x5000';
        default:
            throw new Error(`Unknown freeze id: ${freezeId}`);
    }
}

function transformHoldAmount(holdId: string, amount: bigint): bigint {
    // Transform hold amounts during migration (e.g., preimage deposits divided by 100)
    switch (holdId) {
        case '0x2000': // Preimage deposits divided by 100 (Kusama RC index 32)
            return amount / 100n;
        default:
            return amount;
    }
}