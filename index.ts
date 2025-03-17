import { test } from "bun:test";
import { setupNetworks } from '@acala-network/chopsticks-testing'

// run it with bun test ./index.ts --timeout=22000000
// 22000000 miliseconds ~ 6.1 hours which should be enough (in theory) to run accounts migration
test('test migration run', async() => {
    const {polkadot, assetHub} = await setupNetworks({
        polkadot: {
            endpoint: 'wss://polkadot.rpc.permanence.io',
            // resumes from the highest block.
            resume: true,
            // setupNetworks invokes dev.newBlock to override the wasm, so blocks in the db start from block+1
            // block: 25172409, -- initial block
            'wasm-override': 'runtime_wasm/polkadot_runtime.compact.compressed.wasm',
            // 'runtime-log-level': 5,
            'fetch-storages': '0x', // universal prefix
            db: './rc-db.sqlite',
            port: 8000,
        },
        assetHub: {
            endpoint: 'wss://polkadot-asset-hub-rpc.polkadot.io',
            // resumes from the highest block.
            resume: true,
            // setupNetworks invokes dev.newBlock to override the wasm, so blocks in the db start from block+1
            // block: 8433079, -- initial block
            'wasm-override': 'runtime_wasm/asset_hub_polkadot_runtime.compact.compressed.wasm',
            'fetch-storages': '0x',
            // 'runtime-log-level': 5,
            db: './ah-db.sqlite',
            port: 8001,
        },
    });

    let ahMigrationStage = (await assetHub.api.query.ahMigrator.ahMigrationStage()).toHuman();
    let rcMigrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
    let rcStageName = rcMigrationStage ? Object.keys(rcMigrationStage)[0] : null;

    while (rcStageName == 'AccountsMigrationOngoing') {
        await polkadot.dev.newBlock();

        ahMigrationStage = (await assetHub.api.query.ahMigrator.ahMigrationStage()).toHuman();
        console.log('new AH migration stage is ', ahMigrationStage);

        rcMigrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
        console.log('new RC migration stage is ', rcMigrationStage);
        rcStageName = rcMigrationStage ? Object.keys(rcMigrationStage)[0] : null;
    }

    console.log('migration has finished');
});