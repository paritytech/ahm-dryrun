// Test for rcMigrator.scheduleMigration call

/*
 * This test the condition for the call to rcMigrator.scheduleMigration
 * First trying to schedule the migration between less that 2 session times
 * and check we get the expected error `rcMigrator.EraEndsTooSoon`.
 * The submit again the tx but with a valid schedule (past 2 sessions) and wait until we ensure the
 * event `StakingElectionsPaused` was emited.
 * accept 1 positional argument
 * rc_port: the port to use to connect to Alice
 */

import { scheduleMigration, checkScheduleMigrationCallStatus, waitForEvent } from "./helpers.js";
import { logger } from "../shared/logger.js";

const main = async () => {
  let rc_port = parseInt(process.argv[2],10);

  // first check if sending with an invalid schedule raise the correct error
let tx_block = await scheduleMigration({
    rc_port,
    ignore_staking_check: false,
  });

  console.log(`tx included in block: ${tx_block}`);

  // check migration status
  const check_result = await checkScheduleMigrationCallStatus(tx_block as string, {success: false, errorName: "EraEndsTooSoon"});
  if(!check_result) {
    logger.error("Invalid schedule didn't result in an error.");
    process.exit(1)
  }

  logger.info("✅ invalid schedule return the expected error");

  // Then send a valid schedule and listen events
  tx_block = await scheduleMigration({rc_port,ignore_staking_check: false, rc_block_start: { after: 601 }});
  console.log(`tx included in block: ${tx_block}`);

  let results = await Promise.all([
    checkScheduleMigrationCallStatus(tx_block as string, {success: true}),
    waitForEvent("StakingElectionsPaused")
  ]);

  let exit_code = 0;
  for(const result in results) {
    if(!result) {
      const msg = exit_code == 0 ? `Error in scheduleMigration call` : "Error finding the expected event 'StakingElectionsPaused'";
      logger.error(msg);
      exit_code +=1;
    }
  }

  if(exit_code == 0) {
    logger.info("✅  schedule migration OK, and event 'StakingElectionsPaused' emited");
  }
  process.exit(exit_code);

};

main().catch(err => {
  console.log(err);
  process.exit(1);
});
