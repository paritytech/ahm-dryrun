// orchestrator.ts
import { spawn } from "child_process";
import * as fs from "fs";
import { watch } from "chokidar";
import * as dotenv from "dotenv";
import { logger } from "../shared/logger.js";

import { scheduleMigration, monitMigrationFinish, delay } from "./helpers.js";
import { main as migrationTestMain } from "../migration-tests/lib.js";

const READY_FILE = "ready.json";
const PORTS_FILE = "ports.json";
const DONE_FILE = "migration_done.json";
const ZOMBIE_JSON_FILE = "zombie.json";


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
  logger.error(`Uncaught exception, aborting zombie-bite process...`);
  abortController.abort();
  console.log(err);
  process.exit(1000);
});

// Ensure that we know about any exception thrown in a promise that we
// accidentally don't have a 'catch' for.
process.on("unhandledRejection", async (err, promise) => {
  logger.error(`Unhandled Rejection, aborting zombie-bite process...`);
  abortController.abort();
  logger.error(err);
  logger.error('promise', promise);
  process.exit(1001);
});

process.on('SIGINT', function() {
  logger.error('Caught interrupt signal, aborting zombie-bite process...');
  abortController.abort();
});

class Orchestrator {
  private readyWatcher: any;
  private doneWatcher: any;
  private zombieWatcher: any;

  async run(base_path: string, runtime_name: string, relay_runtime_path: string, asset_hub_runtime_path: string) {
    try {
      logger.info('🧑‍🔧 Starting migration process...');

      // zombie-bite logs
      const logs_path = `${base_path}/logs`;
      await fs.promises.mkdir(logs_path, { recursive: true });
      const zombie_bite_logs = `${logs_path}/zombie-bite.log`;
      const zombie_bite_logs_fd = fs.openSync(zombie_bite_logs, 'a');

      // STEP 0: Sync and fork
      if ( STEP_TO_INIT <= 0 ) {
        // Start zombie-bite process
        logger.info(`\t ⚙️ Starting zombie-bite (📓 logs ${zombie_bite_logs})...`);
        const zombie_bite = spawn(
          "zombie-bite",
          [
            "bite",
            "-r", runtime_name,
            "--rc-override", relay_runtime_path,
            "--ah-override", asset_hub_runtime_path,
            "-d", base_path,
            "--and-spawn"
          ],
          {
            // The signal property tells the child process (zombie-bite) to listen for abort signals
            signal: abortController.signal,
            stdio: [
              "inherit", // stdin
              zombie_bite_logs_fd, // stdout
              zombie_bite_logs_fd // stderr
            ],
            env: {
              ...process.env,
              ZOMBIE_BITE_BASE_PATH: base_path,
              // map to env needed in zombie-bite (IIF are present)
              ...(process.env.ZOMBIE_BITE_RUST_LOG && { RUST_LOG: process.env.ZOMBIE_BITE_RUST_LOG }),
              ...(process.env.ZOMBIE_BITE_RUST_LOG_COL && { RUST_LOG_COL: process.env.ZOMBIE_BITE_RUST_LOG }),
            },
          },
        );

        zombie_bite.on("error", (err) => {
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

      await stopZombieBite(base_path);

      // need to spawn the network here
      const zombie_bite_post = spawn(
        "zombie-bite",
        [
          "spawn",
          "-d", base_path,
          "-s", "post"
        ],
        {
          // The signal property tells the child process (zombie-bite) to listen for abort signals
          signal: abortController.signal,
          stdio: [
            "inherit", // stdin
            zombie_bite_logs_fd, // stdout
            zombie_bite_logs_fd // stderr
          ],
          env: {
            ...process.env,
          },
        },
      );

      zombie_bite_post.on("error", (err) => {
        console.error("🧑‍🔧 Failed to start zombie-bite post step:", err);
        process.exit(1);
      });

      await this.waitForZombieJson(base_path, "post");

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
        ah_endpoint,
      );

      // TODO: wait for Alex.
      // Mock: Run PET tests
      // logger.info('🧑‍🔧  Running final PET tests...');

      logger.info('\n✅ Migration completed successfully');
      await stopZombieBite(base_path);
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

  private async waitForZombieJson(base_path: string, step: string): Promise<void> {
    let done_file = `${base_path}/${step}/${ZOMBIE_JSON_FILE}`;
    return new Promise((resolve) => {
      this.zombieWatcher = watch(base_path, {
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 1000,
        },
      });

      this.zombieWatcher.on("all", (event: string, info: string) => {
        if (event == "add" && info.includes(DONE_FILE)) {
          this.zombieWatcher.close();
          return resolve();
        }
      });
    });
  }
}

async function stopZombieBite(base_path: string): Promise<void> {
    // Signal zombie-bite to stop the network and
    // generate the artifacts
    let stop_file = `${base_path}/stop.txt`;
    await fs.promises.writeFile(stop_file, "");

    await delay(60 * 1000); // wait 1 minute

    // ones the artifacts are done, the `stop.txt` file is removed
    // So, let's check that with a limit of 10 mins.
    let limit = 60 * 1000 * 10;
    while(fs.existsSync(stop_file)) {
      const step = 5 * 1000;
      await delay(5 * 1000);
      limit -= step;
      if(limit >= 0) {
        throw new Error("Timeout waiting for spawn artifacts from zombie-bite!");
      }
    }
}

// Create just command
async function main() {
  dotenv.config({ override: true });
  const orchestrator = new Orchestrator();
  const base_path_arg = process.argv[2];
  const runtime_name = process.argv[3];  // e.g. "paseo", "polkadot", "kusama"
  const relay_runtime_path = process.argv[4];  // e.g. "./runtime_wasm/paseo_runtime.compact.compressed.wasm"
  const asset_hub_runtime_path = process.argv[5]; // e.g. "./runtime_wasm/asset_hub_paseo_runtime.compact.compressed.wasm"
  const base_path_env = process.env["AHM_BASE_PATH"];
  let base_path =
    base_path_arg || base_path_env || `./migration-run-${Date.now()}`;

  // ensure base path exist
  try {
    await fs.promises.mkdir(base_path, { recursive: true });
  } catch (e) {
    logger.error('Error creating base path', { error: e });
  }

  await orchestrator.run(base_path, runtime_name, relay_runtime_path, asset_hub_runtime_path);
}

main().catch((error) => {
  logger.error('Main function error', { error });
});
