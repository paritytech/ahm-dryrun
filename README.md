# TL;DR

To run AHM for Paseo using Zombie-Bite:
```
git clone --recursive git@github.com:paritytech/ahm-dryrun.git && \
cd ahm-dryrun && \
just init && \
just setup && \
just ahm paseo || echo "Setup failed"
```

# Just commands

We envision interaction with ahm-dryrun mainly using a set of `just` commands. Replacing any paths you want to customise in the `.env` file.

You can run AHM for Polkadot using `just ahm polkadot` or substitute the runtime with a custom one by updating submodules to your branches/commits. There are many things you can do with it but you should not need anything other than these two at first. In case you want to contribute directly to the codebase, see Code Contribution section towards the end of the page.

## Updating submodules

Make sure to run `git submodule update --recursive` after you pull from the repo to update the submodules to the commits tracked in the repo.

You can run e.g. `cd runtimes && git checkout <commit_hash> && cd - && git add runtimes && git commit` to update the commit that the runtimes submodule points to.

**TODO**: make a list of the most common flows that developers may want to use
## Flows

### Run zombie-bite

This will override the runtime with the provided one and the output (database snapshots, chain-specs, config ) will be saved as pre - Context this is just running zombie-bite and can be spawned from ts/js or even from a `just` cmd.

### Run the network from the output of pre

Trigger the migration, monitoring the progress and ones completed create the same output as post - Context: this needs start the network from the previous output (with zombie-bite ), trigger the migration and monitoring the progress and ones completed created the output files. Most of this is already working in the orchestrator (except for creating the output artifacts).
This part need some kind of process that spawn the other ones and we can reuse some parts of the current orchestrator.

### Run the network from the post output

On top of that network run the migration test provided. Context: This needs to spawn the network from the post state and then run the test on top. Spawning here can also be don through zombie-bite (or even from ts/js if is needed)

### E2E Tests on Westend Asset Hub

Polkadot Ecosystem Tests offers, among other things, a suite of E2E tests that run against
live networks.
The PET submodule in this repository is set to branch `ahm-tests`, which adapts the (originally) relaychain E2E suites
to run in post-migration Westend Asset Hub.

To run these E2E tests:

```sh
# runs every PET test
# this will run the adapted test suites on Polkadot/Kusama, and **cause failures** as test suites for AH are
# incompatible with relaychain
just e2e-tests

# runs all E2E suites that have been adapted to WAH
just wah-e2e-tests

# run specific test suite(s)
just e2e-tests scheduler
just e2e-tests staking nominationPools
...
```

# Logs

You can find zombie-bite logs in `~/migration-run-*/sync-node/sync-node.log` or `~/migration-run-*/sync-node-para/sync-node-para.log` folders. `logs/` folder in turn 
combine orchestrator logs with post-ahm testing logs. You can find different level of severance files there.

# Components overview

## Tech stack

- [Chopsticks](https://github.com/AcalaNetwork/chopsticks) and PET for e2e functionality tests
- [PAPI](papi.how) + PJS for orchstrating/controlling e2e AHM flow
- Zombie-Bite + Doppelganger for forking off the network and making migration blocks

## Orchestrator a.k.a. Controller

## Zombie-bite

## Migration tests

## PET tests

# Code Contributions
Make any changes to the env rather than to the bare configs.

# FAQ
## If you've already cloned `ahm-dryrun` repo but didn't use the recursive flag
You can run:
```
git submodule update --init
```
## Help
List the other available commands with `just help`.
