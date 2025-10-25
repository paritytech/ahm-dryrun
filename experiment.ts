/*
What each experiment does:
Cleans up the new-bite directory
Creates fresh copy from new-bite-original
Modifies config.toml to add --db-cache and --trie-cache flags
Starts the spawn process (output to /tmp/spawn-output.log)
Waits for "🚀🚀🚀 network is up and running..." message
Starts the migration process (output to /tmp/migration-output.log)
Runs for exactly 5 minutes
Creates results directory for this configuration
Copies all three log files (collator, bob, alice)
Analyzes block preparation times - extracts all times, calculates average & median, saves summary
Kills both subprocesses cleanly
Final cleanup
*/

import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const MiB: number = 1024 * 1024;
const GiB: number = MiB * 1024;
const DB_CACHE_VALUES: string[] = ["1000", "2000", "3000", "4000", "5000", "6000"];
const TRIE_CACHE_VALUES: string[] = [`${1* GiB}`, `${2 * GiB}`, `${4 * GiB}`, `${8 * GiB}`];

const TEMP_DIR = "./temp-experiment";
const SPAWN_OUTPUT = `${TEMP_DIR}/spawn-output.log`;
const MIGRATION_OUTPUT = `${TEMP_DIR}/migration-output.log`;

// Track running processes for cleanup
let currentSpawnProc: any = null;
let currentMigrationProc: any = null;

// Helper function to wait for a specific log line
function waitForLog(
  filePath: string,
  pattern: string,
  timeoutMs: number = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (timeoutMs > 0 && Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for: ${pattern}`));
        return;
      }

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        if (content.includes(pattern)) {
          clearInterval(interval);
          resolve();
        }
      }
    }, 1000);
  });
}

// Helper function to sleep
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cleanup function
function cleanup() {
  console.log("\n\nCleaning up...");

  try {
    if (currentMigrationProc) {
      currentMigrationProc.kill("SIGTERM");
      console.log("Killed migration process");
    }
  } catch (e) {
    // Ignore
  }

  try {
    if (currentSpawnProc) {
      currentSpawnProc.kill("SIGTERM");
      console.log("Killed spawn process");
    }
  } catch (e) {
    // Ignore
  }

  try {
    execSync("rm -rf new-bite", { stdio: "ignore" });
    console.log("Removed new-bite directory");
  } catch (e) {
    // Ignore
  }

  console.log("Cleanup complete");
}

// Handle Ctrl+C
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

// Main experiment loop
async function runExperiments() {
  // Create temp directory at the start
  execSync(`mkdir -p ${TEMP_DIR}`, { stdio: "inherit" });

  for (let db_cache of DB_CACHE_VALUES) {
    for (let trie_cache of TRIE_CACHE_VALUES) {
      console.log(
        `\n======================================`
      );
      console.log(
        `Running experiment with db-cache=${db_cache} MB and trie-cache=${trie_cache} bytes`
      );
      console.log(`======================================\n`);

      try {
        // Step 1: Clean up
        console.log("Step 1: Cleaning up new-bite directory...");
        execSync("rm -rf new-bite", { stdio: "inherit" });

        // Step 2: Create and copy
        console.log("Step 2: Creating new-bite directory and copying files...");
        execSync("mkdir new-bite", { stdio: "inherit" });
        execSync("cp -r new-bite-original/* new-bite", { stdio: "inherit" });

        // Step 3: Modify config
        console.log("Step 3: Modifying config.toml...");
        const configPath = "new-bite/bite/config.toml";
        let configContent = fs.readFileSync(configPath, "utf-8");

        // Find the closing bracket of the args array in [[parachains.collators]] section
        // and add our two arguments before it
        const argsPattern = /(\[\[parachains\.collators\]\][\s\S]*?args = \[[\s\S]*?)(\])/;
        configContent = configContent.replace(
          argsPattern,
          `$1    "--db-cache=${db_cache}",\n    "--trie-cache-size=${trie_cache}",\n$2`
        );

        fs.writeFileSync(configPath, configContent);
        console.log(
          `   Added --db-cache=${db_cache} and --trie-cache-size=${trie_cache} to config`
        );

        // Step 4: Start spawn process
        console.log("Step 4: Starting spawn process...");
        const spawnFd = fs.openSync(SPAWN_OUTPUT, "w");
        currentSpawnProc = spawn("just", ["zb", "spawn", "new-bite"], {
          detached: false,
          stdio: ["ignore", spawnFd, spawnFd],
        });

        // Step 5: Wait for network to be ready
        console.log(
          "Step 5: Waiting for network to be ready (this may take a few minutes)..."
        );
        await waitForLog(SPAWN_OUTPUT, "🚀🚀🚀 network is up and running...");
        console.log("   Network is up and running!");

        // Step 6: Start migration process
        console.log("Step 6: Starting migration process...");
        const migrationFd = fs.openSync(MIGRATION_OUTPUT, "w");
        currentMigrationProc = spawn(
          "just",
          ["zb", "perform-migration", "new-bite"],
          {
            detached: false,
            stdio: ["ignore", migrationFd, migrationFd],
          }
        );

        // Step 7: Wait for 5 minutes
        console.log("Step 7: Running migration for 10 minutes...");
        await sleep(10 * 60 * 1000);
        console.log("   10 minutes elapsed");

        // Step 8: Create results directory
        const resultsDir = `results/db-cache-${db_cache}-trie-cache-${trie_cache}`;
        console.log(`Step 8: Creating results directory: ${resultsDir}`);
        execSync(`mkdir -p ${resultsDir}`, { stdio: "inherit" });

        // Step 9: Copy logs
        console.log("Step 9: Copying logs to results directory...");
        const logFiles = [
          "new-bite/spawn/collator/collator.log",
          "new-bite/spawn/bob/bob.log",
          "new-bite/spawn/alice/alice.log",
        ];

        for (const logFile of logFiles) {
          const basename = path.basename(logFile);
          const destPath = path.join(resultsDir, basename);
          if (fs.existsSync(logFile)) {
            execSync(`cp ${logFile} ${destPath}`);
            console.log(`   Copied ${logFile} to ${destPath}`);
          } else {
            console.log(`   Warning: ${logFile} does not exist`);
          }
        }

        // Step 10: Analyze collator log
        console.log("Step 10: Analyzing block preparation times...");
        const collatorLogPath = "new-bite/spawn/collator/collator.log";
        if (fs.existsSync(collatorLogPath)) {
          const collatorLog = fs.readFileSync(collatorLogPath, "utf-8");
          const regex = /🎁 Prepared block for proposing at \d+ \((\d+) ms\)/g;
          const times: number[] = [];
          let match;

          while ((match = regex.exec(collatorLog)) !== null) {
            times.push(parseInt(match[1]));
          }

          if (times.length > 0) {
            const sum = times.reduce((a, b) => a + b, 0);
            const avg = sum / times.length;
            const sorted = times.sort((a, b) => a - b);
            const median =
              times.length % 2 === 0
                ? (sorted[times.length / 2 - 1] + sorted[times.length / 2]) / 2
                : sorted[Math.floor(times.length / 2)];

            console.log(`   Found ${times.length} block preparation times:`);
            console.log(`   All times: ${times.join(", ")}`);
            console.log(`   Average: ${avg.toFixed(2)} ms`);
            console.log(`   Median: ${median.toFixed(2)} ms`);

            // Save summary
            const summaryPath = path.join(resultsDir, "summary.txt");
            fs.writeFileSync(
              summaryPath,
              `Block Preparation Times Analysis
DB Cache: ${db_cache} MB
Trie Cache: ${trie_cache} bytes

Count: ${times.length}
Average: ${avg.toFixed(2)} ms
Median: ${median.toFixed(2)} ms
Min: ${Math.min(...times)} ms
Max: ${Math.max(...times)} ms

All times: ${times.join(", ")}
`
            );
            console.log(`   Saved summary to ${summaryPath}`);
          } else {
            console.log("   No block preparation times found in log");
          }
        } else {
          console.log("   Warning: collator.log not found");
        }

        // Step 11: Kill processes
        console.log("Step 11: Killing subprocesses...");
        try {
          if (currentMigrationProc) {
            currentMigrationProc.kill("SIGTERM");
            console.log("   Killed migration process");
          }
        } catch (e) {
          console.log(`   Error killing migration process: ${e}`);
        }

        try {
          if (currentSpawnProc) {
            currentSpawnProc.kill("SIGTERM");
            console.log("   Killed spawn process");
          }
        } catch (e) {
          console.log(`   Error killing spawn process: ${e}`);
        }

        // Clear the process references
        currentMigrationProc = null;
        currentSpawnProc = null;

        // Wait a bit for cleanup
        await sleep(2000);

        // Step 12: Final cleanup
        console.log("Step 12: Final cleanup...");
        execSync("rm -rf new-bite", { stdio: "inherit" });
        console.log("   Cleaned up new-bite directory");

        console.log(
          `\n✅ Experiment completed for db-cache=${db_cache}, trie-cache=${trie_cache}\n`
        );
      } catch (error) {
        console.error(
          `\n❌ Error in experiment with db-cache=${db_cache}, trie-cache=${trie_cache}:`
        );
        console.error(error);
        console.log("Cleaning up before continuing...\n");

        // Cleanup on error
        try {
          execSync("pkill -f 'just zb spawn'", { stdio: "ignore" });
          execSync("pkill -f 'just zb perform-migration'", { stdio: "ignore" });
          execSync("rm -rf new-bite", { stdio: "ignore" });
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }

  console.log("\n🎉 All experiments completed!");
}

// Run the experiments
runExperiments().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
