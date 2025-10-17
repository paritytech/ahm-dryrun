// Monitor RC and AH migration stages and take pre/post-migration snapshots
//
// Monitor for key migration blocks, and take ALL snapshots AFTER migration completes
// This avoids RPC overload during active migration.
//
// Pre-migration blocks to capture:
//   - RC: block with state transition to AccountsMigrationInit
//   - AH: block with state transition to DataMigrationOngoing + 1
// Post-migration blocks to capture:
//   - RC: block with state transition to CoolOff
//   - AH: block with state transition to CoolOff
//
// All 4 snapshots are taken after both chains reach CoolOff
//
// Usage: node dist/zombie-bite-scripts/migration_snapshot.js <base_path> <network>

import { ApiPromise, WsProvider } from "@polkadot/api";
import type { Header } from "@polkadot/types/interfaces";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../shared/logger.js";
import {
  isAccountsMigrationInit,
  isDataMigrationOngoing,
  isCoolOff,
} from "./helpers.js";

const execAsync = promisify(exec);

// Get base path and network from command line args
const basePath = process.argv[2];
const network = process.argv[3];

if (!basePath || !network) {
  logger.error("Usage: node migration_snapshot.js <base_path> <network>");
  process.exit(1);
}

async function getAHPort(basePath: string): Promise<number> {
  try {
    const portsFile = join(basePath, "ports.json");
    const ports = JSON.parse(readFileSync(portsFile, "utf8"));
    return ports.collator_port;
  } catch (error) {
    logger.error("Could not read ports.json, using default port 63170");
    return 63170;
  }
}

async function getRCPort(basePath: string): Promise<number> {
  try {
    const portsFile = join(basePath, "ports.json");
    const ports = JSON.parse(readFileSync(portsFile, "utf8"));
    return ports.alice_port;
  } catch (error) {
    logger.error("Could not read ports.json, using default port 63168");
    return 63168;
  }
}

interface SnapshotBlocks {
  rcPreBlock: string | null;
  ahPreBlock: string | null;
  rcPostBlock: string | null;
  ahPostBlock: string | null;
}

async function main() {
  const ahPort = await getAHPort(basePath);
  const rcPort = await getRCPort(basePath);

  logger.info(`Using ports - RC: ${rcPort}, AH: ${ahPort}`);

  const blocks: SnapshotBlocks = {
    rcPreBlock: null,
    ahPreBlock: null,
    rcPostBlock: null,
    ahPostBlock: null,
  };

  // Monitor both chains and collect block hashes
  await monitorMigrationAndCollectBlocks(rcPort, ahPort, blocks);

  // Once migration is complete, take all 4 snapshots
  await takeAllSnapshots(rcPort, ahPort, blocks);
}

async function monitorMigrationAndCollectBlocks(
  rcPort: number,
  ahPort: number,
  blocks: SnapshotBlocks,
): Promise<void> {
  logger.info("Starting migration monitoring to collect snapshot blocks...");

  const rcProvider = new WsProvider(`ws://127.0.0.1:${rcPort}`);
  const rcApi = await ApiPromise.create({ provider: rcProvider });

  const ahProvider = new WsProvider(`ws://127.0.0.1:${ahPort}`);
  const ahApi = await ApiPromise.create({ provider: ahProvider });

  let rcDone = false;
  let ahDone = false;
  let ahDataMigrationOngoingBlockNumber: number | null = null;

  const timeoutHours = process.env.MIGRATION_TIMEOUT_HOURS
    ? parseInt(process.env.MIGRATION_TIMEOUT_HOURS)
    : 12;
  const timeoutMs = timeoutHours * 60 * 60 * 1000;

  const timeout = setTimeout(() => {
    logger.error(
      `⏰ Timeout waiting for migration to complete (${timeoutHours} hours)`,
    );
    process.exit(1);
  }, timeoutMs);

  // Monitor RC
  const rcUnsub = await rcApi.rpc.chain.subscribeFinalizedHeads(
    async (header: Header) => {
      if (rcDone) return;

      try {
        const apiAt = await rcApi.at(header.hash);
        const raw = await apiAt.query.rcMigrator.rcMigrationStage();
        const stage = raw.toHuman();

        logger.info(
          `RC Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        // Capture pre-migration block
        if (!blocks.rcPreBlock && isAccountsMigrationInit(stage)) {
          blocks.rcPreBlock = header.hash.toString();
          logger.info(
            `📌 RC pre-migration block captured: ${header.number} (${blocks.rcPreBlock})`,
          );
        }

        // Capture post-migration block
        if (isCoolOff(stage)) {
          if (!blocks.rcPostBlock) {
            blocks.rcPostBlock = header.hash.toString();
            logger.info(
              `📌 RC post-migration block captured: ${header.number} (${blocks.rcPostBlock})`,
            );
          }
          rcDone = true;
        }
      } catch (error) {
        logger.error("Error checking RC migration stage:", error);
      }
    },
  );

  // Monitor AH
  const ahUnsub = await ahApi.rpc.chain.subscribeFinalizedHeads(
    async (header: Header) => {
      if (ahDone) return;

      try {
        const apiAt = await ahApi.at(header.hash);
        const raw = await apiAt.query.ahMigrator.ahMigrationStage();
        const stage = raw.toHuman();

        logger.info(
          `AH Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        // Capture pre-migration block (DataMigrationOngoing + 1)
        if (!blocks.ahPreBlock) {
          if (
            isDataMigrationOngoing(stage) &&
            ahDataMigrationOngoingBlockNumber === null
          ) {
            ahDataMigrationOngoingBlockNumber = header.number.toNumber();
            logger.info(
              `🎯 AH DataMigrationOngoing detected at block ${header.number}`,
            );
          } else if (ahDataMigrationOngoingBlockNumber !== null) {
            const currentBlockNumber = header.number.toNumber();
            if (currentBlockNumber > ahDataMigrationOngoingBlockNumber) {
              blocks.ahPreBlock = header.hash.toString();
              logger.info(
                `📌 AH pre-migration block captured: ${header.number} (${blocks.ahPreBlock})`,
              );
            }
          }
        }

        // Capture post-migration block
        if (isCoolOff(stage)) {
          if (!blocks.ahPostBlock) {
            blocks.ahPostBlock = header.hash.toString();
            logger.info(
              `📌 AH post-migration block captured: ${header.number} (${blocks.ahPostBlock})`,
            );
          }
          ahDone = true;
        }
      } catch (error) {
        logger.error("Error checking AH migration stage:", error);
      }
    },
  );

  // Wait for both chains to complete
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (rcDone && ahDone) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        rcUnsub();
        ahUnsub();
        rcApi.disconnect();
        ahApi.disconnect();

        logger.info("✅ Migration complete on both chains!");
        logger.info(
          `Collected blocks - RC pre: ${blocks.rcPreBlock}, AH pre: ${blocks.ahPreBlock}, RC post: ${blocks.rcPostBlock}, AH post: ${blocks.ahPostBlock}`,
        );

        resolve();
      }
    }, 1000);
  });
}

async function takeAllSnapshots(
  rcPort: number,
  ahPort: number,
  blocks: SnapshotBlocks,
): Promise<void> {
  logger.info(
    "🎯 Taking all 4 snapshots now that migration is complete and nodes are idle...",
  );

  // Verify we have all blocks
  if (
    !blocks.rcPreBlock ||
    !blocks.ahPreBlock ||
    !blocks.rcPostBlock ||
    !blocks.ahPostBlock
  ) {
    logger.error("❌ Missing one or more snapshot blocks!");
    logger.error(JSON.stringify(blocks, null, 2));
    process.exit(1);
  }

  try {
    // Take RC pre-migration snapshot
    const rcPrePath = `${basePath}/${network}-rc-pre.snap`;
    logger.info(`Taking RC pre-migration snapshot at ${blocks.rcPreBlock}...`);
    await execAsync(
      `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${blocks.rcPreBlock} "${rcPrePath}" 2>/dev/null`,
    );
    logger.info(`✅ RC pre-migration snapshot completed: ${rcPrePath}`);

    // Take AH pre-migration snapshot
    const ahPrePath = `${basePath}/${network}-ah-pre.snap`;
    logger.info(`Taking AH pre-migration snapshot at ${blocks.ahPreBlock}...`);
    await execAsync(
      `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${blocks.ahPreBlock} "${ahPrePath}" 2>/dev/null`,
    );
    logger.info(`✅ AH pre-migration snapshot completed: ${ahPrePath}`);

    // Take RC post-migration snapshot
    const rcPostPath = `${basePath}/${network}-rc-post.snap`;
    logger.info(
      `Taking RC post-migration snapshot at ${blocks.rcPostBlock}...`,
    );
    await execAsync(
      `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${blocks.rcPostBlock} "${rcPostPath}" 2>/dev/null`,
    );
    logger.info(`✅ RC post-migration snapshot completed: ${rcPostPath}`);

    // Take AH post-migration snapshot
    const ahPostPath = `${basePath}/${network}-ah-post.snap`;
    logger.info(
      `Taking AH post-migration snapshot at ${blocks.ahPostBlock}...`,
    );
    await execAsync(
      `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${blocks.ahPostBlock} "${ahPostPath}" 2>/dev/null`,
    );
    logger.info(`✅ AH post-migration snapshot completed: ${ahPostPath}`);

    // Write snapshot info
    const snapshotInfo = {
      rc_pre_snapshot_path: rcPrePath,
      ah_pre_snapshot_path: ahPrePath,
      rc_post_snapshot_path: rcPostPath,
      ah_post_snapshot_path: ahPostPath,
      rc_pre_block_hash: blocks.rcPreBlock,
      ah_pre_block_hash: blocks.ahPreBlock,
      rc_post_block_hash: blocks.rcPostBlock,
      ah_post_block_hash: blocks.ahPostBlock,
      network: network,
      timestamp: new Date().toISOString(),
    };

    const infoPath = join(basePath, "migration_snapshot_info.json");
    writeFileSync(infoPath, JSON.stringify(snapshotInfo, null, 2));

    const markerFile = join(basePath, "migration_snapshot_done.txt");
    writeFileSync(
      markerFile,
      `All migration snapshots completed\nTimestamp: ${new Date().toISOString()}`,
    );

    logger.info("🎉 All snapshots completed successfully!");
    logger.info(`Info written to: ${infoPath}`);
    process.exit(0);
  } catch (error) {
    logger.error("❌ Failed to take snapshots:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error("❌ Unexpected error:", err);
  process.exit(1);
});
