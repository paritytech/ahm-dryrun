// Monitor migration finished

/*
 * Wrapper to call the `scheduleMigration` fn (defined in helpers)
 * accept 1 positional argument
 * rc_port: the port to use to connect to Alice
 */

import { scheduleMigration } from "./helpers.js";

const main = async () => {
  let rc_port = parseInt(process.argv[2],10);
  await scheduleMigration(rc_port);
  process.exit(0);
};

main().catch(console.log);
