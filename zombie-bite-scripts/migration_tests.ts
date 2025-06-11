import fs from "fs";
import { main as migrationTestMain, ChainConfig } from "../migration-tests/lib.js";

/*
 * Wrapper to call the `main` fn (defined in migration-tets directory)
 * accept 1 positional argument
 * base_path: The directoy used to spawn the network (e.g used by the orchestrator)
 * _NOTE_: This directory should contain 3 files (ports.json, ready.json, migration_done.json)
 *
*/

( async () => {
    let base_path = process.argv[2];

    let ports = JSON.parse(fs.readFileSync(`${base_path}/ports.json`, 'utf-8'));
    let start_blocks = JSON.parse(fs.readFileSync(`${base_path}/ready.json`, 'utf-8'));
    let end_blocks = JSON.parse(fs.readFileSync(`${base_path}/done.json`, 'utf-8'));

    const rc_chain_config: ChainConfig = {
        endpoint: `ws://localhost:${ports.alice_port}`,
        before_block: start_blocks.rc_start_block,
        after_block: end_blocks.rc_finish_block
    };

    const ah_chain_config: ChainConfig = {
        endpoint: `ws://localhost:${ports.collator_port}`,
        before_block: start_blocks.ah_start_block,
        after_block: end_blocks.ah_finish_block
    };

    await migrationTestMain(rc_chain_config, ah_chain_config);
    process.exit(0);
})();