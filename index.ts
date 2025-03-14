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

    while (true) {
        const migrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
        console.log('RC migration stage is ', migrationStage);
        const AHmigrationStage = (await assetHub.api.query.ahMigrator.ahMigrationStage()).toHuman();
        console.log('AH migration stage is ', AHmigrationStage)
        await polkadot.dev.newBlock();
    }
});