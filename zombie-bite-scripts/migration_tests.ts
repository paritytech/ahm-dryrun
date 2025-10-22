import fs from "fs";
import { logger } from "../shared/logger.js";
import { main as migrationTestMain } from "../migration-tests/lib.js";

/*
 * Wrapper to call the `main` fn (defined in migration-tets directory)
 * accept 1 positional argument
 * maybe_network_or_path: The 'network' to use (at the moment only westend is supported) or the directoy used to spawn the network (e.g used by the orchestrator)
 * _NOTE_: This directory should contain 1 file -- ports.json which contains the ports for the RC and AH.
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

const kusama =  () => {
    return {
      rc_endpoint: 'wss://kusama-rpc.n.dwellir.com',
      rc_before: 30423691,
      rc_after: 30425590,
      ah_endpoint: 'wss://asset-hub-kusama-rpc.n.dwellir.com',
      ah_before: 11150168,
      ah_after: 11151931,
    }
};

const getEndpoints = (base_path: string) => {
  let ports = JSON.parse(fs.readFileSync(`${base_path}/ports.json`, "utf-8"));

  let alice_port = parseInt(ports.alice_port, 10);
  const rc_endpoint = `ws://localhost:${alice_port}`;

  let collator_port = parseInt(ports.collator_port, 10);
  const ah_endpoint = `ws://localhost:${collator_port}`;

  return {
    rc_endpoint,
    ah_endpoint,
  }
}

const NETWORKS: Record<string, Function> = {
    "westend": westend,
    "Kusama": kusama,
};
const DEFAULT_NETWORK = "Kusama";

const main = async () => {
  let maybe_network_or_path = process.argv[2];
  let network = process.argv[3]  || DEFAULT_NETWORK;
  // ensure capitalized
  network = network.charAt(0).toUpperCase() + network.slice(1);

  console.log("network", network);
  console.log("maybe_network_or_path", maybe_network_or_path);
  
  if(!maybe_network_or_path) {
    logger.warn(`⚠️ No path or network was provided, using default (${DEFAULT_NETWORK}) ⚠️`);
    maybe_network_or_path = DEFAULT_NETWORK
    network = DEFAULT_NETWORK;
  }

  const getInfoFn = NETWORKS[network] ? NETWORKS[network] : () => getEndpoints(maybe_network_or_path);

  const {
    rc_endpoint,
    ah_endpoint,
  } = getInfoFn();

  // TODO: add network (default is Westend) parameter to the main function
  let errs = await migrationTestMain(
    rc_endpoint,
    ah_endpoint,
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
