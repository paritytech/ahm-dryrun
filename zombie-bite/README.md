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


---

### Other alternatives:

#### How to use a custom `wasm` (polkadot/ah)

In the case you want to provide a custom wasm (and not build it as part of the flow), you can use this steps to get a new network spawned:

- `just build-doppelganger`
- `just install-zombie-bite`
- `source .env`
- `PATH=$(pwd)/${DOPPELGANGER_PATH}/target/release:$PATH zombie-bite polkadot:<path to compact.compressed.wasm> asset-hub:<path to compact.compressed.wasm>`


This will spawn the network, with the runtimes overridden.


#### How to use zombie-cli to spawn a network with a custom `wasm` and `snapshot`

In the case you have a _custom snapshot_ and _wasm_ and you want to spawn a network, you can use `zombie-cli` to use it. For that you need to create a _toml_ configuration of your network.

For example (config.toml):

```toml
[settings]
timeout = 3600
node_spawn_timeout = 600

[relaychain]
chain = "polkadot"
default_command = "doppelganger"
default_db_snapshot = "./polkadot-snap.tgz"
default_args = [
    "-l=babe=trace,grandpa=info,runtime=trace,consensus::common=trace,parachain=debug",
    "--discover-local",
    "--allow-private-ip",
    "--no-hardware-benchmarks",
]
chain_spec_path = "./polkadot-spec.json"

[[relaychain.nodes]]
name = "alice"
rpc_port = 63168

[[relaychain.nodes]]
name = "bob"


[[parachains]]
id = 1000
chain = "asset-hub-polkadot"
default_command = "polkadot-parachain"
default_db_snapshot = "./asset-hub-polkadot-snap.tgz"
chain_spec_path = "./asset-hub-polkadot-spec.json"

[[parachains.collators]]
name = "collator"
args = [
    "--relay-chain-rpc-urls=ws://127.0.0.1:63168",
    "-l=aura=debug,runtime=debug,cumulus-consensus=trace,consensus::common=trace,parachain::collation-generation=trace,parachain::collator-protocol=trace,parachain=debug",
    "--force-authoring",
    "--discover-local",
    "--allow-private-ip",
    "--no-hardware-benchmarks",
]
rpc_port = 63170

```

_NOTE_:In this case, since we are providing also a custom `chain-spec` for both (rc/ah).

And then you can run:

```
RUST_LOG=zombie=debug zombie-cli spawn -p native config.toml
```



