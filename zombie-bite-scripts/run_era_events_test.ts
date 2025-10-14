import { runEraEventsTest } from "../migration-tests/era-events-runner.js";
import { logger } from "../shared/logger.js";

/**
 * CLI runner for era events test
 *
 * This test expects zombie-bite spawn to be already running.
 *
 * Usage:
 *   node dist/zombie-bite-scripts/run_era_events_test.js <base_path> [network]
 *
 * The test will:
 * 1. Read ports from ports.json
 * 2. Connect to running RC and AH nodes via WebSocket
 * 3. Find era start by searching backwards through block history
 * 4. Validate all staking events from era start to era end
 */

type Network = "kusama" | "polkadot";

function parseNetwork(networkArg: string): Network {
  if (networkArg === "kusama" || networkArg === "polkadot") {
    return networkArg;
  }

  throw new Error(
    `Invalid network: ${networkArg}. Must be either 'kusama' or 'polkadot'`,
  );
}

function printHelp() {
  console.log(`
Era Events Test Runner (Zombie-Bite Spawn Mode)

Prerequisites:
  - Zombie-bite must be running with extracted databases

Usage:
  node dist/zombie-bite-scripts/run_era_events_test.js <base_path> [network]

Arguments:
  base_path        - Directory containing ports.json from zombie-bite spawn
  network          - Network name: kusama or polkadot (default: kusama)

How it works:
  1. Reads ports.json to find RC (alice) and AH (collator) ports
  2. Connects to running nodes via WebSocket
  3. Searches backwards through block history to find era START
  4. Collects and validates all staking events from era START to era END
  5. Verifies complete election cycle (Snapshot → Signed → Validation → Export → Off)
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(0);
  }

  const basePath = args[0];
  const network = args[1] ? parseNetwork(args[1]) : "kusama";

  if (!basePath) {
    logger.error("Usage: node run_era_events_test.js <base_path> [network]");
    logger.error(
      "Example: node run_era_events_test.js ./kusama-post-migration-db-582592c0148bd2c1a5910ceaaa29633bd3ec4f4b kusama",
    );
    process.exit(1);
  }

  logger.info("Era Events Test Runner (Zombie-Bite Spawn Mode)", {
    basePath,
    network,
  });

  try {
    const success = await runEraEventsTest(basePath, network);
    process.exit(success ? 0 : 1);
  } catch (error: any) {
    logger.error("Error:", error.message || error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Unexpected error:", error);
  process.exit(1);
});
