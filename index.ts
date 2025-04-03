import { test } from "bun:test";
// import { setupNetworks } from '/media/serban/data/workplace/sources/chopsticks/packages/utils/src/index.ts'
import { setupNetworks } from '@acala-network/chopsticks-testing'

test('test migration', async() => {
    const {polkadot, assetHub} = await setupNetworks({
        polkadot: {
            endpoint: 'ws://localhost:9945',
            // resumes from the highest block.
            // resume: true,
            'wasm-override': 'runtime_wasm/polkadot_runtime.compact.compressed.wasm',
            // 'runtime-log-level': 5,
            db: './dbs/polkadot.sqlite',
            port: 8000,
            timeout: 600000,
        },
        assetHub: {
            endpoint: 'ws://localhost:9944',
            // resumes from the highest block.
            // resume: true,
            'wasm-override': 'runtime_wasm/asset_hub_polkadot_runtime.compact.compressed.wasm',
            // 'prefetch-storages': ['0x'],
            // 'runtime-log-level': 5,
            db: './dbs/polkadot-asset-hub.sqlite',
            port: 8001,
            timeout: 600000,
        },
    });

    console.log('Before setStorage');
    await polkadot.dev.setStorage({
        rcMigrator: {
            rcMigrationStage: 'AccountsMigrationInit',
        },
    })

    await assetHub.dev.setStorage({
        ahMigrator: {
            ahMigrationStage: 'DataMigrationOngoing',
        },
    });

    await polkadot.dev.newBlock(); // Init -> Ongoing
    await assetHub.dev.newBlock();


    let rcMigrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
    let rcStageName = rcMigrationStage ? Object.keys(rcMigrationStage)[0] : null;

    console.log('rcMigrationStage before: ', rcMigrationStage);
    while (rcStageName == 'AccountsMigrationOngoing') {
        await polkadot.dev.newBlock();
        await assetHub.dev.newBlock();

        rcMigrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
        rcStageName = rcMigrationStage ? Object.keys(rcMigrationStage)[0] : null;
        console.log('rcMigrationStage: ', rcMigrationStage);
        // asset hub's stage stays the same, no need to verify.
    }

    console.log('migration has finished');
});
