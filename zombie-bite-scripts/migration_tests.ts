import fs from "fs";
import { logger } from "../shared/logger.js";
import { main as migrationTestMain } from "../migration-tests/lib.js";

/*
 * Wrapper to call the `main` fn (defined in migration-tets directory)
 * accept 1 positional argument
 * maybe_network_or_path: The 'network' to use (at the moment only westend is supported) or the directoy used to spawn the network (e.g used by the orchestrator)
 * _NOTE_: This directory should contain 3 files (ports.json, ready.json, migration_done.json)
 *
 */

const westend =  () => {
    return {
      rc_endpoint: 'wss://westend-rpc.polkadot.io',
      rc_before: 26041702, // westend RC before first migration
      // https://westend.subscan.io/event?page=1&time_dimension=date&module=rcmigrator&event_id=assethubmigrationfinished
      rc_after: 26071771, // westend RC after migration
      ah_endpoint: 'wss://westend-asset-hub-rpc.polkadot.io',
      ah_before: 11716733, // wah before first migration started
      ah_after: 11736597, // wah after second migration ended
    }
};

const extractFromPath = (base_path: string) => {
  let ports = JSON.parse(fs.readFileSync(`${base_path}/ports.json`, "utf-8"));
  let start_blocks = JSON.parse(
    fs.readFileSync(`${base_path}/ready.json`, "utf-8"),
  );
  let end_blocks = JSON.parse(
    fs.readFileSync(`${base_path}/migration_done.json`, "utf-8"),
  );

  let alice_port = parseInt(ports.alice_port, 10);
  const rc_endpoint = `ws://localhost:${alice_port}`;
  const rc_before = parseInt(start_blocks.rc_start_block, 10) + 2;
  const rc_after = parseInt(end_blocks.rc_finish_block, 10);

  let collator_port = parseInt(ports.collator_port, 10);
  const ah_endpoint = `ws://localhost:${collator_port}`;
  const ah_before = parseInt(start_blocks.ah_start_block, 10) + 2;
  const ah_after = parseInt(end_blocks.ah_finish_block, 10);

  return {
    rc_endpoint,
    rc_before,
    rc_after,
    ah_endpoint,
    ah_before,
    ah_after
  }
}

const NETWORKS: Record<string, Function> = {
    "westend": westend,
};
const DEFAULT_NETWORK = "westend";

const main = async () => {
  let maybe_network_or_path = process.argv[2];
<<<<<<< HEAD
  let network = process.argv[3] || DEFAULT_NETWORK;
=======
  let network = process.argv[3]  || DEFAULT_NETWORK;
  // ensure capitalized
  network = network.charAt(0).toUpperCase() + network.slice(1);
>>>>>>> main
  
  if(!maybe_network_or_path) {
    logger.warn(`⚠️ No path or network was provided, using default (${DEFAULT_NETWORK}) ⚠️`);
    maybe_network_or_path = DEFAULT_NETWORK
    network = DEFAULT_NETWORK;
  }

  const getInfoFn = NETWORKS[maybe_network_or_path] ? NETWORKS[maybe_network_or_path] : () => extractFromPath(maybe_network_or_path);

  const {
    rc_endpoint,
    rc_before,
    rc_after,
    ah_endpoint,
    ah_before,
    ah_after
  } = getInfoFn();

  // TODO: add network (default is Westend) parameter to the main function
  let errs = await migrationTestMain(
    rc_endpoint,
    rc_before,
    rc_after,
    ah_endpoint,
    ah_before,
    ah_after,
    network as "Westend" | "Paseo" | "Kusama" | "Polkadot"
  );

  process.exit(errs.length);
};

main().catch((error) => {
  const errorInfo = error instanceof Error 
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    : { 
        error: String(error) 
      };
      
  logger.error('Migration tests error', { 
    service: "ahm",
    error: errorInfo 
  });
});
