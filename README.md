# AHM dry run scripts

Scripts for dry-running the Asset Hub migration and verifying the post-migration state.

Using [Chopsticks](https://github.com/AcalaNetwork/chopsticks) and [PAPI](papi.how).

## Getting started
Source the env, replacing any paths you want to customise.
Use the justfile to do most common actions.

Start the network with the default options (resuming at the post-state):
```
just run
```

Re-run the migration from a new block number:

make your changes to the env
```
just migrate
```

List the other available commands with `just`.


## Contributions
DBs are provided for resuming post-migration - don't commit your db changes unless you're re-running the migration. There will be a script for this.