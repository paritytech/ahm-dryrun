// Monitor migration finished

/*
 * Wrapper to call the `scheduleMigration` fn (defined in helpers)
 * accept 1 positional argument
 * rc_port: the port to use to connect to Alice
 */

import { scheduleMigration, scheduleMigrationArgs, checkScheduleMigrationCallStatus } from "./helpers.js";

const main = async () => {
  let rc_port = parseInt(process.argv[2],10);
  // Allow to pass a __json string__ with the migration call fields
  let migration_call_args: scheduleMigrationArgs = process.argv[3] ? JSON.parse(process.argv[3]) : Object.assign({});
  const tx_block = await scheduleMigration({
    rc_port,
    rc_block_start: migration_call_args.rc_block_start,
    cool_off_end: migration_call_args.cool_off_end,
    warm_up_end: migration_call_args.warm_up_end,
    ignore_staking_check: migration_call_args.ignore_staking_check,
    finalization: migration_call_args.finalization,
  });

  console.log(`Migration sheduled, tx included in block: ${tx_block}`);
  process.exit(0);
};

main().catch(err => {
  console.log(err);
  process.exit(1);
});
