import '@polkadot/api-augment';
import '@polkadot/types-augment';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { MigrationTest, TestContext } from './types.js';
import { vestingTests } from './pallets/vesting.js';
// import { bountiesTests } from './pallets/bounties.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
    .option('zb-rc-port', {
        type: 'number',
        description: 'Zombie-bite Relay Chain port',
    })
    .option('zb-ah-port', {
        type: 'number',
        description: 'Zombie-bite Asset Hub port',
    })
    .option('rc-before-block', {
        type: 'number',
        description: 'Relay Chain before block',
    })
    .option('rc-after-block', {
        type: 'number',
        description: 'Relay Chain after block',
    })
    .option('ah-before-block', {
        type: 'number',
        description: 'Asset Hub before block',
    })
    .option('ah-after-block', {
        type: 'number',
        description: 'Asset Hub after block',
    })
    .check((argv: { 
        'zb-rc-port'?: number, 
        'zb-ah-port'?: number,
        'rc-before-block'?: number,
        'rc-after-block'?: number,
        'ah-before-block'?: number,
        'ah-after-block'?: number 
    }) => {
        // Validate ports if provided
        if (argv['zb-rc-port'] && (argv['zb-rc-port'] < 1 || argv['zb-rc-port'] > 65535)) {
            argv['zb-rc-port'] = undefined;
            console.warn('Invalid RC port, falling back to default endpoint');
        }
        if (argv['zb-ah-port'] && (argv['zb-ah-port'] < 1 || argv['zb-ah-port'] > 65535)) {
            argv['zb-ah-port'] = undefined;
            console.warn('Invalid AH port, falling back to default endpoint');
        }

        // Validate block order and use `undefined` (or default) if invalid
        if (argv['rc-before-block'] !== undefined && argv['rc-after-block'] !== undefined) {
            if (argv['rc-before-block'] >= argv['rc-after-block']) {
                argv['rc-before-block'] = undefined;
                argv['rc-after-block'] = undefined;
                console.warn('Invalid RC block order, falling back to defaults');
            }
        }

        if (argv['ah-before-block'] !== undefined && argv['ah-after-block'] !== undefined) {
            if (argv['ah-before-block'] >= argv['ah-after-block']) {
                argv['ah-before-block'] = undefined;
                argv['ah-after-block'] = undefined;
                console.warn('Invalid AH block order, falling back to defaults');
            }
        }

        return true;
    })
    .parseSync();

export const tests: MigrationTest[] = [
    // bountiesTests,
    vestingTests,
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

function getChainConfigs(): { relay: ChainConfig, assetHub: ChainConfig } {
    const relayChainConfig: ChainConfig = {
        endpoint: argv['zb-rc-port'] 
            ? `ws://localhost:${argv['zb-rc-port']}`
            : 'wss://westend-rpc.polkadot.io',
        before_block: argv['rc-before-block'] ?? 26041702,
        after_block: argv['rc-after-block'] ?? 26071771,
    };

    const assetHubConfig: ChainConfig = {
        endpoint: argv['zb-ah-port'] 
            ? `ws://localhost:${argv['zb-ah-port']}`
            : 'wss://westend-asset-hub-rpc.polkadot.io',
        before_block: argv['ah-before-block'] ?? 11716733,
        after_block: argv['ah-after-block'] ?? 11736597,
    };

    return { relay: relayChainConfig, assetHub: assetHubConfig };
}

async function setupTestContext(): Promise<{ context: TestContext; apis: ApiPromise[] }> {
    const { relay, assetHub } = getChainConfigs();

    // Setup Relay Chain API
    const rc_api = await ApiPromise.create({ provider: new WsProvider(relay.endpoint) });

    const rc_block_hash_before = await rc_api.rpc.chain.getBlockHash(relay.before_block);
    const rc_api_before = await rc_api.at(rc_block_hash_before);

    const rc_block_hash_after = await rc_api.rpc.chain.getBlockHash(relay.after_block);
    const rc_api_after = await rc_api.at(rc_block_hash_after);

    // Setup Asset Hub API
    const ah_api = await ApiPromise.create({ provider: new WsProvider(assetHub.endpoint) });

    const ah_block_hash_before = await ah_api.rpc.chain.getBlockHash(assetHub.before_block);
    const ah_api_before = await ah_api.at(ah_block_hash_before);

    const ah_block_hash_after = await ah_api.rpc.chain.getBlockHash(assetHub.after_block);
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