// Monitor RC and AH migration stages and take pre/post-migration snapshots
//
// Pre-migration:
//   - RC snapshot: taken at block with state transition to AccountsMigrationInit
//   - AH snapshot: taken at block with state transition to DataMigrationOngoing + 1
// Post-migration:
//   - RC snapshot: taken at block with state transition to CoolOff
//   - AH snapshot: taken at block with state transition to CoolOff
//
// Usage: node dist/zombie-bite-scripts/migration_snapshot.js <base_path> <network> <pre|post>

import { ApiPromise, WsProvider } from "@polkadot/api";
import type { Header } from "@polkadot/types/interfaces";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../shared/logger.js";

const execAsync = promisify(exec);

// Get base path, network, and snapshot type from command line args
const basePath = process.argv[2];
const network = process.argv[3];
const snapshotType = process.argv[4]; // 'pre' or 'post'

if (!basePath || !network || !snapshotType) {
  logger.error(
    "Usage: node migration_snapshot.js <base_path> <network> <pre|post>",
  );
  process.exit(1);
}

if (snapshotType !== "pre" && snapshotType !== "post") {
  logger.error("Error: snapshot type must be 'pre' or 'post'");
  process.exit(1);
}

async function getAHPort(basePath: string): Promise<number> {
  try {
    const portsFile = join(basePath, "ports.json");
    const ports = JSON.parse(readFileSync(portsFile, "utf8"));
    return ports.collator_port;
  } catch (error) {
    logger.error("Could not read ports.json, using default port 63170");
    return 63170; // Default AH port
  }
}

async function getRCPort(basePath: string): Promise<number> {
  try {
    const portsFile = join(basePath, "ports.json");
    const ports = JSON.parse(readFileSync(portsFile, "utf8"));
    return ports.alice_port;
  } catch (error) {
    logger.error("Could not read ports.json, using default port 63168");
    return 63168; // Default RC port
  }
}

function isAccountsMigrationInit(stage: any): boolean {
  return JSON.stringify(stage) === '"AccountsMigrationInit"';
}

function isDataMigrationOngoing(stage: any): boolean {
  return JSON.stringify(stage) === '"DataMigrationOngoing"';
}

function isCoolOff(stage: any): boolean {
  const stageStr = JSON.stringify(stage);
  return stageStr !== null && stageStr.includes('"CoolOff"');
}

// Find the AH block that corresponds to a given RC block by looking at parachain backing
async function findCorrespondingAHBlock(
  rcApi: ApiPromise,
  ahApi: ApiPromise,
  rcBlockHash: string,
): Promise<string> {
  logger.info(`Looking for AH block backed in RC block ${rcBlockHash}`);

  // Get the RC block to examine which parachain blocks were backed
  const rcBlock = await rcApi.rpc.chain.getBlock(rcBlockHash);
  const rcHeader = rcBlock.block.header;

  // Look for the AH block with validation data pointing to this RC block or nearby
  let ahCurrentHash = await ahApi.rpc.chain.getFinalizedHead();
  let attempts = 0;
  const maxAttempts = 50; // Look back further

  while (attempts < maxAttempts) {
    try {
      const ahBlock = await ahApi.rpc.chain.getBlock(ahCurrentHash);

      // Look for setValidationData extrinsic in this AH block
      for (const extrinsic of ahBlock.block.extrinsics) {
        const { method } = extrinsic;

        if (
          method.section === "parachainSystem" &&
          method.method === "setValidationData"
        ) {
          const args = method.args[0] as any;
          const relayParentNumber =
            args.validationData.relayParentNumber.toNumber();
          const rcBlockNumber = rcHeader.number.toNumber();

          logger.info(
            `Checking AH block ${ahCurrentHash}: validation parent = ${relayParentNumber}, target RC block = ${rcBlockNumber}`,
          );

          if (relayParentNumber === rcBlockNumber) {
            logger.info(
              `✅ Found exact matching AH block at ${ahCurrentHash} (AH validation parent: ${relayParentNumber}, RC block: ${rcBlockNumber})`,
            );
            return ahCurrentHash.toString();
          }
        }
      }
    } catch (error) {
      // Silent retry on error
    }

    // Move to parent AH block
    const ahHeader = await ahApi.rpc.chain.getHeader(ahCurrentHash);
    ahCurrentHash = ahHeader.parentHash;
    attempts++;
  }

  throw new Error(
    `Failed to find synchronized AH block after ${maxAttempts} attempts. ` +
      `Searched for AH block with validation parent == ${rcHeader.number.toNumber()} or ${rcHeader.number.toNumber() - 1}. ` +
      `This indicates a synchronization issue between RC and AH chains. ` +
      `RC block: ${rcBlockHash}, RC block number: ${rcHeader.number.toNumber()}`,
  );
}

// Take snapshots at a specific block hash
async function takeSnapshotsAtBlock(
  basePath: string,
  network: string,
  rcPort: number,
  ahPort: number,
  blockHash: string,
  type: "pre" | "post",
): Promise<void> {
  logger.info(
    `Taking ${type}-migration snapshots at block ${blockHash} for ${network}...`,
  );
  logger.info(`Using ports - RC: ${rcPort}, AH: ${ahPort}`);

  try {
    const rcSnapshotPath = `${basePath}/${network}-rc-${type}.snap`;
    const ahSnapshotPath = `${basePath}/${network}-ah-${type}.snap`;

    // Take RC snapshot at the exact block where AccountsMigrationInit was detected
    const rcCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${blockHash} "${rcSnapshotPath}"`;
    logger.info(`Executing: ${rcCommand}`);
    await execAsync(rcCommand);

    // We look at the RC block to see which AH blocks were backed/included
    const ahProvider = new WsProvider(`ws://127.0.0.1:${ahPort}`);
    const ahApi = await ApiPromise.create({ provider: ahProvider });
    const rcProvider = new WsProvider(`ws://127.0.0.1:${rcPort}`);
    const rcApi = await ApiPromise.create({ provider: rcProvider });

    logger.info(`🔍 Finding corresponding AH block for RC block...`);

    let ahTargetHash: string;
    let ahStage: any;

    if (type === "pre") {
      // For pre-migration: find AH block that corresponds to the RC block
      ahTargetHash = await findCorrespondingAHBlock(rcApi, ahApi, blockHash);
    } else {
      // For post-migration: AH monitoring is handled in main() - this should not be reached
      throw new Error(
        "Post-migration AH snapshot should be handled by parallel monitoring, not here",
      );
    }

    // Get the AH migration stage at the chosen block
    const ahApiAt = await ahApi.at(ahTargetHash);
    const ahStageRaw = await ahApiAt.query.ahMigrator.ahMigrationStage();
    ahStage = ahStageRaw.toHuman();
    const ahHeader = await ahApi.rpc.chain.getHeader(ahTargetHash);

    logger.info(
      `🔍 Final AH Migration Stage at snapshot: ${JSON.stringify(ahStage)}`,
    );
    logger.info(
      `📍 AH snapshot at block #${ahHeader.number.toNumber()}: ${ahTargetHash.toString()}`,
    );

    await rcApi.disconnect();

    // Use the found AH block for the snapshot
    const ahCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${ahTargetHash} "${ahSnapshotPath}"`;
    logger.info(`Executing: ${ahCommand}`);
    await execAsync(ahCommand);

    await ahApi.disconnect();

    // Write snapshot info for reference
    const snapshotInfo = {
      [`rc_${type}_snapshot_path`]: rcSnapshotPath,
      [`ah_${type}_snapshot_path`]: ahSnapshotPath,
      rc_block_hash: blockHash,
      ah_block_hash: ahTargetHash.toString(),
      ah_migration_stage: ahStage,
      network: network,
      timestamp: new Date().toISOString(),
      trigger:
        type === "pre"
          ? "RC AccountsMigrationInit detected, AH snapshot at corresponding block"
          : "RC MigrationDone detected, AH snapshot at corresponding MigrationDone block",
    };

    const infoPath = join(basePath, `${type}_migration_snapshot_info.json`);
    writeFileSync(infoPath, JSON.stringify(snapshotInfo, null, 2));

    logger.info(`${type}-migration snapshots completed successfully!`);
    logger.info(`RC snapshot: ${rcSnapshotPath}`);
    logger.info(`AH snapshot: ${ahSnapshotPath}`);
    logger.info(`Info written to: ${infoPath}`);
  } catch (error) {
    logger.error("Failed to take snapshots at block:", error);
    throw error;
  }
}

async function main() {
  const ahPort = await getAHPort(basePath);
  const rcPort = await getRCPort(basePath);

  logger.info(`Using ports - RC: ${rcPort}, AH: ${ahPort}`);

  // Connect to relay chain to monitor migration stage
  const wsProvider = new WsProvider(`ws://127.0.0.1:${rcPort}`);
  const api = await ApiPromise.create({ provider: wsProvider });

  logger.info(
    `Starting to monitor RC migration stage for ${network} (${snapshotType} snapshots)...`,
  );

  if (snapshotType === "pre") {
    // Pre-migration: Monitor both RC and AH for their respective migration stages
    await monitorBothChainsForPreMigration(
      api,
      basePath,
      network,
      rcPort,
      ahPort,
    );
  } else {
    // Post-migration: Monitor both RC and AH simultaneously
    await monitorBothChainsForPostMigration(
      api,
      basePath,
      network,
      rcPort,
      ahPort,
    );
  }
}

// Monitor both RC and AH for pre-migration (RC: AccountsMigrationInit, AH: DataMigrationOngoing + 1)
async function monitorBothChainsForPreMigration(
  api: ApiPromise,
  basePath: string,
  network: string,
  rcPort: number,
  ahPort: number,
): Promise<void> {
  let rcSnapshotTaken = false;
  let ahSnapshotTaken = false;
  let rcBlockHash: string | null = null;

  // Set a timeout to prevent hanging indefinitely
  const timeout = setTimeout(
    () => {
      if (!rcSnapshotTaken || !ahSnapshotTaken) {
        logger.error(`⏰ Timeout waiting for pre-migration snapshots (10min)`);
        process.exit(1);
      }
    },
    10 * 60 * 1000,
  );

  // Monitor RC for AccountsMigrationInit
  const rcUnsub = await api.rpc.chain.subscribeFinalizedHeads(
    async (header: Header) => {
      if (rcSnapshotTaken) return;

      try {
        const apiAt = await api.at(header.hash);
        const raw = await apiAt.query.rcMigrator.rcMigrationStage();
        const stage = raw.toHuman();

        logger.info(
          `RC Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        if (isAccountsMigrationInit(stage)) {
          logger.info(
            `🎯 RC AccountsMigrationInit stage detected at block ${header.number}!`,
          );
          logger.info(`Taking RC pre-migration snapshot at exact block...`);

          rcSnapshotTaken = true;
          rcBlockHash = header.hash.toString();

          try {
            const rcSnapshotPath = `${basePath}/${network}-rc-pre.snap`;
            const rcCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${rcBlockHash} "${rcSnapshotPath}"`;
            logger.info(`Executing: ${rcCommand}`);
            await execAsync(rcCommand);
            logger.info(`✅ RC pre-migration snapshot completed!`);
          } catch (error) {
            logger.error(`❌ Failed to take RC pre-migration snapshot:`, error);
            process.exit(1);
          }
        }
      } catch (error) {
        logger.error("Error checking RC migration stage:", error);
      }
    },
  );

  // Connect to AH for monitoring
  const ahProvider = new WsProvider(`ws://127.0.0.1:${ahPort}`);
  const ahApi = await ApiPromise.create({ provider: ahProvider });

  let ahDataMigrationOngoingDetected = false;

  // Monitor AH for DataMigrationOngoing, then take snapshot at next block
  const ahUnsub = await ahApi.rpc.chain.subscribeFinalizedHeads(
    async (header: Header) => {
      if (ahSnapshotTaken) return;

      try {
        const apiAt = await ahApi.at(header.hash);
        const raw = await apiAt.query.ahMigrator.ahMigrationStage();
        const stage = raw.toHuman();

        logger.info(
          `AH Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        if (isDataMigrationOngoing(stage)) {
          if (!ahDataMigrationOngoingDetected) {
            logger.info(
              `🎯 AH DataMigrationOngoing detected at block ${header.number}!`,
            );
            logger.info(
              `Will take AH snapshot at next block (DataMigrationOngoing + 1)...`,
            );
            ahDataMigrationOngoingDetected = true;
          }
        } else if (ahDataMigrationOngoingDetected && !ahSnapshotTaken) {
          // This is the block after DataMigrationOngoing
          logger.info(
            `Taking AH pre-migration snapshot at block ${header.number} (DataMigrationOngoing + 1)...`,
          );

          ahSnapshotTaken = true;
          const ahBlockHash = header.hash.toString();

          try {
            const ahSnapshotPath = `${basePath}/${network}-ah-pre.snap`;
            const ahCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${ahBlockHash} "${ahSnapshotPath}"`;
            logger.info(`Executing: ${ahCommand}`);
            await execAsync(ahCommand);
            logger.info(`✅ AH pre-migration snapshot completed!`);

            // Write snapshot info once both snapshots are taken
            if (rcSnapshotTaken && rcBlockHash) {
              const snapshotInfo = {
                rc_pre_snapshot_path: `${basePath}/${network}-rc-pre.snap`,
                ah_pre_snapshot_path: ahSnapshotPath,
                rc_block_hash: rcBlockHash,
                ah_block_hash: ahBlockHash,
                ah_migration_stage: stage,
                network: network,
                timestamp: new Date().toISOString(),
                trigger:
                  "RC AccountsMigrationInit, AH DataMigrationOngoing + 1",
              };

              const infoPath = join(
                basePath,
                "pre_migration_snapshot_info.json",
              );
              writeFileSync(infoPath, JSON.stringify(snapshotInfo, null, 2));

              const markerFile = join(
                basePath,
                "pre_migration_snapshot_done.txt",
              );
              writeFileSync(
                markerFile,
                `Pre-migration snapshots completed\nTimestamp: ${new Date().toISOString()}`,
              );

              logger.info(
                `✅ pre-migration snapshot process completed successfully!`,
              );
              logger.info(`Info written to: ${infoPath}`);

              clearTimeout(timeout);
              await rcUnsub();
              await ahUnsub();
              await api.disconnect();
              await ahApi.disconnect();
              process.exit(0);
            }
          } catch (error) {
            logger.error(`❌ Failed to take AH pre-migration snapshot:`, error);
            process.exit(1);
          }
        }
      } catch (error) {
        logger.error("Error checking AH migration stage:", error);
      }
    },
  );
}

// Monitor both RC and AH for post-migration (both MigrationDone)
async function monitorBothChainsForPostMigration(
  rcApi: ApiPromise,
  basePath: string,
  network: string,
  rcPort: number,
  ahPort: number,
): Promise<void> {
  logger.info(
    `Starting parallel monitoring for both RC and AH CoolOff states...`,
  );

  const ahProvider = new WsProvider(`ws://127.0.0.1:${ahPort}`);
  const ahApi = await ApiPromise.create({ provider: ahProvider });

  let rcDone = false;
  let ahDone = false;
  let rcDoneBlock: string | null = null;
  let ahDoneBlock: string | null = null;
  let snapshotTaken = false;

  // Set a timeout to prevent hanging indefinitely.
  // If MIGRATION_TIMEOUT_HOURS is not set, default to 2h.
  const timeoutHours = process.env.MIGRATION_TIMEOUT_HOURS
    ? parseInt(process.env.MIGRATION_TIMEOUT_HOURS)
    : 2;
  const timeoutMs = timeoutHours * 60 * 60 * 1000;

  const timeout = setTimeout(() => {
    if (!snapshotTaken) {
      logger.error(
        `⏰ Timeout waiting for both RC and AH to reach CoolOff (${timeoutHours} hours)`,
      );
      process.exit(1);
    }
  }, timeoutMs);

  // Monitor RC for CoolOff
  const rcUnsub = await rcApi.rpc.chain.subscribeFinalizedHeads(
    async (header: Header) => {
      if (rcDone || snapshotTaken) return;

      try {
        const apiAt = await rcApi.at(header.hash);
        const raw = await apiAt.query.rcMigrator.rcMigrationStage();
        const stage = raw.toHuman();

        logger.info(
          `RC Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        if (isCoolOff(stage)) {
          logger.info(`✅ RC CoolOff detected at block ${header.number}!`);
          rcDone = true;
          rcDoneBlock = header.hash.toString();

          if (ahDone && ahDoneBlock) {
            await takePostMigrationSnapshots();
          }
        }
      } catch (error) {
        logger.error("Error checking RC migration stage:", error);
      }
    },
  );

  // Monitor AH for CoolOff
  const ahUnsub = await ahApi.rpc.chain.subscribeFinalizedHeads(
    async (header: Header) => {
      if (ahDone || snapshotTaken) return;

      try {
        const apiAt = await ahApi.at(header.hash);
        const raw = await apiAt.query.ahMigrator.ahMigrationStage();
        const stage = raw.toHuman();

        logger.info(
          `AH Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        if (isCoolOff(stage)) {
          logger.info(`✅ AH CoolOff detected at block ${header.number}!`);
          ahDone = true;
          ahDoneBlock = header.hash.toString();

          if (rcDone && rcDoneBlock) {
            await takePostMigrationSnapshots();
          }
        }
      } catch (error) {
        logger.error("Error checking AH migration stage:", error);
      }
    },
  );

  // Take snapshots when both chains are done
  async function takePostMigrationSnapshots() {
    if (snapshotTaken) return;
    snapshotTaken = true;

    logger.info(
      `🎯 Both RC and AH reached CoolOff! Taking post-migration snapshots...`,
    );

    try {
      const rcSnapshotPath = `${basePath}/${network}-rc-post.snap`;
      const ahSnapshotPath = `${basePath}/${network}-ah-post.snap`;

      // Take snapshots at the blocks where each chain reached MigrationDone
      const rcCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${rcDoneBlock} "${rcSnapshotPath}"`;
      logger.info(`Executing: ${rcCommand}`);
      await execAsync(rcCommand);

      const ahCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${ahDoneBlock} "${ahSnapshotPath}"`;
      logger.info(`Executing: ${ahCommand}`);
      await execAsync(ahCommand);

      // Write snapshot info
      const snapshotInfo = {
        rc_post_snapshot_path: rcSnapshotPath,
        ah_post_snapshot_path: ahSnapshotPath,
        rc_block_hash: rcDoneBlock,
        ah_block_hash: ahDoneBlock,
        ah_migration_stage: "CoolOff",
        network: network,
        timestamp: new Date().toISOString(),
        trigger: "Both RC and AH reached CoolOff - parallel monitoring",
      };

      const infoPath = join(basePath, "post_migration_snapshot_info.json");
      writeFileSync(infoPath, JSON.stringify(snapshotInfo, null, 2));

      const markerFile = join(basePath, "post_migration_snapshot_done.txt");
      writeFileSync(
        markerFile,
        `Post-migration snapshot completed\nTimestamp: ${new Date().toISOString()}`,
      );

      logger.info(`post-migration snapshots completed successfully!`);
      logger.info(`RC snapshot: ${rcSnapshotPath}`);
      logger.info(`AH snapshot: ${ahSnapshotPath}`);
      logger.info(`Info written to: ${infoPath}`);
    } catch (error) {
      logger.error(`❌ Failed to take post-migration snapshots:`, error);
      process.exit(1);
    }

    clearTimeout(timeout);
    await rcUnsub();
    await ahUnsub();
    await rcApi.disconnect();
    await ahApi.disconnect();
    process.exit(0);
  }
}

main().catch((err) => {
  logger.error("❌ Unexpected error:", err);
  process.exit(1);
});
