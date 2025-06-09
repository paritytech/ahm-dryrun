// orchestrator.ts
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { watch } from 'chokidar';
import path from 'path';

interface Ports {
    alice_port: number;
    collator_port: number;
}

interface Blocks {
    ah_start_block: number;
    rc_start_block: number;
    ah_finish_block: number;
    rc_finish_block: number;
}

class Orchestrator {
    private readonly envFile = '.env';
    private portsWatcher: any;
    private blocksWatcher: any;

    async run() {
        try {
            // Cleanup any existing .env file
            if (fs.existsSync(this.envFile)) {
                fs.unlinkSync(this.envFile);
            }

            console.log('🧑‍🔧Starting migration process...');

            // Start westend migration tests
            console.log('🧑‍🔧Starting westend migration tests in parallel...');
            const westendTests = spawn('just', ['run-westend-migration-tests'], {
                stdio: 'inherit'
            });

            westendTests.on('error', (err) => {
                console.error('🧑‍🔧Failed to start westend migration tests:', err);
                process.exit(1);
            });
            

            // Start zombie-bite process
            console.log('🧑‍🔧Starting zombie-bite in parallel...');
            const zombieBitePath = path.join(__dirname, 'zombie-bite', 'target', 'debug', 'zombie-bite');
            const zombieBite = spawn(zombieBitePath, [], {
                stdio: 'inherit'
            });

            zombieBite.on('error', (err) => {
                console.error('🧑‍🔧Failed to start zombie-bite:', err);
                process.exit(1);
            });

            // Wait for ports
            console.log('🧑‍🔧 Waiting for ports...');
            const ports = await this.waitForPorts();
            console.log('📩Ports received:', ports);

            // Mock: Trigger migration
            console.log(`\n🧑‍🔧 Triggering migration with alice_port: ${ports.alice_port}`);
            
            // Mock: Start monitoring
            console.log(`🧑‍🔧 Starting monitoring with ports: ${ports.alice_port}, ${ports.collator_port}`);
            
            // Wait for blocks
            console.log('\n🧑‍🔧 Waiting for blocks...');
            const blocks = await this.waitForBlocks();
            console.log('📩Blocks Received :', blocks);

            // Mock: Stop monitoring script
            console.log('\n🧑‍🔧 Stopping monitoring script...');

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

    private async waitForPorts(): Promise<Ports> {
        return new Promise((resolve) => {
            this.portsWatcher = watch(this.envFile, {
                persistent: true,
                awaitWriteFinish: {
                    stabilityThreshold: 100,
                    pollInterval: 1000
                }
            });

            this.portsWatcher.on('change', () => {
                dotenv.config({ override: true });
                const alice_port = parseInt(process.env.ALICE_PORT || '', 10);
                const collator_port = parseInt(process.env.COLLATOR_PORT || '', 10);

                if (!isNaN(alice_port) && !isNaN(collator_port)) {
                    this.portsWatcher.close();
                    resolve({ alice_port, collator_port });
                }
            });
        });
    }

    private async waitForBlocks(): Promise<Blocks> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const statusInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                console.log(`🧑‍🔧Waiting for blocks... (${elapsed}s)`);
            }, 5000);

            const checkBlocks = () => {
                dotenv.config({ override: true });
                const blocks = {
                    ah_start_block: parseInt(process.env.AH_START_BLOCK || '', 10),
                    rc_start_block: parseInt(process.env.RC_START_BLOCK || '', 10),
                    ah_finish_block: parseInt(process.env.AH_FINISH_BLOCK || '', 10),
                    rc_finish_block: parseInt(process.env.RC_FINISH_BLOCK || '', 10),
                };

                if (!Object.values(blocks).some(isNaN)) {
                    clearInterval(statusInterval);
                    this.blocksWatcher?.close();
                    resolve(blocks);
                }
            };

            // Check current file content periodically
            const checkInterval = setInterval(checkBlocks, 1000);

            this.blocksWatcher = watch(this.envFile, {
                persistent: true,
                awaitWriteFinish: {
                    stabilityThreshold: 100,
                    pollInterval: 100
                }
            });

            this.blocksWatcher.on('change', () => {
                checkBlocks();
            });

            // Check immediately
            checkBlocks();
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Create just command
async function main() {
    const orchestrator = new Orchestrator();
    await orchestrator.run();
}

main().catch(console.error);
