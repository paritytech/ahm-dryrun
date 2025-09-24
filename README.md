# TL;DR

## 🧟 Test Results

[![AHM flow (all steps)](https://github.com/paritytech/ahm-dryrun/actions/workflows/zombie-bite.yml/badge.svg)](https://github.com/paritytech/ahm-dryrun/actions/workflows/zombie-bite.yml)

The AHM flow runs automatically:
- **Kusama**: Daily
- **Polkadot**: Sundays only

Each workflow run tests:
- 🔄 **Migration**: Asset Hub migration execution
- 🦀 **Rust Tests**: Runtime verification tests
- 📊 **TS Comparison**: State comparison tests
- 🧪 **PET Tests**: Polkadot Ecosystem Tests

**[View Latest Test Results →](https://github.com/paritytech/ahm-dryrun/actions/workflows/zombie-bite.yml). See `workflow_summary` step for results of each step.**

> 💡 Click on any workflow run to see the detailed test summary table showing which tests passed or failed.

To run AHM for Kusama or Polkadot using Zombie-Bite:
```
git clone --recursive git@github.com:paritytech/ahm-dryrun.git && \
cd ahm-dryrun && \
just init && \
just setup && \
just ahm kusama || echo "Setup failed"
```

# Just commands

- `just` to see the list of commands
- `just init` to initialize the repo
- `just setup` to install dependencies
- `just ahm [polkadot|kusama]` to run the Migration for a given runtime. No args prints the help menu.
- `just zb [bite|spawn|perform-migration]` to run the Zombie-Bite commands. No args prints the help menu.
- `just e2e-tests` to run the E2E tests
<!-- TODO @donal: Monitoring here -->

## AHM Flows (manual steps)

The cmd `just ahm <runtime>` uses the `orchestrator` as main control flow to coordinate the usage of a mix of tools (e.g:[zombie-bite](https://github.com/pepoviola/zombie-bite), [doppelganger](https://github.com/paritytech/doppelganger-wrapper)) and `ts` scripts (under zombie-bite-scripts), but those are designed to allow you to use (and _reuse_) each _component_ manully in order to easily debug each __step__.

### Requirements
In order to use this tool you will need these binaries available in your PATH:

- [Doppelganger binaries](https://github.com/paritytech/doppelganger-wrapper): doppelganger, doppelganger-parachain, workers
- [Zombie-bite](https://github.com/pepoviola/zombie-bite)
- [Node.js](https://nodejs.org) (v22 or higher)

This tools are installed as part of the `setup` command.

### Defining the `base_path`

One important concept to run all the needed steps is defining the `base_path`, this will be the directory where all the intermedia _artifacts_ will be stored, and each of the tools allow to pass the _path_ as argument.

### Step 0: `bite` the live network

The _first_ step consists of _biting_ a live network, and once completed, creating the _artifacts_ needed to _spawn_ a new instance of this network (rc/ah) and ensure block production.

In order to run _step 0_, you can run:

```bash
just zb bite <base_path> <polkadot|kusama>

e.g: just zb bite ./migration-run polkadot
```

This will run `zombie-bite`, storing the resulting _artifacts_ under `<base_path>/bite` (e.g: ./migration-run/bite) directory.
This directory should contain these files:

- `config.toml` : zombienet compatible configuration to spawn an instance of the network.
- `<runtime>-spec.json` : chain-spec of the relaychain.
- `asset-hub-<runtime>-spec.json` : chain-spec of AH.
- `<runtime>-snap.tgz` : Db snapshot of the relaychain.
- `asset-hub-<runtime>-snap.tgz` : Db snapshot of AH.


_NOTE_: this step performs a _warp_ sync of both rc/ah and can take some time (20/25 mins on avg. for polkadot).


### Step 1: `spawn` network instance (and perform migration)

Once _step 0_ is completed, you will have all the needed artifacts to spawn a new instance of the _bitten_ networks (as many times as you want) with the command:

```bash
just zb spawn <base_path>

e.g: just zb spawn ./migration-run
```

This will run `zombie-bite` to _spawn_ a new instance of the _bitted_ network and will print the network info (with direct links for `pjs`/`papi`).

#### Step 1.1 Perform migration

Since the last step _spawn_ the network and _capture_ the terminal, you need open a new terminal instance to run the next _sub-steps_.
In order to perform the migration, you need to run the following command:

```bash
just zb perform-migration <base_path>

e.g: just zb perform-migration ./migration-run
```

This will trigger the migration and a monitoring script that will keep checking the `stage` of the migration until completion.

Once the migration is completed, the network instance spawned as part of _step 1_ will be terminated and all the needed artifacts to spawn a new instance (with the _post_ migration step) will be created in the `<base_path>/spawn` (e.g: ./migration-run/spawn) directory.

- `config.toml` : zombienet compatible configuration to spawn an instance of the network.
- `<runtime>-spec.json` : chain-spec of the relaychain.
- `asset-hub-<runtime>-spec.json` : chain-spec of AH.
- `<runtime>-snap.tgz` : Db snapshot of the relaychain.
- `asset-hub-<runtime>-snap.tgz` : Db snapshot of AH.

__Also__: after the migration is done a file called `migration_done.json` will be generated in the __base_path__ with the block height (of both rc/ah) where the migration was completed.

The content of the file will be:

```json
{
    "rc_finish_block": <block number>,
    "ah_finish_block": <block number>
}
```

### Step 2: `spawn` network instance (and run post-migration tests)

The last step is running the _post_ migration tests, but first you need to _spawn_ an instance of the network (with the state from the previous step) with this command:

```bash
just zb spawn <base_path> post

e.g: just zb spawn ./migration-run post
```

This will spawn a new instance of the network (with the state of the previous step) and will print all the network info (ports) to run the _post migration_ tests.

Then you can run tests in a _different terminal_.

### E2E Tests on Asset Hub

Polkadot Ecosystem Tests offers, among other things, a suite of E2E tests that run against live networks.
The PET submodule in this repository is set to a branch which extends the existing E2E suites, originally designed to
run on a relay chain, to run in post-migration Asset Hubs - staking, governance, etc.

In order to run PET tests on the post-migration Asset Hub chain of a network `<network-name>` created by `zombie-bite`:

1. Start the network with `just zb spawn <base_path> post` (if it is not already running)
2. Note the port number `<collator-port>` the collator is running on, and the `<block-number>` the AH chain is on
3. in `./polkadot-ecosystem-tests/.env`, add the following data
    ```sh
    ASSETHUB<network-name>_ENDPOINT=ws://[::1]:<collator-port>
    ASSETHUB<network-name>_BLOCK_NUMBER=<block-number>
    ```
    - Some warnings below ⚠️:
    - ⚠️🚨 The `<network-name>` must be fully capitalized: `ASSETHUBKUSAMA_ENDPOINT` will work; `ASSETHUBkusama_ENDPOINT` will not
    - ⚠️🚨 use `ws://[::1]:<collator-port>` and `ws://localhost:<collator-port>` over `ws://127.0.0.1:<collator-port>` 
4. Run `just e2e-tests packages/<network-name>`

All steps but the last can be ignored on chains that have already migrated.
This is because PET is setup to periodically fetch chains' latest block numbers to that state in tests, and thus
dispenses a local testnet for access to post-AHM runtimes.

#### Notes on E2E `just e2e-tests` command

It accepts multiple arguments, which are then passed to `yarn` to further specify the scope of the tests.

```sh
# This runs every PET test; this takes some time, as it includes relay <-> system parachain XCM connectivity tests,
# E2E tests for relay + parachains, etc.
just e2e-tests

# Run every test that exists for Kusama chains: relay, AH, bridge hub, coretime, etc.
just e2e-tests packages/kusama
# Run every test suite that exists for PAH, E2E or otherwise
`just e2e-tests assetHubPaseo`
# Run the E2E test suite for the scheduler pallet.
# Note that this will do so for both the relay chain, and KAH: post-AHM, the AH's runtime will contain that pallet, and
# recall that the branch this repository's PET submodule uses implements that test suite.
just e2e-tests kusama.scheduler
# Run the staking and nomination pools E2E test suites in whichever chains that have such a suite.
just e2e-tests staking nominationPools
...
```

Alternatively, after `cd`ing to the PET directory, `yarn` test may be called directly.

# Logs

You can find zombie-bite logs in `~/migration-run-*/sync-node/sync-node.log` or `~/migration-run-*/sync-node-para/sync-node-para.log` folders. `logs/` folder in turn
combine orchestrator logs with post-ahm testing logs. You can find different level of severance files there.

# Components overview

## Tech stack

- [Chopsticks](https://github.com/AcalaNetwork/chopsticks) and PET for e2e functionality tests
- [PAPI](https://papi.how/) + PJS for orchstrating/controlling e2e AHM flow
- Zombie-Bite + Doppelganger for forking off the network and making migration blocks
<!-- TODO @donal: Monitoring here -->

## Migration tests

# Code Contributions
Make any changes to the env rather than to the bare configs.


## Updating submodules

Make sure to run `git submodule update --recursive` after you pull from the repo to update the submodules to the commits tracked in the repo.

You can run e.g. `cd runtimes && git checkout <commit_hash> && cd - && git add runtimes && git commit` to update the commit that the runtimes submodule points to.


# FAQ

## If you've already cloned `ahm-dryrun` repo but didn't use the recursive flag
You can run:
```
git submodule update --init
```

## Node/`npm` errors

If errors like

```
npm warn Unknown project config "// ensure node engine version". This will stop working in the next major version of npm.
npm error code EBADENGINE
npm error engine Unsupported engine
```

occur, an update to the local version of `node/npm` may be necessary.

## `zombie-bite` and nested logs

When shown a log line similar to

```
...
2025-08-07 16:21:55 [info]: 	 ⚙️ Starting zombie-bite (📓 logs ./migration-run-1754580086/logs/zombie-bite.log)... {
...
```

note that the logs in the file mentioned may be static, and that for further information on the state of the process, a
nested log file, mentioned in the file above by path, should be opened.

## Error in ZB collator

If some of the nodes in a network spawned with `just zb spawn ./migration-run post` fail to start with errors such as

```bash
$ tail -f ~/ahm-dryrun/migration-run/post/collator/collator.log
  27: std::sys::pal::unix::thread::Thread::new::thread_start
  28: __pthread_cond_wait


Thread 'tokio-runtime-worker' panicked at 'SelectNextSome polled after terminated', ~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/futures-util-0.3.31/src/stream/stream/select_next_some.rs:32

This is a bug. Please report it at:

	https://github.com/paritytech/doppelganger-wrapper/issues/new
```

this may be caused by improperly shut down nodes in a previously spawned instance.

Run `pkill -f doppelganger`, and try again.

## Help
List the other available commands with `just help`.
