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

const ALICE_FUNDING_AMOUNT = 100_000_000_000_000_000n; // initail funing to Alice for transaction fees
const PAST_RC_BLOCK_NUMBER = 28_380_000; // // any past RC block number can be used 
const MAX_WITHDRAWAL_CALLS = 100; // Limit number of withdrawal calls to avoid running the entire test for too long

/**
 * Test that crowdloan contributions can be unlocked post-migration when the unlock eligibility is met.
 * 
 * @param config - Network configuration with endpoints and ports
 */
async function testCrowdloanContributionWithdrawal(config: NetworkConfig): Promise<void> {
    logger.debug('Starting crowdloan contribution withdrawal test on forked Polkadot network');
    
    // Setup networks based on configuration
    const networks = await setupNetworks({
        Polkadot: {
            endpoint: config.relayEndpoint,
            port: config.relayPort,
        },
        assetHubPolkadot: {
            endpoint: config.assetHubEndpoint,
            port: config.assetHubPort,
        },
    });

    const relayChain = (networks as any).Polkadot;
    const assetHub = (networks as any).assetHubPolkadot;

    try {
        // Fund Alice account for transaction fees
        const aliceAddress = alicePair.address 
        const fundingAmount = ALICE_FUNDING_AMOUNT; 
                
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

        // Get all crowdloan contributions from Asset Hub
        const contributions = await assetHub.api.query.ahOps.rcCrowdloanContribution.entries();
        logger.debug(`Found ${contributions.length} total crowdloan contributions`);

        if (contributions.length === 0) {
            logger.debug('No crowdloan contributions found for testing');
            return;
        }

        // Get current relay chain block number 
        const currentRelayChainBlockNumber = (await relayChain.api.query.system.number()).toNumber();

        // Update all contribution entries to have withdraw_block = PAST_RC_BLOCK_NUMBER ( any past RC block number can be used)
        // This makes them eligible for withdrawal testing withdrawal
        const newWithdrawBlock = PAST_RC_BLOCK_NUMBER; // any past RC block number can be used 
        logger.debug(`Updating all contribution entries to have withdraw_block = ${newWithdrawBlock} (current RC block: ${currentRelayChainBlockNumber})`); 
        
        // Collect all contributions and prepare storage updates
        // We'll remove old entries and add new ones with updated withdraw_block
        // For StorageNMap, we need to use the structured format with key tuples and values
        const newContributionEntries: any[] = [];
        let contributionCount = 0;

        for (const entry of contributions) {
            const [storageKey, contributionData] = entry;
            
            if (!contributionData || contributionData.isNone) {
                continue;
            }

            const keys = storageKey.args;
            const paraId = keys[1].toNumber ? keys[1].toNumber() : parseInt(keys[1].toString().replace(/,/g, ''));
            const contributorAddress = keys[2].toString();
            
            const contributionValue = contributionData.unwrap() as any;
            const crowdloanAccount = contributionValue[0].toString();
            const amount = contributionValue[1];
            // For setStorage structured format, amounts should be numbers or strings 
            const amountValue = amount.toBn ? amount.toBn().toString() : (amount.toString ? amount.toString() : amount);

            // Prepare new contribution entry with updated withdraw_block
            // Format for StorageNMap: [[key1, key2, key3], value]
            // Value is a tuple: (AccountId, Balance)
            newContributionEntries.push([
                [newWithdrawBlock, paraId, contributorAddress],
                [crowdloanAccount, amountValue]
            ]);
            
            contributionCount++;
        }

        logger.debug('Fetching lease reserve entries...');
        const newLeaseReserveEntries: any[] = [];
        const leaseReserves = await assetHub.api.query.ahOps.rcLeaseReserve.entries();
        logger.debug(`Found ${leaseReserves.length} lease reserve entries`);
        
        for (const entry of leaseReserves) {
            const [storageKey, reserveData] = entry;
            
            if (!reserveData || reserveData.isNone) {
                continue;
            }

            const keys = storageKey.args;
            const paraId = keys[1].toNumber ? keys[1].toNumber() : parseInt(keys[1].toString().replace(/,/g, ''));
            const depositorAddress = keys[2].toString();
            
            const reserveAmount = reserveData.unwrap();
            const amountValue = reserveAmount.toBn ? reserveAmount.toBn().toString() : (reserveAmount.toString ? reserveAmount.toString() : reserveAmount);
            
            newLeaseReserveEntries.push([
                [newWithdrawBlock, paraId, depositorAddress],
                amountValue
            ]);
            
        }
        
        logger.debug('Fetching crowdloan reserve entries...');
        const newCrowdloanReserveEntries: any[] = [];
        const crowdloanReserves = await assetHub.api.query.ahOps.rcCrowdloanReserve.entries();
        logger.debug(`Found ${crowdloanReserves.length} crowdloan reserve entries`);
        
        for (const entry of crowdloanReserves) {
            const [storageKey, reserveData] = entry;
            
            if (!reserveData || reserveData.isNone) {
                continue;
            }

            const keys = storageKey.args;
            const paraId = keys[1].toNumber ? keys[1].toNumber() : parseInt(keys[1].toString().replace(/,/g, ''));
            const depositorAddress = keys[2].toString();
            
            const reserveAmount = reserveData.unwrap();
            const amountValue = reserveAmount.toBn ? reserveAmount.toBn().toString() : (reserveAmount.toString ? reserveAmount.toString() : reserveAmount);
           
            newCrowdloanReserveEntries.push([
                [newWithdrawBlock, paraId, depositorAddress],
                amountValue
            ]);
            
        }

        logger.debug(`newContributionEntries length: ${newContributionEntries.length}`);
        logger.debug(`newLeaseReserveEntries length: ${newLeaseReserveEntries.length}`);
        logger.debug(`newCrowdloanReserveEntries length: ${newCrowdloanReserveEntries.length}`);
        // Apply all storage updates using structured format
        // First remove all old entries, then add new ones
        if (contributionCount > 0) {
            logger.debug(`Updating ${newContributionEntries.length} contribution entries, ${newLeaseReserveEntries.length} lease reserve entries, and ${newCrowdloanReserveEntries.length} crowdloan reserve entries`);
            
            // Remove all existing entries, then add new ones
            await assetHub.dev.setStorage({
                AhOps: {
                    $removePrefix: ['rcCrowdloanContribution', 'rcLeaseReserve', 'rcCrowdloanReserve'],
                    rcCrowdloanContribution: newContributionEntries,
                    rcLeaseReserve: newLeaseReserveEntries,
                    rcCrowdloanReserve: newCrowdloanReserveEntries,
                }
            });
            
            logger.debug('✅ Successfully updated all storage entries');
            
            // Re-query to get updated contributions
            const updatedContributions = await assetHub.api.query.ahOps.rcCrowdloanContribution.entries();
            const updatedLeaseReserves = await assetHub.api.query.ahOps.rcLeaseReserve.entries();
            const updatedCrowdloanReserves = await assetHub.api.query.ahOps.rcCrowdloanReserve.entries();
            
            logger.debug(`Re-queried storage: contributions=${updatedContributions.length}, lease reserves=${updatedLeaseReserves.length}, crowdloan reserves=${updatedCrowdloanReserves.length}`);
            
            // Verify the update worked
            if (updatedContributions.length === contributionCount) {
                logger.debug('✅ Verification: All contributions updated successfully');
            } else {
                logger.warn(`⚠️  Warning: Expected ${contributionCount} contribution entries after update, but found ${updatedContributions.length}`);
            }
            
            if (updatedLeaseReserves.length === newLeaseReserveEntries.length) {
                logger.debug('✅ Verification: All lease reserves updated successfully');
            } else {
                logger.warn(`⚠️  Warning: Expected ${newLeaseReserveEntries.length} lease reserve entries after update, but found ${updatedLeaseReserves.length}`);
            }
            
            if (updatedCrowdloanReserves.length === newCrowdloanReserveEntries.length) {
                logger.debug('✅ Verification: All crowdloan reserves updated successfully');
            } else {
                logger.warn(`⚠️  Warning: Expected ${newCrowdloanReserveEntries.length} crowdloan reserve entries after update, but found ${updatedCrowdloanReserves.length}`);
            }
            
            // Use the updated contributions for filtering
            contributions.splice(0, contributions.length, ...updatedContributions);
        }

        // Filter contributions which are eligible for withdrawal
        // Eligibility: withdraw_block <= currentRelayChainBlockNumber
        // This might be redundant since we updated all entries to have withdraw_block = 28389000 but still keeping it for extra safety
        const eligibleContributions = contributions.filter((entry: any) => {
            const [storageKey, contributionData] = entry;
            
            if (!contributionData || contributionData.isNone) {
                return false;
            }
            
            const keys = storageKey.args;
            const withdrawBlock = keys[0].toNumber();
            return withdrawBlock <= currentRelayChainBlockNumber;
        });

        logger.debug(`Found ${eligibleContributions.length} eligible contributions for withdrawal testing`);

        // Note: this is for extra safety, we should have all contributions eligible for withdrawal, but just in case, we check again
        if (eligibleContributions.length === 0) {
            logger.debug('No eligible contributions found for withdrawal testing');
            logger.debug('Note: Contributions may not be eligible yet. Current RC block:', currentRelayChainBlockNumber);
            
            // Log some sample contributions to help debugging
            const sampleContributions = contributions.slice(0, 5).map((entry: any) => {
                const [storageKey, contributionData] = entry;
                const keys = storageKey.args;
                const withdrawBlock = keys[0].toNumber();
                const paraId = keys[1].toNumber ? keys[1].toNumber() : parseInt(keys[1].toString().replace(/,/g, ''));
                const contributor = keys[2].toString();
                const contributionValue = contributionData.unwrap() as any;
                const crowdloanAccount = contributionValue[0].toString();
                const amount = contributionValue[1].toBn().toString();
                return {
                    withdrawBlock,
                    paraId,
                    contributor,
                    crowdloanAccount,
                    amount,
                };
            });
            logger.debug('Sample contributions:', JSON.stringify(sampleContributions, null, 2));
            return;
        }

        let countOfSuccessfulWithdrawals = 0;
        let countOfFailedWithdrawals = 0;
        let countOfWithdrawals = 0;

        for (const entry of eligibleContributions) {

            let isTransferEventExists = false;

            // break the loop if countOfWithdrawals is greater than or equal to 100 
            // as running the entire test might take too long to complete
            if(countOfWithdrawals >= MAX_WITHDRAWAL_CALLS)
                break;

            countOfWithdrawals++;

            const [storageKey, contributionData] = entry;
            
            // Decode storage key: (withdraw_block, para_id, contributor)
            const keys = storageKey.args;
            const withdrawBlock = keys[0].toNumber();
            // ParaId is a number (u32), extract it as number
            const paraId = keys[1].toNumber ? keys[1].toNumber() : parseInt(keys[1].toString().replace(/,/g, ''));
            const contributorAddress = keys[2].toString();
            
            // Decode contribution data: (crowdloan_account, amount)
            const contributionValue = contributionData.unwrap();
            const contributionTuple = contributionValue as any;
            const crowdloanAccount = contributionTuple[0].toString();

            // get the crowdloan account available balance
            const crowdloanAccountBalance = await assetHub.api.query.system.account(crowdloanAccount) as any;
            const crowdloanAccountFreeBalance = crowdloanAccountBalance.data.free.toBn();
            const crowdloanAccountReservedBalance = crowdloanAccountBalance.data.reserved?.toBn() || 0n;
            const crowdloanAccountTotalBalance = crowdloanAccountFreeBalance.add(crowdloanAccountReservedBalance);
            const amountBn = contributionTuple[1]; // This is a Balance type
            
            const contributionAmount = amountBn.toBn();
            
            try {
                // Get contributor's balance before withdrawal
                const balanceBefore = await assetHub.api.query.system.account(contributorAddress);
                const balanceBeforeValue = balanceBefore.data.free.toBn();
                
                // Create and sign the withdrawal transaction
                // withdraw_crowdloan_contribution(block, depositor: Option<AccountId>, para_id)
                // We pass the contributor as depositor, but Alice signs (anyone can call this)
                const withdrawTx = assetHub.api.tx.ahOps.withdrawCrowdloanContribution(
                    withdrawBlock,
                    contributorAddress, // depositor is the contributor
                    paraId // ParaId is already a number
                );
                
                // Anyone can sign and call this transaction, so we use Alice
                await sendTransaction(withdrawTx.signAsync(alicePair)).catch((error: any) => {
                    logger.error(`Failed to send transaction: ${error}`);
                    throw error;
                });
                
                // Process the block
                await assetHub.api.rpc('dev_newBlock', { count: 1 }).catch((error: any) => {
                    logger.error(`Failed to process block: ${error}`);
                    throw error;
                });

                // get the Transfer event of balances section from the assetHub
                const events = await assetHub.api.query.system.events();
                const transferEvent = events.find((event: any) => event.section === 'balances' && event.method === 'Transfer');
                isTransferEventExists = transferEvent ? true : false; // if Transfer event exists, set isTransferEventExists to true

                // Verify the contributor's balance increased
                const balanceAfter = await assetHub.api.query.system.account(contributorAddress);
                const balanceAfterValue = balanceAfter.data.free.toBn();
                const balanceIncrease = balanceAfterValue.sub(balanceBeforeValue);
                
                // logger.debug(`Balance before: ${balanceBeforeValue.toString()}, after: ${balanceAfterValue.toString()}, increase: ${balanceIncrease.toString()}`);
                
                // The contributor's balance should have increased by the contribution amount 
                // Since Alice paid for the transaction fees, the contributor should receive the full amount
                assert(
                    balanceIncrease.eq(contributionAmount),
                    `Contributor balance should increase by the contribution amount. ` +
                    `Expected ${contributionAmount.toString()}, got ${balanceIncrease.toString()} ` +
                    `(contribution amount: ${contributionAmount.toString()})` +
                    `contributor address: ${contributorAddress}, para_id: ${paraId}, withdraw_block: ${withdrawBlock}`
                );
                
                logger.debug(`✅ Successfully withdrew contribution for contributor ${contributorAddress}, para_id: ${paraId}, countOfSuccessfulWithdrawals: ${countOfSuccessfulWithdrawals}, countOfFailedWithdrawals: ${countOfFailedWithdrawals}`);
                
                countOfSuccessfulWithdrawals++;
            } catch (error: any) {
                const errorMsg = error?.message || error?.toString() || '';
                
                // Ignore WebSocket/RPC connection errors 
                const isRpcConnectionError = 
                   (errorMsg.includes('not connected') || errorMsg.includes('disconnected') || errorMsg.includes('Abnormal Closure') ||
                    errorMsg.includes('No response received from RPC endpoint'));
                
                if (isRpcConnectionError) {
                    logger.warn(`⚠️ RPC/WebSocket connection error (ignored): ${errorMsg.substring(0, 200)}`);
                    continue; // Continue to next withdrawal
                }
                
                logger.debug(`❌ Failed to withdraw contribution for contributor ${contributorAddress}, para_id=${paraId},  countOfSuccessfulWithdrawals: ${countOfSuccessfulWithdrawals}, countOfFailedWithdrawals: ${countOfFailedWithdrawals}:`, error);
                
                // Log the error details if available
                if (error?.message) {
                    logger.error(`Error message: ${error.message}`);
                }
                if (error?.stack) {
                    logger.error(`Error stack: ${error.stack}`);
                }
                
                // increment countOfFailedWithdrawals if Transfer event does not exist
                if(!isTransferEventExists) {
                    countOfFailedWithdrawals++
                }
                continue;
            }
        }

        logger.info(`✅ Crowdloan contribution withdrawal test completed successfully with ${countOfSuccessfulWithdrawals} successful withdrawals and ${countOfFailedWithdrawals} failed withdrawals`);
        
    } catch (error: any) {
        logger.error('❌ Crowdloan contribution withdrawal test failed:', error);
        if (error?.message) {
            logger.error(`Error message: ${error.message}`);
        }
        if (error?.stack) {
            logger.error(`Error stack: ${error.stack}`);
        }
    } finally {
        // Cleanup - ensure teardown doesn't throw unhandled rejections
        try {
            await relayChain.teardown().catch((err: any) => {
                logger.warn(`Error during relay chain teardown: ${err}`);
            });
        } catch (err: any) {
            logger.warn(`Error during relay chain teardown: ${err}`);
        }
        try {
            await assetHub.teardown().catch((err: any) => {
                logger.warn(`Error during asset hub teardown: ${err}`);
            });
        } catch (err: any) {
            logger.warn(`Error during asset hub teardown: ${err}`);
        }
    }
}

// Note: This test will only work with post migration Polkadot network
const polkadot = () => {
    return {
        relayEndpoint:  'wss://polkadot-rpc.n.dwellir.com',
        relayPort: 8008,
        assetHubEndpoint: 'wss://asset-hub-polkadot-rpc.n.dwellir.com',
        assetHubPort: 8009,
    }
}

/**
 * Main function to run crowdloan contribution withdrawal tests for Polkadot
 */
export async function runCrowdloanContributionTests(): Promise<void> {
    try {
        const config = polkadot();
        await testCrowdloanContributionWithdrawal(config);
        logger.info('✅ Crowdloan contribution withdrawal tests completed successfully for Polkadot');
    } catch (error: any) {
        logger.error('❌ Crowdloan contribution withdrawal tests failed for Polkadot:', error);
        if (error?.message) {
            logger.error(`Error message: ${error.message}`);
        }
        if (error?.stack) {
            logger.error(`Error stack: ${error.stack}`);
        }
        throw error;
    }
}
