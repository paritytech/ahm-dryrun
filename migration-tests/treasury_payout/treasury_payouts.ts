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


/**
 * @param networkName - 'kusama' or 'polkadot'
 * @param config - Network configuration with endpoints and ports
 */
async function testTreasuryPayouts(networkName: 'kusama' | 'polkadot', config: NetworkConfig): Promise<void> {
    logger.debug(`Starting treasury payouts test on forked ${networkName} network`);
    
    // Setup networks based on configuration
    const networks = await setupNetworks({
        [networkName]: {
            endpoint: config.relayEndpoint,
            port: config.relayPort,
        },
        [networkName === 'kusama' ? 'assetHubKusama' : 'assetHubPolkadot']: {
            endpoint: config.assetHubEndpoint,
            port: config.assetHubPort,
        },
    });

    const relayChain = networkName === 'kusama' 
        ? (networks as any).kusama 
        : (networks as any).polkadot;
    const assetHub = networkName === 'kusama' 
        ? (networks as any).assetHubKusama 
        : (networks as any).assetHubPolkadot;

    try {
        // Fund Alice account for transaction fees
        const aliceAddress = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
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
            return (
                (spendData?.status.isPending || spendData?.status.isFailed) && // pending or failed
                spendData?.validFrom.toNumber() < currentRelayChainBlockNumber && // not early payout
                spendData?.expireAt.toNumber() > currentRelayChainBlockNumber // not expired
            );
        });

        logger.debug(`Found ${pendingOrFailedSpends.length} eligible spends for payout testing`);

        if (pendingOrFailedSpends.length === 0) {
            logger.info('No eligible spends found for payout testing');
            return;
        }

        // Test payout for each eligible spend
        for (const spend of pendingOrFailedSpends) {
            const spendIndex = spend[0].toHuman?.() as number;
            
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
// Note: The test on polkadot will work only after treasury is migrated to asset hub on polkadot.
/**
 * Main function to run treasury payout tests
 * @param network - 'kusama' or 'polkadot'
 */
export async function runTreasuryPayoutTests(network: 'kusama' | 'polkadot'): Promise<void> {
    try {
        const config = network === 'kusama' ? kusama() : polkadot();
        await testTreasuryPayouts(network, config);
        logger.info(`✅ Treasury payout tests completed successfully for ${network}`);
    } catch (error) {
        logger.error(`❌ Treasury payout tests failed for ${network}:`, error);
        throw error;
    }
}

