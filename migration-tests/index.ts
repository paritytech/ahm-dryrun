import '@polkadot/api-augment';
import '@polkadot/types-augment';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { MigrationTest, TestContext } from './types.js';
import { vestingTests } from './pallets/vesting.js';
// import { bountiesTests } from './pallets/bounties.js';

export const tests: MigrationTest[] = [
    // bountiesTests,
    vestingTests
];

export async function runTests(context: TestContext) {
    for (const test of tests) {
        let stage = 'pre-check';
        
        try {
            const pre_payload = await test.pre_check(context.pre);
            stage = 'post-check';
            await test.post_check(context.post, pre_payload);

            console.log(`✅ Test ${test.name} test completed successfully`);
        } catch (error: unknown) {
            console.error(`❌ Test '${test.name}' failed during ${stage}:`);
            console.error(error);
        }
    }
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

interface ChainConfig {
    endpoint: string;
    before_block: number;
    after_block: number;
}

async function setupTestContext(): Promise<{ context: TestContext; apis: ApiPromise[] }> {
    const relayChainConfig: ChainConfig = {
        endpoint: 'wss://westend-rpc.dwellir.com',
        before_block: 26041702, // westend RC before first migration
        // https://westend.subscan.io/event?page=1&time_dimension=date&module=rcmigrator&event_id=assethubmigrationfinished
        after_block: 26071771, // westend RC after migration
    };

    const assetHubConfig: ChainConfig = {
        endpoint: 'wss://asset-hub-westend-rpc.dwellir.com',
        before_block: 11716733, // wah before first migration started
        after_block: 11736597, // wah after second migration ended
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
            rc_api_after,
            ah_api_after,
        }
    };

    return { context, apis: [rc_api, ah_api] };
}