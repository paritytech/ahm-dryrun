# Zombie-bite

## Intro

`zombie-bite` is an cli tool that allow you to _fork and spawn_ live networks (e.g polkadot/kusama) keeping the _live state_ with the needed customizations in order to make the new chain/s keep progressing.

### Instruction to spawn Polkadot(with sudo)/AH

 - Install `zombie-bite`

   ```
   cargo install --git https://github.com/pepoviola/zombie-bite --bin zombie-bite
   ```

 - Update code

    ```
    git submodule update --recursive
    ```
  - Run zombie-bite through `just`

    ```
    just create-polkadot-pre-migration-snapshot
    ```

    And you will have a new network spawned 🚀

### Run migration

Then you can kickoff the migration with this script

https://github.com/paritytech/ahm-dryrun/blob/main/zombie-bite-scripts/rc_migrator_schedule_migration.js

Or you can use this one

https://github.com/paritytech/ahm-dryrun/blob/main/zombie-bite-scripts/report_account_migration_status.ts (kickoff the migration and monitor the progress)

by running

```
just report-account-migration-status
```

For both you need to set the _env var_ `ZOMBIE_BITE_RC_PORT` from the rpc port of alice.


You should get a new network with the `live state` running locally.
