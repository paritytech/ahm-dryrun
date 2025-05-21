import '@polkadot/api-augment';
import '@polkadot/types-augment';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { ApiDecoration } from '@polkadot/api/types';
import assert from 'assert';

interface TestContext {
    rc_api_before: ApiDecoration<'promise'>;
    rc_api_after: ApiDecoration<'promise'>;
    ah_api_before: ApiDecoration<'promise'>;
    ah_api_after: ApiDecoration<'promise'>;
}

type TestCase = {
    name: string;
    run: (context: TestContext) => Promise<void>;
}

const tests: TestCase[] = [
    {
        name: 'Vesting entries emptiness check',
        run: async ({ ah_api_before, rc_api_after }) => {
            console.log('Checking vesting entries before migration...');
            const vestingEntries_before = await ah_api_before.query.vesting.vesting([]);
            assert(vestingEntries_before.isEmpty, 'Vesting entries before migration should be empty');

            const vestingEntries_after = await rc_api_after.query.vesting.vesting([]);
            assert(vestingEntries_after.isEmpty, 'Vesting entries after migration should be empty');
        }
    },
    {
        name: 'Vesting entries consistency check',
        run: async ({ rc_api_before, ah_api_after }) => {
            console.log('Checking vesting entries consistency...');
            const rc_vestingEntries_before = await rc_api_before.query.vesting.vesting.entries();
            const ah_vestingEntries_after = await ah_api_after.query.vesting.vesting.entries();

            // Check if each entry from `before` exists `after` migration with the same values
            for (const [key, value] of rc_vestingEntries_before) {
                const accountId = key.args[0].toString();
                const matchingEntry = ah_vestingEntries_after.find(([k, _]) => k.args[0].toString() === accountId);

                assert(matchingEntry !== undefined, `Account ${accountId} vesting entry not found after migration`);

                const [_, afterValue] = matchingEntry;
                assert.deepStrictEqual(
                    value.toJSON(),
                    afterValue.toJSON(),
                    `Vesting details mismatch for account ${accountId}`
                );
            }

            // Check if there are no extra entries after migration
            for (const [key, _] of ah_vestingEntries_after) {
                const accountId = key.args[0].toString();
                const matchingEntry = rc_vestingEntries_before.find(([k, _]) => k.args[0].toString() === accountId);

                assert(matchingEntry !== undefined, `Unexpected vesting entry found after migration for account ${accountId}`);
            }
        }
    }
];

async function runTests(context: TestContext) {
    console.log('Starting migration verification tests...\n');
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            console.log(`Running test: ${test.name}`);
            await test.run(context);
            console.log(`✅ ${test.name} passed\n`);
            passed++;
        } catch (error) {
            console.error(`❌ ${test.name} failed:`);
            console.error(error);
            console.error('\n');
            failed++;
        }
    }

    console.log('Test Summary:');
    console.log(`Total: ${tests.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        process.exit(1);
    }
}

async function main() {
    const rc_endpoint = 'wss://westend-rpc.dwellir.com';
    const rc_provider = new WsProvider(rc_endpoint);
    const rc_api = await ApiPromise.create({ provider: rc_provider });

    const rc_before_block = 26041702; // westend RC before first migration
    const rc_block_hash_before = await rc_api.rpc.chain.getBlockHash(rc_before_block);
    const rc_api_before = await rc_api.at(rc_block_hash_before);

    // https://westend.subscan.io/event?page=1&time_dimension=date&module=rcmigrator&event_id=assethubmigrationfinished
    const rc_after_block = 26071771; // westend RC after migration ^
    const rc_block_hash_after = await rc_api.rpc.chain.getBlockHash(rc_after_block);
    const rc_api_after = await rc_api.at(rc_block_hash_after);

    const ah_endpoint = 'wss://asset-hub-westend-rpc.dwellir.com';
    const ah_provider = new WsProvider(ah_endpoint);
    const ah_api = await ApiPromise.create({ provider: ah_provider });

    const ah_before_block = 11736080; // wah before second migration started
    const ah_block_hash_before = await ah_api.rpc.chain.getBlockHash(ah_before_block);
    const ah_api_before = await ah_api.at(ah_block_hash_before);

    const ah_after_block = 11736597; // wah after second migration ended
    const ah_block_hash_after = await ah_api.rpc.chain.getBlockHash(ah_after_block);
    const ah_api_after = await ah_api.at(ah_block_hash_after);

    const context: TestContext = {
        rc_api_before,
        rc_api_after,
        ah_api_before,
        ah_api_after
    };

    // to correctly state assert, the best is to take Westend before 1st and WAH after 2nd, 
    // though knowing that between 1st and 2nd migration in WAH, few users might have added few things 
    // so a small mismatch might be expected.
    await runTests(context);

    await rc_api.disconnect();
    await ah_api.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
