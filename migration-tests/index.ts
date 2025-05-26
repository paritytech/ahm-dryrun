import '@polkadot/api-augment';
import '@polkadot/types-augment';
import { config } from 'dotenv';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { TestContext, PalletTest } from './types.js';
import { vestingTests } from './pallets/vesting.js';

// Array of all pallet tests
const palletTests: PalletTest[] = [vestingTests];

async function runTests(context: TestContext) {
    console.log('Starting migration verification tests...\n');
    let passed = 0;
    let failed = 0;

    for (const test of palletTests) {
        console.log(`Running tests for ${test.pallet_name} pallet:`);
        
        try {
            console.log(`Running pre-migration checks...`);
            await test.pre_check(context.pre);
            console.log(`✅ Pre-migration checks passed\n`);
            
            console.log(`Running post-migration checks...`);
            await test.post_check(context.post);
            console.log(`✅ Post-migration checks passed\n`);
            
            passed++;
        } catch (error) {
            console.error(`❌ ${test.pallet_name} pallet tests failed:`);
            console.error(error);
            console.error('\n');
            failed++;
        }
    }

    console.log('Test Summary:');
    console.log(`Total pallets tested: ${palletTests.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        process.exit(1);
    }
}

interface ChainConfig {
    endpoint: string;
    before_block: number;
    after_block: number;
}

async function setupTestContext(): Promise<{ context: TestContext; apis: ApiPromise[] }> {
    config();
    const relayChainConfig: ChainConfig = {
        endpoint: process.env.WESTEND_ENDPOINT || 'wss://westend-rpc.dwellir.com',
        before_block: process.env.WESTEND_BLOCK_NUMBER_PRE ? parseInt(process.env.WESTEND_BLOCK_NUMBER_PRE) : 26041702,
        after_block: process.env.WESTEND_BLOCK_NUMBER ? parseInt(process.env.WESTEND_BLOCK_NUMBER) : 26071771,
    };

    const assetHubConfig: ChainConfig = {
        endpoint: process.env.WESTEND_ASSET_HUB_ENDPOINT || 'wss://asset-hub-westend-rpc.dwellir.com',
        before_block: process.env.WESTEND_ASSET_HUB_BLOCK_NUMBER_PRE ? parseInt(process.env.WESTEND_ASSET_HUB_BLOCK_NUMBER_PRE) : 11716733,
        after_block: process.env.WESTEND_ASSET_HUB_BLOCK_NUMBER ? parseInt(process.env.WESTEND_ASSET_HUB_BLOCK_NUMBER) : 11736597, 
    };

    // Setup Relay Chain API
    const rc_provider = new WsProvider(relayChainConfig.endpoint);
    const rc_api = await ApiPromise.create({ provider: rc_provider });

    const rc_block_hash_before = await rc_api.rpc.chain.getBlockHash(relayChainConfig.before_block);
    const rc_api_before = await rc_api.at(rc_block_hash_before);

    const rc_block_hash_after = await rc_api.rpc.chain.getBlockHash(relayChainConfig.after_block);
    const rc_api_after = await rc_api.at(rc_block_hash_after);

    // Setup Asset Hub API
    const ah_provider = new WsProvider(assetHubConfig.endpoint);
    const ah_api = await ApiPromise.create({ provider: ah_provider });

    const ah_block_hash_before = await ah_api.rpc.chain.getBlockHash(assetHubConfig.before_block);
    const ah_api_before = await ah_api.at(ah_block_hash_before);

    const ah_block_hash_after = await ah_api.rpc.chain.getBlockHash(assetHubConfig.after_block);
    const ah_api_after = await ah_api.at(ah_block_hash_after);

    const context: TestContext = {
        pre: {
            rc_api_before,
            ah_api_before,
        },
        post: {
            rc_api_before,
            ah_api_before,
            rc_api_after,
            ah_api_after,
        }
    };

    return { context, apis: [rc_api, ah_api] };
}

async function main() {
    const { context, apis } = await setupTestContext();

    // to correctly state assert, the best is to take Westend before 1st and WAH after 2nd, 
    // though knowing that between 1st and 2nd migration in WAH, few users might have added few things 
    // so a small mismatch might be expected.
    await runTests(context);

    // Disconnect all APIs
    await Promise.all(apis.map(api => api.disconnect()));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}); 