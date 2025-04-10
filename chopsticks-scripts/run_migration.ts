import { setupNetworks } from "@acala-network/chopsticks-testing";
import * as dotenv from 'dotenv';

dotenv.config();
const { polkadot, assetHub } = await setupNetworks({
    polkadot: {
        endpoint: process.env.POLKADOT_ENDPOINT || `ws://localhost:${process.env.RELAY_NODE_RPC_PORT}`,
        // endpoint: "wss://polkadot.rpc.permanence.io",
        // resumes from the highest block.
        // resume: true,
        // setupNetworks invokes dev.newBlock to override the wasm, so blocks in the db start from block+1
        block: process.env.POLKADOT_BLOCK_NUMBER_PRE,
        "wasm-override": "runtime_wasm/polkadot_runtime.compact.compressed.wasm",
        // 'runtime-log-level': 5,
        // "prefetch-storages": ["0x"], // universal prefix
        db: "./dbs/polkadot.sqlite",
        port: 8000,
    },
    assetHub: {
        endpoint:
            process.env.POLKADOT_ASSET_HUB_ENDPOINT || `ws://localhost:${process.env.AH_NODE_RPC_PORT}`,
            // "wss://polkadot-asset-hub-rpc.polkadot.io",
        // resumes from the highest block.
        // resume: true,
        // setupNetworks invokes dev.newBlock to override the wasm, so blocks in the db start from block+1
        block: process.env.POLKADOT_ASSET_HUB_BLOCK_NUMBER_PRE,
        "wasm-override":
            "runtime_wasm/asset_hub_polkadot_runtime.compact.compressed.wasm",
        // "prefetch-storages": ["0x"],
        // 'runtime-log-level': 5,
        db: "./dbs/polkadot-asset-hub.sqlite",
        port: 8001,
    },
});

let rcAccBefore = (
    await polkadot.api.query.system.account(
        "5Ee7mSUN7p9YGqzthB1uCbQPMo9zC2Z2Yv5b2nsHKDzmtseR",
    )
).data;
let ahAccBefore = (
    await assetHub.api.query.system.account(
        "5Ee7mSUN7p9YGqzthB1uCbQPMo9zC2Z2Yv5b2nsHKDzmtseR",
    )
).data;
console.log("rcAccBefore: ", rcAccBefore.toHuman());
console.log("ahAccBefore: ", ahAccBefore.toHuman());

let ahMigrationStage = (
    await assetHub.api.query.ahMigrator.ahMigrationStage()
).toHuman();
let rcMigrationStage = (
    await polkadot.api.query.rcMigrator.rcMigrationStage()
).toHuman();
let rcStageName = rcMigrationStage ? Object.keys(rcMigrationStage)[0] : null;

for (let i = 0; i < 3; i++) {
    await polkadot.dev.newBlock();

    ahMigrationStage = (
        await assetHub.api.query.ahMigrator.ahMigrationStage()
    ).toHuman();
    // console.log('new AH migration stage is ', ahMigrationStage);

    rcMigrationStage = (
        await polkadot.api.query.rcMigrator.rcMigrationStage()
    ).toHuman();
    // console.log('new RC migration stage is ', rcMigrationStage);
    rcStageName = rcMigrationStage ? Object.keys(rcMigrationStage)[0] : null;
}

console.log("migration has finished");

let rcAccAfter = (
    await polkadot.api.query.system.account(
        "5Ee7mSUN7p9YGqzthB1uCbQPMo9zC2Z2Yv5b2nsHKDzmtseR",
    )
).data;
let ahAccAfter = (
    await assetHub.api.query.system.account(
        "5Ee7mSUN7p9YGqzthB1uCbQPMo9zC2Z2Yv5b2nsHKDzmtseR",
    )
).data;
console.log("rcAccAfter: ", rcAccAfter.toHuman());
console.log("ahAccAfter: ", ahAccAfter.toHuman());
