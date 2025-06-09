// Monit migration finished

/*
 * Wrapper to call the `scheduleMigration` fn (defined in helpers)
 * accept 1 positional argument
 * rc_port: The port to use to connect to alice
*/


import { scheduleMigration } from "./helpers.js";

( async () => {
    let rc_port = process.argv[2];
    await scheduleMigration(rc_port);
    process.exit(0);
})();
