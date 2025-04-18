

import { setupNetworks } from "@acala-network/chopsticks-testing";
import * as dotenv from 'dotenv';
import { fetchStorages } from '@acala-network/chopsticks/utils/fetch-storages'

dotenv.config();
const { polkadot, assetHub } = await setupNetworks({
    polkadot: {
        endpoint: `ws://localhost:${process.env.RELAY_NODE_RPC_PORT}`,
        "wasm-override": "runtime_wasm/polkadot_runtime.compact.compressed.wasm",
        db: "./dbs/polkadot.sqlite",
        port: 8000,
    },
    assetHub: {
        endpoint: `ws://localhost:${process.env.AH_NODE_RPC_PORT}`,
        "wasm-override":
            "runtime_wasm/asset_hub_polkadot_runtime.compact.compressed.wasm",
        db: "./dbs/polkadot-asset-hub.sqlite",
        port: 8001,
    },
});

await fetchStorages({
   // block: process.env.POLKADOT_BLOCK_NUMBER_PRE,
   endpoint: `ws://localhost:${process.env.RELAY_NODE_RPC_PORT}`,
   dbPath: "./dbs/polkadot.sqlite",
   config: ['System', 'Balances'],
});
console.log('relay chain storage fetched');

await fetchStorages({
   // block: process.env.POLKADOT_ASSET_HUB_BLOCK_NUMBER_PRE,
   endpoint: `ws://localhost:${process.env.AH_NODE_RPC_PORT}`,
   dbPath: "./dbs/polkadot-asset-hub.sqlite",
   config: ['0x'],
});
console.log('asset hub storage fetched');


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

await polkadot.chain.newBlock(); // Init -> Ongoing
await assetHub.chain.newBlock();


let rcMigrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
let rcStageName = rcMigrationStage ? Object.keys(rcMigrationStage)[0] : null;

console.log('rcMigrationStage before: ', rcMigrationStage);
while (rcStageName == 'AccountsMigrationOngoing') {
    await polkadot.chain.newBlock();
    await assetHub.chain.newBlock();

    rcMigrationStage = (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman();
    rcStageName = rcMigrationStage ? Object.keys(rcMigrationStage)[0] : null;
    console.log('rcMigrationStage: ', rcMigrationStage);
    // asset hub's stage stays the same, no need to verify.
}
console.log('migration has finished')