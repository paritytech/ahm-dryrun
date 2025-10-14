import "@polkadot/api-augment";
import "@polkadot/types-augment";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { logger } from "../shared/logger.js";
import { eraEventsTest } from "./pallets/staking/era_events.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Runner for era events tests using zombie-bite spawned networks
 *
 * This test expects zombie-bite spawn to be already running with the
 * extracted databases from the CI artifact containing enough blocks to accommodate a whole era.
 *
 * The test will:
 * 1. Read ports from ports.json
 * 2. Connect to running RC and AH nodes via WebSocket
 * 3. Find era start by searching backwards through block history
 * 4. Collect and validate all events from era start to era end
 */

type Network = "kusama" | "polkadot";

interface Ports {
  alice_port: number;
  collator_port: number;
}

/**
 * Read ports from zombie-bite ports.json file
 */
function readPorts(basePath: string): Ports {
  const portsFile = join(basePath, "ports.json");

  if (!existsSync(portsFile)) {
    throw new Error(
      `Ports file not found: ${portsFile}\n` +
        `Make sure zombie-bite spawn is running in ${basePath}`,
    );
  }

  try {
    const portsData = JSON.parse(readFileSync(portsFile, "utf8"));
    return {
      alice_port: portsData.alice_port,
      collator_port: portsData.collator_port,
    };
  } catch (error) {
    throw new Error(`Failed to read ports.json: ${error}`);
  }
}

/**
 * Run era events test by connecting to zombie-bite spawned network
 *
 * @param basePath - Directory containing ports.json and zombie-bite spawn artifacts
 * @param network - Network name (kusama or polkadot)
 */
export async function runEraEventsTest(
  basePath: string,
  network: Network = "kusama",
): Promise<boolean> {
  logger.info("Starting era events test (zombie-bite spawn mode)", {
    basePath,
    network,
  });

  const ports = readPorts(basePath);
  logger.info("Connecting to zombie-bite network", {
    rc_port: ports.alice_port,
    ah_port: ports.collator_port,
  });

  const rcProvider = new WsProvider(`ws://127.0.0.1:${ports.alice_port}`);
  const rcApi = await ApiPromise.create({ provider: rcProvider });

  const ahProvider = new WsProvider(`ws://127.0.0.1:${ports.collator_port}`);
  const ahApi = await ApiPromise.create({ provider: ahProvider });

  try {
    logger.info("✅ Connected to both chains");

    const context = {
      pre: {
        rc_api_before: rcApi,
        ah_api_before: ahApi,
      },
      post: {
        rc_api_after: rcApi,
        ah_api_after: ahApi,
      },
    };

    logger.info("Running era events validation...");
    const pre_payload = await eraEventsTest.pre_check(context.pre);
    await eraEventsTest.post_check(context.post, pre_payload);

    logger.info(`✅ Era events test completed successfully`);
    return true;
  } catch (error) {
    logger.error(`❌ Era events test failed:`, error);
    return false;
  } finally {
    logger.info("Disconnecting from nodes...");
    await rcApi.disconnect();
    await ahApi.disconnect();
  }
}
