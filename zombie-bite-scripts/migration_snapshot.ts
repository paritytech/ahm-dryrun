// Monitor RC and AH migration stages and take pre/post-migration snapshots
//
// Pre-migration: Monitors RC for AccountsMigrationInit, then finds the corresponding AH block
// Post-migration: Monitors both RC and AH in parallel, waits for both to reach MigrationDone
//
// Usage: node dist/zombie-bite-scripts/migration_pre_snapshot.js <base_path> <network>

import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Get base path, network, and snapshot type from command line args
const basePath = process.argv[2];
const network = process.argv[3];
const snapshotType = process.argv[4]; // 'pre' or 'post'

if (!basePath || !network || !snapshotType) {
  console.error(
    "Usage: node migration_snapshot.js <base_path> <network> <pre|post>",
  );
  process.exit(1);
}

if (snapshotType !== "pre" && snapshotType !== "post") {
  console.error("Error: snapshot type must be 'pre' or 'post'");
  process.exit(1);
}

async function getAHPort(basePath: string): Promise<number> {
  try {
    const portsFile = join(basePath, "ports.json");
    const ports = JSON.parse(readFileSync(portsFile, "utf8"));
    return ports.collator_port;
  } catch (error) {
    console.error("Could not read ports.json, using default port 63170");
    return 63170; // Default AH port
  }
}

async function getRCPort(basePath: string): Promise<number> {
  try {
    const portsFile = join(basePath, "ports.json");
    const ports = JSON.parse(readFileSync(portsFile, "utf8"));
    return ports.alice_port;
  } catch (error) {
    console.error("Could not read ports.json, using default port 63168");
    return 63168; // Default RC port
  }
}

// Check if stage is AccountsMigrationInit
function isAccountsMigrationInit(stage: any): boolean {
  // Handle both string and object representations
  if (typeof stage === "string") {
    return stage === "AccountsMigrationInit";
  }

  // Handle object representation
  if (typeof stage === "object" && stage !== null) {
    return (
      "AccountsMigrationInit" in stage ||
      JSON.stringify(stage).includes("AccountsMigrationInit")
    );
  }

  return false;
}

// Check if stage is MigrationDone
function isMigrationDone(stage: any): boolean {
  // Handle both string and object representations
  if (typeof stage === "string") {
    return stage === "MigrationDone";
  }

  // Handle object representation
  if (typeof stage === "object" && stage !== null) {
    return (
      "MigrationDone" in stage ||
      JSON.stringify(stage).includes("MigrationDone")
    );
  }

  return false;
}

// Find the AH block that corresponds to a given RC block by looking at parachain backing
async function findCorrespondingAHBlock(
  rcApi: any,
  ahApi: any,
  rcBlockHash: string,
): Promise<string> {
  console.log(`Looking for AH block backed in RC block ${rcBlockHash}`);

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
      for (const ext of ahBlock.block.extrinsics) {
        const extrinsic = ahApi.registry.createType("Extrinsic", ext);
        const { method } = extrinsic;

        if (
          method.section === "parachainSystem" &&
          method.method === "setValidationData"
        ) {
          const args = method.args[0] as any;
          const relayParentNumber =
            args.validationData.relayParentNumber.toNumber();
          const rcBlockNumber = rcHeader.number.toNumber();

          console.log(
            `Checking AH block ${ahCurrentHash}: validation parent = ${relayParentNumber}, target RC block = ${rcBlockNumber}`,
          );

          if (relayParentNumber === rcBlockNumber) {
            console.log(
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
  console.log(
    `Taking ${type}-migration snapshots at block ${blockHash} for ${network}...`,
  );
  console.log(`Using ports - RC: ${rcPort}, AH: ${ahPort}`);

  try {
    const rcSnapshotPath = `${basePath}/${network}-rc-${type}.snap`;
    const ahSnapshotPath = `${basePath}/${network}-ah-${type}.snap`;

    // Take RC snapshot at the exact block where AccountsMigrationInit was detected
    const rcCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${blockHash} "${rcSnapshotPath}"`;
    console.log(`Executing: ${rcCommand}`);
    await execAsync(rcCommand);

    // We look at the RC block to see which AH blocks were backed/included
    const ahProvider = new WsProvider(`ws://127.0.0.1:${ahPort}`);
    const ahApi = await ApiPromise.create({ provider: ahProvider });
    const rcProvider = new WsProvider(`ws://127.0.0.1:${rcPort}`);
    const rcApi = await ApiPromise.create({ provider: rcProvider });

    console.log(`🔍 Finding corresponding AH block for RC block...`);

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

    console.log(
      `🔍 Final AH Migration Stage at snapshot: ${JSON.stringify(ahStage)}`,
    );
    console.log(
      `📍 AH snapshot at block #${ahHeader.number.toNumber()}: ${ahTargetHash.toString()}`,
    );

    await rcApi.disconnect();

    // Use the found AH block for the snapshot
    const ahCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${ahTargetHash} "${ahSnapshotPath}"`;
    console.log(`Executing: ${ahCommand}`);
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

    console.log(`${type}-migration snapshots completed successfully!`);
    console.log(`RC snapshot: ${rcSnapshotPath}`);
    console.log(`AH snapshot: ${ahSnapshotPath}`);
    console.log(`Info written to: ${infoPath}`);
  } catch (error) {
    console.error("Failed to take snapshots at block:", error);
    throw error;
  }
}

async function main() {
  const ahPort = await getAHPort(basePath);
  const rcPort = await getRCPort(basePath);

  console.log(`Using ports - RC: ${rcPort}, AH: ${ahPort}`);

  // Connect to relay chain to monitor migration stage
  const wsProvider = new WsProvider(`ws://127.0.0.1:${rcPort}`);
  const api = await ApiPromise.create({ provider: wsProvider });

  console.log(
    `Starting to monitor RC migration stage for ${network} (${snapshotType} snapshots)...`,
  );

  if (snapshotType === "pre") {
    // Pre-migration: Monitor RC only, find corresponding AH block when RC reaches AccountsMigrationInit
    await monitorRCForPreMigration(api, basePath, network, rcPort, ahPort);
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

// Monitor RC for pre-migration (AccountsMigrationInit)
async function monitorRCForPreMigration(
  api: any,
  basePath: string,
  network: string,
  rcPort: number,
  ahPort: number,
): Promise<void> {
  let snapshotTaken = false;

  // Set a timeout to prevent hanging indefinitely
  const timeout = setTimeout(
    () => {
      if (!snapshotTaken) {
        console.error(
          `⏰ Timeout waiting for AccountsMigrationInit stage (10min)`,
        );
        process.exit(1);
      }
    },
    10 * 60 * 1000,
  );

  const unsub = await api.rpc.chain.subscribeFinalizedHeads(
    async (header: any) => {
      if (snapshotTaken) return;

      try {
        const apiAt = await api.at(header.hash);
        const raw = await apiAt.query.rcMigrator.rcMigrationStage();
        const stage = raw.toHuman();

        console.log(
          `Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        if (isAccountsMigrationInit(stage)) {
          console.log(
            `🎯 AccountsMigrationInit stage detected at block ${header.number}!`,
          );
          console.log(`Taking pre-migration snapshots at exact block...`);

          snapshotTaken = true;

          try {
            await takeSnapshotsAtBlock(
              basePath,
              network,
              rcPort,
              ahPort,
              header.hash.toString(),
              "pre",
            );

            const markerFile = join(
              basePath,
              "pre_migration_snapshot_done.txt",
            );
            writeFileSync(
              markerFile,
              `Pre-migration snapshot completed at block ${header.number}\nTimestamp: ${new Date().toISOString()}`,
            );

            console.log(
              `✅ pre-migration snapshot process completed successfully!`,
            );
          } catch (error) {
            console.error(`❌ Failed to take pre-migration snapshots:`, error);
            process.exit(1);
          }

          clearTimeout(timeout);
          await unsub();
          await api.disconnect();
          process.exit(0);
        }
      } catch (error) {
        console.error("Error checking migration stage:", error);
      }
    },
  );
}

// Monitor both RC and AH for post-migration (both MigrationDone)
async function monitorBothChainsForPostMigration(
  rcApi: any,
  basePath: string,
  network: string,
  rcPort: number,
  ahPort: number,
): Promise<void> {
  console.log(
    `Starting parallel monitoring for both RC and AH MigrationDone states...`,
  );

  const ahProvider = new WsProvider(`ws://127.0.0.1:${ahPort}`);
  const ahApi = await ApiPromise.create({ provider: ahProvider });

  let rcDone = false;
  let ahDone = false;
  let rcDoneBlock: string | null = null;
  let ahDoneBlock: string | null = null;
  let snapshotTaken = false;

  // Set a timeout to prevent hanging indefinitely
  const timeout = setTimeout(
    () => {
      if (!snapshotTaken) {
        console.error(
          `⏰ Timeout waiting for both chains to reach MigrationDone (2 hours)`,
        );
        process.exit(1);
      }
    },
    2 * 60 * 60 * 1000,
  );

  // Monitor RC for MigrationDone
  const rcUnsub = await rcApi.rpc.chain.subscribeFinalizedHeads(
    async (header: any) => {
      if (rcDone || snapshotTaken) return;

      try {
        const apiAt = await rcApi.at(header.hash);
        const raw = await apiAt.query.rcMigrator.rcMigrationStage();
        const stage = raw.toHuman();

        console.log(
          `RC Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        if (isMigrationDone(stage)) {
          console.log(
            `✅ RC MigrationDone detected at block ${header.number}!`,
          );
          rcDone = true;
          rcDoneBlock = header.hash.toString();

          if (ahDone && ahDoneBlock) {
            await takePostMigrationSnapshots();
          }
        }
      } catch (error) {
        console.error("Error checking RC migration stage:", error);
      }
    },
  );

  // Monitor AH for MigrationDone
  const ahUnsub = await ahApi.rpc.chain.subscribeFinalizedHeads(
    async (header: any) => {
      if (ahDone || snapshotTaken) return;

      try {
        const apiAt = await ahApi.at(header.hash);
        const raw = await apiAt.query.ahMigrator.ahMigrationStage();
        const stage = raw.toHuman();

        console.log(
          `AH Block #${header.number}: Migration stage = ${JSON.stringify(stage)}`,
        );

        if (isMigrationDone(stage)) {
          console.log(
            `✅ AH MigrationDone detected at block ${header.number}!`,
          );
          ahDone = true;
          ahDoneBlock = header.hash.toString();

          if (rcDone && rcDoneBlock) {
            await takePostMigrationSnapshots();
          }
        }
      } catch (error) {
        console.error("Error checking AH migration stage:", error);
      }
    },
  );

  // Take snapshots when both chains are done
  async function takePostMigrationSnapshots() {
    if (snapshotTaken) return;
    snapshotTaken = true;

    console.log(
      `🎯 Both chains reached MigrationDone! Taking post-migration snapshots...`,
    );

    try {
      const rcSnapshotPath = `${basePath}/${network}-rc-post.snap`;
      const ahSnapshotPath = `${basePath}/${network}-ah-post.snap`;

      // Take snapshots at the blocks where each chain reached MigrationDone
      const rcCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${rcPort} --at ${rcDoneBlock} "${rcSnapshotPath}"`;
      console.log(`Executing: ${rcCommand}`);
      await execAsync(rcCommand);

      const ahCommand = `try-runtime create-snapshot --uri ws://127.0.0.1:${ahPort} --at ${ahDoneBlock} "${ahSnapshotPath}"`;
      console.log(`Executing: ${ahCommand}`);
      await execAsync(ahCommand);

      // Write snapshot info
      const snapshotInfo = {
        rc_post_snapshot_path: rcSnapshotPath,
        ah_post_snapshot_path: ahSnapshotPath,
        rc_block_hash: rcDoneBlock,
        ah_block_hash: ahDoneBlock,
        ah_migration_stage: "MigrationDone",
        network: network,
        timestamp: new Date().toISOString(),
        trigger: "Both RC and AH reached MigrationDone - parallel monitoring",
      };

      const infoPath = join(basePath, "post_migration_snapshot_info.json");
      writeFileSync(infoPath, JSON.stringify(snapshotInfo, null, 2));

      const markerFile = join(basePath, "post_migration_snapshot_done.txt");
      writeFileSync(
        markerFile,
        `Post-migration snapshot completed\nTimestamp: ${new Date().toISOString()}`,
      );

      console.log(`post-migration snapshots completed successfully!`);
      console.log(`RC snapshot: ${rcSnapshotPath}`);
      console.log(`AH snapshot: ${ahSnapshotPath}`);
      console.log(`Info written to: ${infoPath}`);
    } catch (error) {
      console.error(`❌ Failed to take post-migration snapshots:`, error);
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
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
