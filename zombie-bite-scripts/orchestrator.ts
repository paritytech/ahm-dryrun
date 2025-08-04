// orchestrator.ts
import { spawn } from "child_process";
import * as fs from "fs";
import { watch } from "chokidar";
import * as dotenv from "dotenv";
import { logger } from "../shared/logger.js";

import { scheduleMigration, monitMigrationFinish } from "./helpers.js";
import { main as migrationTestMain } from "../migration-tests/lib.js";

const READY_FILE = "ready.json";
const PORTS_FILE = "ports.json";
const DONE_FILE = "migration_done.json";

// STEP to init, default to 0
const STEP_TO_INIT = parseInt(process.env["AHM_STEP"] || "0", 10) || 0;

interface Ports {
  alice_port: number;
  collator_port: number;
}

interface StarBlocks {
  ah_start_block: number;
  rc_start_block: number;
}

interface EndBlocks {
  ah_finish_block: number;
  rc_finish_block: number;
}

// AbortController API docs https://nodejs.org/api/globals.html#class-abortcontroller
// A utility class used to signal cancelation in selected Promise-based APIs.
const abortController = new AbortController();

// Ensure to log the uncaught exceptions
process.on("uncaughtException", async (err) => {
  console.log(`Uncaught exception, aborting zombie-bite process...`);
  abortController.abort();
  console.log(err);
  process.exit(1000);
});

// Ensure that we know about any exception thrown in a promise that we
// accidentally don't have a 'catch' for.
process.on("unhandledRejection", async (err, promise) => {
  console.log(`Unhandled Rejection, aborting zombie-bite process...`);
  abortController.abort();
  console.log(err);
  console.log("promise", promise);
  process.exit(1001);
});

process.on('SIGINT', function() {
  console.log("Caught interrupt signal, aborting zombie-bite process...");
  abortController.abort();
});

class Orchestrator {
  private readyWatcher: any;
  private doneWatcher: any;

  async run(base_path: string, relay_arg: string, asset_hub_arg: string) {
    try {
      logger.info('🧑‍🔧 Starting migration process...');

      // STEP 0: Sync and fork
      if ( STEP_TO_INIT <= 0 ) {
        // Start zombie-bite process
        logger.info('\t ⚙️ Starting zombie-bite...');
        const zombieBite = spawn(
          "zombie-bite",
          [
            relay_arg || `polkadot:${process.env.RUNTIME_WASM}/polkadot_runtime.compact.compressed.wasm`,
            asset_hub_arg || `asset-hub:${process.env.RUNTIME_WASM}/asset_hub_polkadot_runtime.compact.compressed.wasm`,
          ],
          {
            // The signal property tells the child process (zombie-bite) to listen for abort signals
            signal: abortController.signal,
            stdio: "inherit",
            env: {
              ...process.env,
              ZOMBIE_BITE_BASE_PATH: base_path,
              // map to env needed in zombie-bite (IIF are present)
              ...(process.env.ZOMBIE_BITE_RUST_LOG && { RUST_LOG: process.env.ZOMBIE_BITE_RUST_LOG }),
              ...(process.env.ZOMBIE_BITE_RUST_LOG_COL && { RUST_LOG_COL: process.env.ZOMBIE_BITE_RUST_LOG }),
            },
          },
        );

        zombieBite.on("error", (err) => {
          logger.error('⚙️ Failed to start zombie-bite:', { error: err });
          process.exit(1);
        });
      } else {
        logger.warn('⚠️  STEP 0: zombie-bite skipped\n');
      }

      logger.info('\t 🧑‍🔧 Waiting for ready info from the spawned network...');
      let [start_blocks, ports] = await this.waitForReadyInfo(base_path);
      logger.info('\t\t 📩 Ready info received:', { start_blocks, ports });
      const { alice_port, collator_port } = ports;

      // STEP 1: Trigger migration
      if( STEP_TO_INIT <= 1 ) {
        logger.info(`\t 🧑‍🔧 Triggering migration with alice_port: ${alice_port}`);
        await scheduleMigration({rc_port: alice_port});
      } else {
        logger.warn('⚠️  STEP 1: Trigger migration skipped\n');
      }

      // STEP 2: Wait finish migration
      logger.info(
        `\t 🧑‍🔧 Starting monitoring until migration finish with ports: ${alice_port}, ${collator_port}`,
      );
      this.monitMigrationFinishWrapper(base_path, alice_port, collator_port);

      logger.info('\t 🧑‍🔧 Waiting for migration info...');
      let end_blocks = await this.waitForMigrationInfo(base_path);
      logger.info('\t\t 📩 Migration info received:', { end_blocks });

      // STEP 3: Run migration tests
      // Mock: Run migration tests
      logger.info('🧑‍🔧 Running migration tests with ports and blocks...');
      const rc_endpoint = `ws://localhost:${alice_port}`;
      const rc_before = start_blocks.rc_start_block;
      const rc_after = end_blocks.rc_finish_block;

      const ah_endpoint = `ws://localhost:${collator_port}`;
      const ah_before = start_blocks.ah_start_block;
      const ah_after = end_blocks.ah_finish_block;

      await migrationTestMain(
        rc_endpoint,
        rc_before,
        rc_after,
        ah_endpoint,
        ah_before,
        ah_after,
      );

      // TODO: wait for Alex.
      // Mock: Run PET tests
      // logger.info('🧑‍🔧  Running final PET tests...');

      logger.info('\n✅ Migration completed successfully');
    } catch (error) {
      logger.error('🧑‍🔧Error in orchestrator:', { error });
      process.exit(1);
    }
  }

  private async monitMigrationFinishWrapper(
    base_path: string,
    alice_port: string | number,
    collator_port: string | number,
  ): Promise<EndBlocks> {
    // TODO: add limit
    let ongoing = true;
    let result;
    while (ongoing) {
      try {
        result = await monitMigrationFinish(
          base_path,
          alice_port,
          collator_port,
        );
        ongoing = false;
      } catch (e) {
        logger.error('Error monitoring', { error: e, message: 'restarting...' });
      }
    }

    return result as EndBlocks;
  }

  private readyInfo(ready_file: string, ports_file: string): [StarBlocks, Ports] {
      // NOTE: zombie-bite inform the block number where the network was
      // `forked`, so we use the next block as start of the migration
      // since the forked one will not be in the db.
      let start_info: StarBlocks = JSON.parse(
        fs.readFileSync(ready_file).toString(),
      );
      start_info.ah_start_block += 1;
      start_info.rc_start_block += 1;
      const ports = JSON.parse(fs.readFileSync(ports_file).toString());
      return [start_info, ports];
  }

  private async waitForReadyInfo(
    base_path: string,
  ): Promise<[StarBlocks, Ports]> {
    let ready_file = `${base_path}/${READY_FILE}`;
    let ports_file = `${base_path}/${PORTS_FILE}`;

    // IFF already exist just read it
    if( fs.existsSync(ready_file) && fs.existsSync(ports_file) ) {
      return this.readyInfo(ready_file, ports_file);
    }

    return new Promise((resolve) => {
      this.readyWatcher = watch(base_path, {
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 1000,
        },
      });

      this.readyWatcher.on('all', (event: any, info: string) => {
        if (event == 'add' && info.includes(PORTS_FILE)) {
          this.readyWatcher.close();
          return resolve(this.readyInfo(ready_file, ports_file));
        }
      });
    });
  }

  private async waitForMigrationInfo(base_path: string): Promise<EndBlocks> {
    let done_file = `${base_path}/${DONE_FILE}`;
    return new Promise((resolve) => {
      this.doneWatcher = watch(base_path, {
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 1000,
        },
      });

      this.doneWatcher.on('all', (event: string, info: string) => {
        if (event == 'add' && info.includes(DONE_FILE)) {
          const migration_info = JSON.parse(
            fs.readFileSync(done_file).toString(),
          );
          this.doneWatcher.close();
          return resolve(migration_info);
        }
      });
    });
  }
}

// Create just command
async function main() {
  dotenv.config({ override: true });
  const orchestrator = new Orchestrator();
  const base_path_arg = process.argv[2];
  const relay_runtime_arg = process.argv[3];
  const asset_hub_runtime_arg = process.argv[4];
  const base_path_env = process.env["AHM_BASE_PATH"];
  let base_path =
    base_path_arg || base_path_env || `./migration-run-${Date.now()}`;

  // ensure base path exist
  try {
    await fs.promises.mkdir(base_path, { recursive: true });
  } catch (e) {
    logger.error('Error creating base path', { error: e });
  }

  await orchestrator.run(base_path, relay_runtime_arg, asset_hub_runtime_arg);
}

main().catch((error) => {
  logger.error('Main function error', { error });
});
