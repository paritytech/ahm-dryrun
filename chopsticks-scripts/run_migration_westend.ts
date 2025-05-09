import { sendTransaction, setupNetworks, testingPairs } from "@acala-network/chopsticks-testing";
import * as dotenv from 'dotenv';
import type { KeyringPair } from '@polkadot/keyring/types'

dotenv.config();
const { polkadot, assetHub } = await setupNetworks({
    polkadot: {
        endpoint: `ws://localhost:${process.env.RELAY_NODE_RPC_PORT}`, 
        // block: 25945950,
        "wasm-override": "runtime_wasm/westend_runtime.compact.compressed.wasm",
        "prefetch-storages": ["0x"], // universal prefix
        db: "./dbs/westend.sqlite",
        port: 8002,
        timeout: 999999999999,
        maxMemoryBlockCount: 99999999999,
        runtimeLogLevel: 4,
        'rpc-timeout': 999999999999,
        'build-block-mode': "Instant"
    },
    assetHub: {
        endpoint: `ws://localhost:${process.env.AH_NODE_RPC_PORT}`, 
        // block: 11651240,
        "wasm-override": "runtime_wasm/asset_hub_westend_runtime.compact.compressed.wasm",
        "prefetch-storages": ["0x"],
        db: "./dbs/westend-asset-hub.sqlite",
        port: 8003,
        timeout: 999999999999,
        maxMemoryBlockCount: 99999999999,
        runtimeLogLevel: 4,
        'rpc-timeout': 999999999999,
        'build-block-mode': "Instant"
    },
});

export const defaultAccounts: {
    alice: KeyringPair
  } = testingPairs('sr25519')

async function getRcMigrationState() {
    return (await polkadot.api.query.rcMigrator.rcMigrationStage()).toHuman()
}

async function getAhMigrationState() {
    return (await assetHub.api.query.ahMigrator.ahMigrationStage()).toHuman()
}

await polkadot.dev.setStorage({
    System: {
      Account: [
        [
          [defaultAccounts.alice.address],
          { providers: 1, data: { free: 1000e10 }, }
        ],
      ],
    },
  });

await polkadot.dev.setStorage({
    Sudo: {
        Key: defaultAccounts.alice.address,
    },
});

console.log("ahMigrationStage: ", await getAhMigrationState());
console.log("rcMigrationStage: ", await getRcMigrationState());

const startMigrationTx = polkadot.api.tx.sudo.sudo((polkadot.api.tx.rcMigrator.startDataMigration()))
const startMigrationEvents = await sendTransaction(startMigrationTx.signAsync(defaultAccounts.alice))

while ((await getRcMigrationState()) != "MigrationDone") {
    await polkadot.dev.newBlock()
    await assetHub.dev.newBlock()

    console.log("ahMigrationStage: ", await getAhMigrationState());
    console.log("rcMigrationStage: ", await getRcMigrationState());
}

await polkadot.dev.newBlock()
await assetHub.dev.newBlock()

console.log("ahMigrationStage: ", await getAhMigrationState());
console.log("rcMigrationStage: ", await getRcMigrationState());