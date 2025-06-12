import fs from "fs";
import { main as migrationTestMain } from "../migration-tests/lib.js";

/*
 * Wrapper to call the `main` fn (defined in migration-tets directory)
 * accept 1 positional argument
 * base_path: The directoy used to spawn the network (e.g used by the orchestrator)
 * _NOTE_: This directory should contain 3 files (ports.json, ready.json, migration_done.json)
 *
 */

(async () => {
  let base_path = process.argv[2];

  let ports = JSON.parse(fs.readFileSync(`${base_path}/ports.json`, "utf-8"));
  let start_blocks = JSON.parse(
    fs.readFileSync(`${base_path}/ready.json`, "utf-8"),
  );
  let end_blocks = JSON.parse(
    fs.readFileSync(`${base_path}/done.json`, "utf-8"),
  );

  let alice_port = parseInt(ports.alice_port, 10);
  const rc_endpoint = `ws://localhost:${alice_port}`;
  const rc_before = parseInt(start_blocks.rc_start_block, 10);
  const rc_after = parseInt(end_blocks.rc_finish_block, 10);

  let collator_port = parseInt(ports.collator_port, 10);
  const ah_endpoint = `ws://localhost:${collator_port}`;
  const ah_before = parseInt(start_blocks.ah_start_block, 10);
  const ah_after = parseInt(end_blocks.ah_finish_block, 10);

  await migrationTestMain(
    rc_endpoint,
    rc_before,
    rc_after,
    ah_endpoint,
    ah_before,
    ah_after,
  );
  process.exit(0);
})();
