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
      console.error("Could not read ports.json, using default port 63168");
      return 63168; // Default relay chain port
    }
  }

async function main() {
  // Connect to asset hub node!
  const wsProvider = new WsProvider(`ws://127.0.0.1:63170`);
  const api = await ApiPromise.create({ provider: wsProvider });

  // Get initial era
  const currentEra = await api.query.staking.currentEra();
  const startingEra = currentEra.unwrap().toNumber();

  console.log(`Starting era: ${startingEra}`);

  // Subscribe to new blocks
  const unsub = await api.rpc.chain.subscribeNewHeads(async () => {

    const era = await api.query.staking.currentEra();
    const currentEraNum = era.unwrap().toNumber();
    const currentBlock = await api.rpc.chain.getBlock();
    const session = await api.query.session.currentIndex();
    console.log(`Current block: ${currentBlock.block.header.number}, Era: ${currentEraNum}, Session: ${session.toNumber()}`);
    

    if (currentEraNum > startingEra) {
      console.log(`Era changed from ${startingEra} to ${currentEraNum}`);
      
      const stopFile = join(basePath, "stop.txt"); 
      writeFileSync(stopFile, "");
      
      await unsub();
      await api.disconnect();
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


