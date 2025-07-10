// orchestrator.ts
import { spawn } from "child_process";
import * as fs from "fs";
import { watch } from "chokidar";
import * as dotenv from "dotenv";

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


// Ensure to log the uncaught exceptions
process.on("uncaughtException", async (err) => {
  console.log(`uncaughtException`);
  console.log(err);
  process.exit(1000);
});

// Ensure that we know about any exception thrown in a promise that we
// accidentally don't have a 'catch' for.
// http://www.hacksrus.net/blog/2015/08/a-solution-to-swallowed-exceptions-in-es6s-promises/
process.on("unhandledRejection", async (err) => {
  console.log(`unhandledRejection`);
  console.log(err);
  process.exit(1001);
});

class Orchestrator {
  private readyWatcher: any;
  private doneWatcher: any;

  async run(base_path: string) {
    try {
      console.log("🧑‍🔧 Starting migration process...");

      // STEP 0: Sync and fork
      if( STEP_TO_INIT <= 0 ) {
        // Start zombie-bite process
        console.log("\t 🧑‍🔧 Starting zombie-bite...");
        const zombieBite = spawn(
          "zombie-bite",
          [
            `polkadot:${process.env.RUNTIME_WASM}/polkadot_runtime.compact.compressed.wasm`,
            `asset-hub:${process.env.RUNTIME_WASM}/asset_hub_polkadot_runtime.compact.compressed.wasm`,
          ],
          {
            stdio: "inherit",
            env: { ...process.env, ZOMBIE_BITE_BASE_PATH: base_path },
          },
        );

        zombieBite.on("error", (err) => {
          console.error("🧑‍🔧 Failed to start zombie-bite:", err);
          process.exit(1);
        });
      } else {
        console.warn("⚠️  STEP 0: zombie-bite skipped\n");
      }

      console.log("\t 🧑‍🔧 Waiting for ready info from the spawned network...");
      let [start_blocks, ports] = await this.waitForReadyInfo(base_path);
      console.log("\t\t 📩 Ready info received:", start_blocks, ports);
      const { alice_port, collator_port } = ports;


      // STEP 1: Trigger migration
      if( STEP_TO_INIT <= 1 ) {
        console.log(`\t 🧑‍🔧 Triggering migration with alice_port: ${alice_port}`);
        await scheduleMigration(alice_port);
      } else {
        console.warn("⚠️  STEP 1: Trigger migration skipped\n");
      }

      // STEP 2: Wait finish migration
      console.log(
        `\t 🧑‍🔧 Starting monitoring until miragtion finish with ports: ${alice_port}, ${collator_port}`,
      );
      this.monitMigrationFinishWrapper(base_path, alice_port, collator_port);

      console.log("\t 🧑‍🔧 Waiting for migration info...");
      let end_blocks = await this.waitForMigrationInfo(base_path);
      console.log("\t\t 📩 Migration info received:", end_blocks);

      // STEP 3: Run migration tests
      // Mock: Run migration tests
      console.log("🧑‍🔧 Running migration tests with ports and blocks...");
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
      // console.log('🧑‍🔧  Running final PET tests...');

      console.log("\n✅ Migration completed successfully");
    } catch (error) {
      console.error("🧑‍🔧Error in orchestrator:", error);
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
        console.error("Error monitoring", e, "restaring...");
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

      this.readyWatcher.on("all", (event: any, info: string) => {
        if (event == "add" && info.includes(PORTS_FILE)) {
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

      this.doneWatcher.on("all", (event: string, info: string) => {
        if (event == "add" && info.includes(DONE_FILE)) {
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
  const base_path_env = process.env["AHM_BASE_PATH"];
  let base_path =
    base_path_arg || base_path_env || `./migration-run-${Date.now()}`;

  // ensure base path exist
  try {
    await fs.promises.mkdir(base_path, { recursive: true });
  } catch (e) {
    console.log(e);
  }

  await orchestrator.run(base_path);
}

main().catch(console.error);
