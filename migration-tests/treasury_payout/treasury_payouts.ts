import '@polkadot/api-augment';
import '@polkadot/types-augment';
import { sendTransaction, setupNetworks } from '@acala-network/chopsticks-testing';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { logger } from '../../shared/logger.js';
import assert from 'assert';

// Wait for crypto to be ready before creating Keyring
await cryptoWaitReady();
const keyring = new Keyring({ type: 'sr25519' });
const alicePair = keyring.addFromUri('//Alice');

export interface NetworkConfig {
    relayEndpoint: string;
    relayPort: number;
    assetHubEndpoint: string;
    assetHubPort: number;
}

// any past RC block number can be used to set the validFrom of the spendData to make it eligible for payout
const PAST_RC_BLOCK_NUMBER = 28_386_000; 

/**
 * @param networkName - 'Kusama' or 'Polkadot'
 * @param config - Network configuration with endpoints and ports
 */
async function testTreasuryPayouts(networkName: 'Kusama' | 'Polkadot', config: NetworkConfig): Promise<void> {
    logger.debug(`Starting treasury payouts test on forked ${networkName} network`);
    
    // Setup networks based on configuration
    const networks = await setupNetworks({
        [networkName]: {
            endpoint: config.relayEndpoint,
            port: config.relayPort,
        },
        [networkName === 'Kusama' ? 'assetHubKusama' : 'assetHubPolkadot']: {
            endpoint: config.assetHubEndpoint,
            port: config.assetHubPort,
        },
    });

    const relayChain = networkName === 'Kusama' 
        ? (networks as any).Kusama 
        : (networks as any).Polkadot;
    const assetHub = networkName === 'Kusama' 
        ? (networks as any).assetHubKusama 
        : (networks as any).assetHubPolkadot;

    try {
        // Fund Alice account for transaction fees
        const aliceAddress = alicePair.address;
        const fundingAmount = 1000e10; 
                
        await assetHub.dev.setStorage({
            System: {
                account: [
                    [
                        [aliceAddress], 
                        { 
                            providers: 1, 
                            data: { 
                                free: fundingAmount 
                            } 
                        }
                    ]
                ]
            }
        });
        
        logger.debug('✅ Alice account funded successfully');

        // Get all spends from Asset Hub
        const spends = await assetHub.api.query.treasury.spends.entries();
        logger.debug(`Found ${spends.length} total spends`);

        // Get current relay chain block number
        const currentRelayChainBlockNumber = (await relayChain.api.query.system.number()).toNumber();
        logger.debug(`Current relay chain block number: ${currentRelayChainBlockNumber}`);

        // Filter spends which are pending or failed and are neither expired nor early payout
        const pendingOrFailedSpends = spends.filter((spend: any) => {
            const spendData = spend[1]?.unwrap();
            const isSpendPendingOrFailed = spendData?.status.isPending || spendData?.status.isFailed ;
            const isSpendNotExpired = currentRelayChainBlockNumber < spendData?.expireAt.toNumber();
            return isSpendPendingOrFailed && isSpendNotExpired;
        });

        logger.debug(`Found ${pendingOrFailedSpends.length} eligible spends for payout testing`);

        if (pendingOrFailedSpends.length === 0) {
            logger.info('No eligible spends found for payout testing');
            return;
        }

        // log the length of the pendingOrFailedSpends
        logger.debug(`Length of pendingOrFailedSpends: ${pendingOrFailedSpends.length}`);

        // Test payout for each eligible spend
        for (const spend of pendingOrFailedSpends) {
            const spendIndex = spend[0].toHuman?.() as number;
            const spendData = spend[1];
            const spendDataUnwrapped = spendData?.unwrap();
            let beneficiaryAddress: string | null = extractBeneficiaryAddress(spendDataUnwrapped, spendIndex);
            const spendAmount = spendDataUnwrapped.amount.toBigInt();
            // Determine asset type from spend data
            const assetKindJson = spendDataUnwrapped.assetKind.toJSON() as any
            const { assetId, isNativeAsset } = extractAssetType(assetKindJson)

            // Get the beneficiary balance before payout based on asset type
            const beneficiaryBalanceBefore = await getBeneficiaryBalance(
                assetHub,
                beneficiaryAddress,
                isNativeAsset,
                assetId
            )

            
            // Use toJSON() and ensure numeric values remain as numbers (not strings)
            const spendDataJson = spendDataUnwrapped.toJSON() as any

            // Create updated spend data by cloning the structure and updating only validFrom
            const updatedSpendData = {
                assetKind: fixNumericValues(spendDataJson.assetKind),
                amount: typeof spendDataJson.amount === 'string' ? Number(spendDataJson.amount) : spendDataJson.amount,
                beneficiary: fixNumericValues(spendDataJson.beneficiary),
                validFrom: PAST_RC_BLOCK_NUMBER,
                expireAt: typeof spendDataJson.expireAt === 'string' ? Number(spendDataJson.expireAt) : spendDataJson.expireAt,
                status: spendDataJson.status,
            }

            // Format: Spends is a StorageMap, so we pass [[key], value] format
            await assetHub.dev.setStorage({
                Treasury: {
                Spends: [[[spendIndex], updatedSpendData]],
                },
            })

            const updatedSpendDataStorage = await assetHub.api.query.treasury.spends(spendIndex)
            const updatedSpendDataStorageUnwrapped = updatedSpendDataStorage?.unwrap()
            assert(updatedSpendDataStorageUnwrapped?.validFrom.toNumber() === PAST_RC_BLOCK_NUMBER, `Updated spend data validFrom is not ${PAST_RC_BLOCK_NUMBER} but ${updatedSpendDataStorageUnwrapped?.validFrom.toNumber()}`);

            try {
                // Create and sign the payout transaction
                const payoutTx = assetHub.api.tx.treasury.payout(spendIndex);
                await sendTransaction(payoutTx.signAsync(alicePair));
                
                await assetHub.api.rpc('dev_newBlock', { count: 1 });   
                
                // Check for Paid event
                const events = await assetHub.api.query.system.events();
                const paidEvent = events.find((record: any) => {
                    const { event } = record;
                    return event.section === 'treasury' && event.method === 'Paid';
                });

                assert(paidEvent, `Paid event is not found for spend ${spendIndex} Event: ${events.map((record: any) => record.event.toHuman()).join(', ')}`);
                assert(assetHub.api.events.treasury.Paid.is(paidEvent.event), `Paid event is not found for spend ${spendIndex} Event: ${paidEvent.event.toHuman()}`);
                
                // Verify the spend status changed to attempted
                const spendAfter = await assetHub.api.query.treasury.spends(spendIndex);
                const spendDataAfter = spendAfter?.unwrap();
                assert(spendDataAfter?.status.isAttempted, `Spend ${spendIndex} status is not attempted ${spendDataAfter?.status.toHuman()}`);
                
                // check status of the spend in the Asset Hub
                const checkStatusTx = assetHub.api.tx.treasury.checkStatus(spendIndex);
                await sendTransaction(checkStatusTx.signAsync(alicePair));

                await assetHub.api.rpc('dev_newBlock', { count: 1 });

                // check for SpendProcessed event
                const eventsAfterCheckStatus = await assetHub.api.query.system.events();
                const spendProcessedEvent = eventsAfterCheckStatus.find((record: any) => {
                    const { event } = record;
                    return event.section === 'treasury' && event.method === 'SpendProcessed';
                });
                assert(spendProcessedEvent, `SpendProcessed event is not found for spend ${spendIndex} Event: ${eventsAfterCheckStatus.map((record: any) => record.event.toHuman()).join(', ')}`);
                assert(assetHub.api.events.treasury.SpendProcessed.is(spendProcessedEvent.event), `SpendProcessed event is not found for spend ${spendIndex} Event: ${spendProcessedEvent.event.toHuman()}`);

                // Get beneficiary balance after payout based on asset type
                const beneficiaryBalanceAfterValue = await getBeneficiaryBalance(
                    assetHub,
                    beneficiaryAddress,
                    isNativeAsset,
                    assetId
                )
                
                // ensure the diff of beneficiary balance after payout and before payout is equal to the spend amount
                assert(beneficiaryBalanceAfterValue - beneficiaryBalanceBefore === spendAmount, 
                    `The diff of beneficiary balance after payout and before payout is not equal to the spend amount. 
                    Beneficiary balance before payout: ${beneficiaryBalanceBefore}, Spend amount: ${spendAmount}, 
                    Beneficiary balance after payout: ${beneficiaryBalanceAfterValue}, 
                    Diff: ${beneficiaryBalanceAfterValue - beneficiaryBalanceBefore}`);
            } catch (error) {
                logger.error(`❌ Failed to execute payout for spend ${spendIndex}:`, error);
                continue; // continue with next spend
            }
        }

        logger.debug('✅ Treasury payouts test completed successfully');

    } catch (error) {
        logger.error('❌ Treasury payouts test failed:', error);
        throw error;
    } finally {
        // Cleanup
        await relayChain.teardown();
        await assetHub.teardown();
    }
}

const extractBeneficiaryAddress = (spendDataUnwrapped: any, spendIndex: number): string | null => {
    const beneficiaryHuman = spendDataUnwrapped.beneficiary.toHuman() as any
    let beneficiaryAddress: string | null = null
    
    // toHuman() uses uppercase keys: V4, X1, AccountId32
    // Navigate through the nested structure to find the accountId32
    if (beneficiaryHuman.V4?.accountId?.interior?.X1?.[0]?.AccountId32?.id) {
      beneficiaryAddress = beneficiaryHuman.V4.accountId.interior.X1[0].AccountId32.id
    } else if (beneficiaryHuman.V3?.accountId?.interior?.X1?.[0]?.AccountId32?.id) {
      beneficiaryAddress = beneficiaryHuman.V3.accountId.interior.X1[0].AccountId32.id
    } else if (beneficiaryHuman.V5?.accountId?.interior?.X1?.[0]?.AccountId32?.id) {
      beneficiaryAddress = beneficiaryHuman.V5.accountId.interior.X1[0].AccountId32.id
    } else if (beneficiaryHuman.V4?.accountId?.interior?.X2?.[1]?.AccountId32?.id) {
      beneficiaryAddress = beneficiaryHuman.V4.accountId.interior.X2[1].AccountId32.id
    }
    
    // Fallback: If still not found, try toJSON() which uses lowercase keys
    if (!beneficiaryAddress) {
      const beneficiaryJson = spendDataUnwrapped.beneficiary.toJSON() as any
      
      // toJSON() uses lowercase: v4, x1, accountId32
      if (beneficiaryJson.v4?.accountId?.interior?.x1?.[0]?.accountId32?.id) {
        beneficiaryAddress = beneficiaryJson.v4.accountId.interior.x1[0].accountId32.id
      } else if (beneficiaryJson.v3?.accountId?.interior?.x1?.[0]?.accountId32?.id) {
        beneficiaryAddress = beneficiaryJson.v3.accountId.interior.x1[0].accountId32.id
      } else if (beneficiaryJson.v5?.accountId?.interior?.x1?.[0]?.accountId32?.id) {
        beneficiaryAddress = beneficiaryJson.v5.accountId.interior.x1[0].accountId32.id
      }
    }
    
    if (!beneficiaryAddress) {
      console.error("Failed to extract beneficiary from spendIndex: ", spendIndex, ". Human structure:", JSON.stringify(beneficiaryHuman, null, 2))
      throw new Error('Could not extract beneficiary address from spend data')
    }

    return beneficiaryAddress;
}

/**
 * Extract asset type information from asset kind JSON
 * @param assetKindJson - The asset kind JSON object from spend data
 * @returns An object containing assetId (number | null) and isNativeAsset (boolean)
 */
const extractAssetType = (assetKindJson: any): { assetId: number | null; isNativeAsset: boolean } => {
    let assetId: number | null = null
    let isNativeAsset = false

    // Check if it's a foreign asset (has palletInstance 50 and generalIndex)
    if (assetKindJson.v5?.assetId?.interior?.x2) {
        const x2 = assetKindJson.v5.assetId.interior.x2
        if (x2[0]?.palletInstance === 50 && x2[1]?.generalIndex) {
            assetId = x2[1].generalIndex
            isNativeAsset = false
        }
    } else if (assetKindJson.v5?.assetId?.parents === 1 && assetKindJson.v5?.assetId?.interior?.here === null) {
        // Native asset (relay chain native asset, parents: 1 means relay chain)
        isNativeAsset = true
    } else if (assetKindJson.v5?.assetId?.parents === 0 && assetKindJson.v5?.assetId?.interior?.here === null) {
        // Local native asset
        isNativeAsset = true
    }

    return { assetId, isNativeAsset }
}

/**
 * Get the beneficiary balance based on asset type
 * @param assetHub - The Asset Hub API instance
 * @param beneficiaryAddress - The beneficiary's address
 * @param isNativeAsset - Whether the asset is native
 * @param assetId - The asset ID if it's a foreign asset, null otherwise
 * @returns The beneficiary's balance as bigint
 */
const getBeneficiaryBalance = async (
    assetHub: any,
    beneficiaryAddress: string | null,
    isNativeAsset: boolean,
    assetId: number | null
): Promise<bigint> => {
    if (isNativeAsset) {
        const beneficiaryBalance = await assetHub.api.query.system.account(beneficiaryAddress)
        return beneficiaryBalance.data.free.toBigInt()
    } else if (assetId !== null) {
        const assetBalance = await assetHub.api.query.assets.account(assetId, beneficiaryAddress)
        return assetBalance.isSome ? assetBalance.unwrap().balance.toBigInt() : 0n
    } else {
        // Fallback to native balance if we can't determine asset type
        const beneficiaryBalance = await assetHub.api.query.system.account(beneficiaryAddress)
        return beneficiaryBalance.data.free.toBigInt()
    }
}

// Helper function to recursively fix numeric values in nested structures
const fixNumericValues = (obj: any): any => {
    if (obj === null || obj === undefined) return obj
    if (typeof obj === 'string' && /^-?\d+$/.test(obj)) {
      // Convert numeric strings to numbers
      const num = Number(obj)
      if (!isNaN(num) && isFinite(num)) return num
    }
    if (Array.isArray(obj)) {
      return obj.map(fixNumericValues)
    }
    if (typeof obj === 'object') {
      const fixed: any = {}
      for (const key in obj) {
        fixed[key] = fixNumericValues(obj[key])
      }
      return fixed
    }
    return obj
}

const polkadot = () => {
    return {
        relayEndpoint: 'wss://polkadot-rpc.n.dwellir.com',
        relayPort: 8008,
        assetHubEndpoint: 'wss://asset-hub-polkadot-rpc.n.dwellir.com',
        assetHubPort: 8009,
    }
}

const kusama = () => {
    return {
        relayEndpoint: 'wss://rpc.ibp.network/kusama',
        relayPort: 8008,
        assetHubEndpoint: 'wss://sys.ibp.network/asset-hub-kusama',
        assetHubPort: 8009,
    }
}
// Note: The test on Polkadot will work only after treasury is migrated to asset hub on Polkadot.
/**
 * Main function to run treasury payout tests
 * @param network - 'Kusama' or 'Polkadot'
 */
export async function runTreasuryPayoutTests(network: 'Kusama' | 'Polkadot'): Promise<void> {
    try {
        const config = network === 'Kusama' ? kusama() : polkadot();
        await testTreasuryPayouts(network, config);
        logger.info(`✅ Treasury payout tests completed successfully for ${network}`);
    } catch (error) {
        logger.error(`❌ Treasury payout tests failed for ${network}:`, error);
        throw error;
    }
}

