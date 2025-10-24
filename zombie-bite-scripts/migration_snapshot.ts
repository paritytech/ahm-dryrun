// Take migration snapshots by scanning blocks after migration completes
//
// Strategy:
// 1. Poll (via RPC) until both chains reach MigrationDone
// 2. Scan BACKWARDS from current block to find post-migration blocks (CoolOff)
// 3. Scan FORWARDS from migration start to find pre-migration blocks
//    - RC: AccountsMigrationInit
//    - AH: DataMigrationOngoing + 1
// 4. Take all 4 snapshots when nodes are idle
//
// Usage: node dist/zombie-bite-scripts/migration_snapshot.js <base_path> <network>

import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../shared/logger.js";
import {
  isAccountsMigrationInit,
  isDataMigrationOngoing,
  isCoolOff,
  getAHPort,
  getRCPort,
} from "./helpers.js";

const execAsync = promisify(exec);

const basePath = process.argv[2];
const network = process.argv[3];
// IFF is set will exit after the migration is done.
const onlyMonit = process.argv[4];

if (!basePath || !network) {
  logger.error("Usage: node migration_snapshot.js <base_path> <network>");
  process.exit(1);
}



interface SnapshotBlocks {
  rcPreBlock: string;
  rcPreBlockNumber: number;
  ahPreBlock: string;
  ahPreBlockNumber: number;
  rcPostBlock: string;
  rcPostBlockNumber: number;
  ahPostBlock: string;
  ahPostBlockNumber: number;
}

// Create a fresh API connection for a single query, then disconnect
async function queryOnce<T>(
  port: number,
  query: (api: ApiPromise) => Promise<T>,
): Promise<T> {
  const provider = new WsProvider(`ws://127.0.0.1:${port}`, 1000, {}, 5000);
  const api = await ApiPromise.create({ provider });
  try {
    return await query(api);
  } finally {
    await api.disconnect();
  }
}

// Poll until both chains reach MigrationDone
async function waitForMigrationDone(
  rcPort: number,
  ahPort: number,
): Promise<void> {
  logger.info("Polling for migration completion...");

  const pollInterval = (process.env["AHM_BINS"] ? 1 : 5) * 60 * 1000; // 1m in ci / 5 by default
  const maxWaitTime = 12 * 60 * 60 * 1000; // 12 hours
  const startTime = Date.now();

  let rcDone = false;
  let ahDone = false;

  while (!rcDone || !ahDone) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error("Timeout waiting for migration to complete (12 hours)");
    }

    try {
      // Check RC migration stage
      if (!rcDone) {
        const [rcStage, atBlock] = await queryOnce(rcPort, async (api) => {
          const block = await api.query.system.number();
          const stage = await api.query.rcMigrator.rcMigrationStage();
          return [stage.toHuman(), block];
        });
        logger.info(`RC[#${atBlock}] migration stage: ${JSON.stringify(rcStage)}`);

        if (JSON.stringify(rcStage) === '"MigrationDone"') {
          logger.info("✅ RC migration complete!");
          rcDone = true;
        }
      }

      // Check AH migration stage
      if (!ahDone) {
        const [ahStage, atBlock] = await queryOnce(ahPort, async (api) => {
          const block = await api.query.system.number();
          const stage = await api.query.ahMigrator.ahMigrationStage();
          return [stage.toHuman(), block];
        });
        logger.info(`AH[#${atBlock}] migration stage: ${JSON.stringify(ahStage)}`);

        if (JSON.stringify(ahStage) === '"MigrationDone"') {
          logger.info("✅ AH migration complete!");
          ahDone = true;
        }
      }

      if (!rcDone || !ahDone) {
        logger.info(`Waiting ${pollInterval / 1000}s before next poll...`);
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    } catch (error) {
      logger.warn("Error polling migration status:", error);
      logger.info(`Retrying in ${pollInterval / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  logger.info("🎉 Both chains reached MigrationDone!");
}

// Scan backwards from endBlock to startBlock to find first block matching predicate
async function scanBackwards(
  port: number,
  endBlock: number,
  startBlock: number,
  predicate: (stage: any) => boolean,
  chainName: string,
  targetName: string,
): Promise<{ blockNumber: number; blockHash: string }> {
  logger.info(
    `Scanning ${chainName} backwards from block ${endBlock} to ${startBlock} for ${targetName}...`,
  );

  for (let blockNum = endBlock; blockNum >= startBlock; blockNum--) {
    if (blockNum % 100 === 0) {
      logger.debug(`${chainName} scanning block ${blockNum}...`);
    }

    try {
      const result = await queryOnce(port, async (api) => {
        const hash = await api.rpc.chain.getBlockHash(blockNum);
        const apiAt = await api.at(hash);
        const stage =
          chainName === "RC"
            ? await apiAt.query.rcMigrator.rcMigrationStage()
            : await apiAt.query.ahMigrator.ahMigrationStage();

        return {
          hash: hash.toString(),
          stage: stage.toHuman(),
        };
      });

      if (predicate(result.stage)) {
        logger.info(
          `✅ Found ${chainName} ${targetName} at block ${blockNum} (${result.hash})`,
        );
        return { blockNumber: blockNum, blockHash: result.hash };
      }
    } catch (error) {
      logger.warn(`Error scanning block ${blockNum}:`, error);
      // Continue scanning
    }
  }

  throw new Error(
    `Could not find ${chainName} ${targetName} between blocks ${startBlock}-${endBlock}`,
  );
}

// Scan forwards from startBlock to endBlock to find first block matching predicate
async function scanForwards(
  port: number,
  startBlock: number,
  endBlock: number,
  predicate: (stage: any) => boolean,
  chainName: string,
  targetName: string,
): Promise<{ blockNumber: number; blockHash: string }> {
  logger.info(
    `Scanning ${chainName} forwards from block ${startBlock} to ${endBlock} for ${targetName}...`,
  );

  for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
    if (blockNum % 100 === 0) {
      logger.debug(`${chainName} scanning block ${blockNum}...`);
    }

    try {
      const result = await queryOnce(port, async (api) => {
        const hash = await api.rpc.chain.getBlockHash(blockNum);
        const apiAt = await api.at(hash);
        const stage =
          chainName === "RC"
            ? await apiAt.query.rcMigrator.rcMigrationStage()
            : await apiAt.query.ahMigrator.ahMigrationStage();

        return {
          hash: hash.toString(),
          stage: stage.toHuman(),
        };
      });

      if (predicate(result.stage)) {
        logger.info(
          `✅ Found ${chainName} ${targetName} at block ${blockNum} (${result.hash})`,
        );
        return { blockNumber: blockNum, blockHash: result.hash };
      }
    } catch (error) {
      logger.warn(`Error scanning block ${blockNum}:`, error);
      // Continue scanning
    }
  }

  throw new Error(
    `Could not find ${chainName} ${targetName} between blocks ${startBlock}-${endBlock}`,
  );
}

async function findSnapshotBlocks(
  rcPort: number,
  ahPort: number,
): Promise<SnapshotBlocks> {
  logger.info("Finding snapshot blocks via RPC queries...");

  // Get current block numbers (after migration is done)
  const rcCurrentBlock = await queryOnce(rcPort, async (api) => {
    const header = await api.rpc.chain.getHeader();
    return header.number.toNumber();
  });
  logger.info(`RC current block: ${rcCurrentBlock}`);

  const ahCurrentBlock = await queryOnce(ahPort, async (api) => {
    const header = await api.rpc.chain.getHeader();
    return header.number.toNumber();
  });
  logger.info(`AH current block: ${ahCurrentBlock}`);

  // Get migration start blocks
  const rcStartBlockNum = await queryOnce(rcPort, async (api) => {
    const startBlock = await api.query.rcMigrator.migrationStartBlock();
    if (startBlock.isEmpty) {
      throw new Error("RC migration start block not found");
    }
    return (startBlock as any).unwrap().toNumber();
  });
  logger.info(`RC migration started at block: ${rcStartBlockNum}`);

  const ahStartBlockNum = await queryOnce(ahPort, async (api) => {
    const startBlock = await api.query.ahMigrator.migrationStartBlock();
    if (startBlock.isEmpty) {
      throw new Error("AH migration start block not found");
    }
    return (startBlock as any).unwrap().toNumber();
  });
  logger.info(`AH migration started at block: ${ahStartBlockNum}`);

  // 1. Scan backwards from current to find post-migration blocks (CoolOff)
  logger.info("=== Finding post-migration blocks (CoolOff) ===");
  const rcPost = await scanBackwards(
    rcPort,
    rcCurrentBlock,
    rcStartBlockNum,
    isCoolOff,
    "RC",
    "CoolOff (post-migration)",
  );

  const ahPost = await scanBackwards(
    ahPort,
    ahCurrentBlock,
    ahStartBlockNum,
    isCoolOff,
    "AH",
    "CoolOff (post-migration)",
  );

  // 2. Scan forwards from start to find pre-migration blocks
  logger.info("=== Finding pre-migration blocks ===");
  const rcPre = await scanForwards(
    rcPort,
    rcStartBlockNum,
    rcCurrentBlock,
    isAccountsMigrationInit,
    "RC",
    "AccountsMigrationInit (pre-migration)",
  );

  // For AH, find DataMigrationOngoing first, then use next block
  const ahDataMigrationOngoing = await scanForwards(
    ahPort,
    ahStartBlockNum,
    ahCurrentBlock,
    isDataMigrationOngoing,
    "AH",
    "DataMigrationOngoing",
  );

  // Get the block after DataMigrationOngoing
  const ahPreBlockNum = ahDataMigrationOngoing.blockNumber + 1;
  const ahPreHash = await queryOnce(ahPort, async (api) => {
    const hash = await api.rpc.chain.getBlockHash(ahPreBlockNum);
    return hash.toString();
  });
  logger.info(
    `✅ Found AH pre-migration block (DataMigrationOngoing + 1) at block ${ahPreBlockNum} (${ahPreHash})`,
  );

  return {
    rcPreBlock: rcPre.blockHash,
    rcPreBlockNumber: rcPre.blockNumber,
    ahPreBlock: ahPreHash,
    ahPreBlockNumber: ahPreBlockNum,
    rcPostBlock: rcPost.blockHash,
    rcPostBlockNumber: rcPost.blockNumber,
    ahPostBlock: ahPost.blockHash,
    ahPostBlockNumber: ahPost.blockNumber,
  };
}

async function takeAllSnapshots(
  rcPort: number,
  ahPort: number,
  blocks: SnapshotBlocks,
): Promise<void> {
  logger.info("🎯 Taking all 4 snapshots...");

  // Take RC pre-migration snapshot
  const rcPrePath = `${basePath}/${network}-rc-pre.snap`;
  logger.info(
    `Taking RC pre-migration snapshot at block ${blocks.rcPreBlockNumber} (${blocks.rcPreBlock})...`,
  );
  await execAsync(
    `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${blocks.rcPreBlock} "${rcPrePath}" 2>/dev/null`,
  );
  logger.info(`✅ RC pre-migration snapshot completed: ${rcPrePath}`);

  // Take AH pre-migration snapshot
  const ahPrePath = `${basePath}/${network}-ah-pre.snap`;
  logger.info(
    `Taking AH pre-migration snapshot at block ${blocks.ahPreBlockNumber} (${blocks.ahPreBlock})...`,
  );
  await execAsync(
    `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${blocks.ahPreBlock} "${ahPrePath}" 2>/dev/null`,
  );
  logger.info(`✅ AH pre-migration snapshot completed: ${ahPrePath}`);

  // Take RC post-migration snapshot
  const rcPostPath = `${basePath}/${network}-rc-post.snap`;
  logger.info(
    `Taking RC post-migration snapshot at block ${blocks.rcPostBlockNumber} (${blocks.rcPostBlock})...`,
  );
  await execAsync(
    `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${blocks.rcPostBlock} "${rcPostPath}" 2>/dev/null`,
  );
  logger.info(`✅ RC post-migration snapshot completed: ${rcPostPath}`);

  // Take AH post-migration snapshot
  const ahPostPath = `${basePath}/${network}-ah-post.snap`;
  logger.info(
    `Taking AH post-migration snapshot at block ${blocks.ahPostBlockNumber} (${blocks.ahPostBlock})...`,
  );
  await execAsync(
    `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${blocks.ahPostBlock} "${ahPostPath}" 2>/dev/null`,
  );
  logger.info(`✅ AH post-migration snapshot completed: ${ahPostPath}`);

  // Write snapshot info
  const snapshotInfo = {
    rc_pre_snapshot_path: rcPrePath,
    rc_pre_block_hash: blocks.rcPreBlock,
    rc_pre_block_number: blocks.rcPreBlockNumber,
    ah_pre_snapshot_path: ahPrePath,
    ah_pre_block_hash: blocks.ahPreBlock,
    ah_pre_block_number: blocks.ahPreBlockNumber,
    rc_post_snapshot_path: rcPostPath,
    rc_post_block_hash: blocks.rcPostBlock,
    rc_post_block_number: blocks.rcPostBlockNumber,
    ah_post_snapshot_path: ahPostPath,
    ah_post_block_hash: blocks.ahPostBlock,
    ah_post_block_number: blocks.ahPostBlockNumber,
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
}

async function main() {
  const ahPort = await getAHPort(basePath);
  const rcPort = await getRCPort(basePath);

  logger.info(`Using ports - RC: ${rcPort}, AH: ${ahPort}`);

  let msg = "Strategy: Poll for MigrationDone";
  if(onlyMonit == undefined) {
    msg = `${msg}, then scan for snapshot blocks.`
  }
  logger.info(msg);

  try {
    // 1. Poll until migration is done (no WebSocket subscriptions!)
    await waitForMigrationDone(rcPort, ahPort);

    // IF we are only monitoring, exit.
    if(onlyMonit) {
      process.exit(0);
    }

    // 2. Find all snapshot blocks by scanning
    const blocks = await findSnapshotBlocks(rcPort, ahPort);

    logger.info("=== Snapshot blocks found ===");
    logger.info(
      `RC pre:  block ${blocks.rcPreBlockNumber} (${blocks.rcPreBlock})`,
    );
    logger.info(
      `AH pre:  block ${blocks.ahPreBlockNumber} (${blocks.ahPreBlock})`,
    );
    logger.info(
      `RC post: block ${blocks.rcPostBlockNumber} (${blocks.rcPostBlock})`,
    );
    logger.info(
      `AH post: block ${blocks.ahPostBlockNumber} (${blocks.ahPostBlock})`,
    );

    // 3. Take all snapshots
    await takeAllSnapshots(rcPort, ahPort, blocks);

    process.exit(0);
  } catch (error) {
    logger.error("❌ Failed to create snapshots:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error("❌ Unexpected error:", err);
  process.exit(1);
});
