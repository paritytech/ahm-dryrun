// Monit migration finished

/*
 * Wrapper to call the `monitMigrationFinish` fn (defined in helpers)
 * accept 3 positional arguments
 * base_path: the path where we will writing the migration end info (rc_block_end, ah_block_end) in a json file
 * rc_port: The port to use to connect to alice
 * ah_port: The port to use to connect to the collator
*/


import { monitMigrationFinish } from "./helpers.js";

( async () => {
    let base_path = process.argv[2];
    let rc_port = process.argv[3];
    let ah_port = process.argv[4];
    await monitMigrationFinish(base_path, rc_port, ah_port);
    process.exit(0);
})();
