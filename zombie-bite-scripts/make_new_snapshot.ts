import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Get base path from command line args
const basePath = process.argv[2];

if (!basePath) {
  console.error("Usage: node make_new_snapshot.js <base_path>");
  process.exit(1);
}

async function getAHPort(basePath: string): Promise<number> {
    try {
      const portsFile = join(basePath, "ports.json");
      const ports = JSON.parse(readFileSync(portsFile, 'utf8'));
      return ports.collator_port;
    } catch (error) {
      console.error("Could not read ports.json, using default port 63170");
      return 63170; // Default AH port
    }
  }

async function main() {
  // Connect to asset hub node!
  const ahPort = await getAHPort(basePath);
  const wsProvider = new WsProvider(`ws://127.0.0.1:${ahPort}`);
  const api = await ApiPromise.create({ provider: wsProvider });


  let wantActiveEra = -1;
  console.log(`⏳ Waiting until CurrentEra == ActiveEra + 1`);

  // Subscribe to new blocks
  const unsub = await api.rpc.chain.subscribeNewHeads(async () => {

    const era = await api.query.staking.currentEra();
    const currentEraNum = era.unwrap().toNumber();
    const currentBlock = await api.rpc.chain.getBlock();
    const activeEra = await api.query.staking.activeEra();
    const activeEraNum = activeEra.unwrap().index;


    if (currentEraNum === activeEraNum.toNumber() + 1) {
      wantActiveEra = activeEraNum.toNumber() + 1;
      

      console.log(`🎯 CurrentEra == ActiveEra + 1`);
      console.log(`🚀 Test starts on block: ${currentBlock.block.header.number}`);

    } else if (wantActiveEra !== -1) {
      if (activeEraNum.toNumber() === wantActiveEra) {
        console.log(`🎯 ActiveEra == ${wantActiveEra}`);
        console.log(`🚀 Test finished on block: ${currentBlock.block.header.number}`);
        const stopFile = join(basePath, "stop.txt"); 
        writeFileSync(stopFile, "");
        await unsub();
        await api.disconnect();
        process.exit(0);
      }
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


