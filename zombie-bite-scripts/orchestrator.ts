// orchestrator.ts
import { spawn } from 'child_process';
import * as fs from 'fs';
import { watch } from 'chokidar';
import * as dotenv from 'dotenv';

import { scheduleMigration, monitMigrationFinish } from "./helpers.js";

const READY_FILE = "ready.json";
const PORTS_FILE = "ports.json";
const DONE_FILE = "migration_done.json";

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

interface ReadyInfo extends Ports, StarBlocks {}

class Orchestrator {
    private readyWatcher: any;
    private doneWatcher: any;

    async run(base_path: string) {
        try {
            console.log('🧑‍🔧 Starting migration process...');

            // Start zombie-bite process
            console.log('\t 🧑‍🔧 Starting zombie-bite...');
            // TODO: needs to get the runtimes for override
            const zombieBite = spawn("zombie-bite", [
                `polkadot:${process.env.RUNTIME_WASM}/polkadot_runtime.compact.compressed.wasm`,
                `asset-hub:${process.env.RUNTIME_WASM}/asset_hub_polkadot_runtime.compact.compressed.wasm`
            ],
            {
                stdio: 'inherit',
                env: { ...process.env, ZOMBIE_BITE_BASE_PATH: base_path },
            });

            zombieBite.on('error', (err) => {
                console.error('🧑‍🔧 Failed to start zombie-bite:', err);
                process.exit(1);
            });

            console.log('\t 🧑‍🔧 Waiting for ready info from the spawned network...');
            let [start_blocks, ports] = await this.waitForReadyInfo(base_path);
            console.log('\t\t 📩 Ready info received:', start_blocks, ports);
            const { alice_port, collator_port } = ports;


            console.log(`\t 🧑‍🔧 Triggering migration with alice_port: ${alice_port}`);
            await scheduleMigration(alice_port);

            console.log(`\t 🧑‍🔧 Starting monitoring until miragtion finish with ports: ${alice_port}, ${collator_port}`);
            this.monitMigrationFinishWrapper(base_path, alice_port, collator_port)


            console.log('\t 🧑‍🔧 Waiting for migration info...');
            let migration_info = await this.waitForMigrationInfo(base_path);
            console.log('\t\t 📩 Migration info received:', migration_info);

            // TODO: this tests needs a living network or I can shutdown the network and
            // create the post migration snaps?

            // Mock: Run migration tests
            console.log('🧑‍🔧 Running migration tests with ports and blocks...');

            // Mock: Run PET tests
            console.log('🧑‍🔧  Running final PET tests...');

            console.log('\n✅ Migration completed successfully');

        } catch (error) {
            console.error('🧑‍🔧Error in orchestrator:', error);
            process.exit(1);
        }


    }

    private async monitMigrationFinishWrapper(base_path: string, alice_port: string|number, collator_port: string|number): Promise<EndBlocks> {
        // TODO: add limit
        let ongoing = true;
        let result;
        while(ongoing) {
            try {
                result = await monitMigrationFinish(base_path, alice_port, collator_port);
                ongoing = false;
            } catch(e) {
                console.error("Error monitoring", e, "restaring...");
            }
        }

        return result as EndBlocks;
    }

    private async waitForReadyInfo(base_path: string): Promise<[StarBlocks, Ports]> {
        let ready_file = `${base_path}/${READY_FILE}`;
        let ports_file = `${base_path}/${PORTS_FILE}`;
        // console.log("watching file creation for ", ready_file);
        return new Promise((resolve) => {
            this.readyWatcher = watch(base_path, {
                persistent: true,
                awaitWriteFinish: {
                    stabilityThreshold: 100,
                    pollInterval: 1000
                }
            });

            this.readyWatcher.on('all',  (event: any, info: string) => {
                // console.log("event", event, "info", info);
                if(event == 'add' && info.includes(PORTS_FILE)) {
                    const start_info = JSON.parse(fs.readFileSync(ready_file).toString());
                    const ports = JSON.parse(fs.readFileSync(ports_file).toString());
                    this.readyWatcher.close();
                    return resolve([start_info, ports]);
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
                    pollInterval: 1000
                }
            });

            this.doneWatcher.on('all',  (event: string, info: string) => {
                if(event == 'add' && info.includes(DONE_FILE)) {
                    const migration_info = JSON.parse(fs.readFileSync(done_file).toString());
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
    let base_path = base_path_arg || base_path_env || `./migration-run-${Date.now()}`;

    await orchestrator.run(base_path);
}

main().catch(console.error);

