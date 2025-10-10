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
import {
  isAccountsMigrationInit,
  isDataMigrationOngoing,
  isCoolOff,
} from "./helpers.js";

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
              rcUnsub();
              ahUnsub();
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
    rcUnsub();
    ahUnsub();
    await rcApi.disconnect();
    await ahApi.disconnect();
    process.exit(0);
  }
}

main().catch((err) => {
  logger.error("❌ Unexpected error:", err);
  process.exit(1);
});
