import { test } from "bun:test";
import { setupNetworks } from '@acala-network/chopsticks-testing'

// run it with bun test ./index.ts --timeout=22000000
test('test migration run', async() => {
    const {polkadot, assetHub} = await setupNetworks({
        polkadot: {
            endpoint: 'wss://polkadot.rpc.permanence.io',
            block: 25100182,
            'wasm-override': 'runtime_wasm/polkadot_runtime.compact.compressed.wasm',
            'runtime-log-level': 5,
            'fetch-storages': '0x', // universal prefix
            db: './rc-db.sqlite',
            port: 8000,
        },
        assetHub: {
            endpoint: 'wss://polkadot-asset-hub-rpc.polkadot.io',
            'wasm-override': 'runtime_wasm/asset_hub_polkadot_runtime.compact.compressed.wasm',
            'fetch-storages': '0x',
            'runtime-log-level': 5,
            db: './ah-db.sqlite',
            port: 8001,
        },
    });

    let migrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
    let stageName = migrationStage ? Object.keys(migrationStage)[0] : null;

    while (stageName == 'AccountsMigrationOngoing') {
        await polkadot.dev.newBlock();

        migrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
        console.log('new RC migration stage is ', migrationStage);
        stageName = migrationStage ? Object.keys(migrationStage)[0] : null;
    }
});