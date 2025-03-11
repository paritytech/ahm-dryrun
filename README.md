# AHM dry run scripts

Scripts for dry-running the Asset Hub migration and verifying the post-migration state.

Using [Chopsticks](https://github.com/AcalaNetwork/chopsticks) and [PAPI](papi.how).

## Getting started
```
git clone --recursive git@github.com:paritytech/ahm-dryrun.git && cd ahm-dryrun
```

Or, if you've already cloned and didn't use the recursive flag, you can run:
```
git submodule update --init
```

Replacing any paths you want to customise in the env file.

Use the justfile to do most common actions.

> ⚠️ These should probably be migrated to npm scripts in the package.json when the testing tooling is in place.

Start the network with the default options (resuming at the post-state):
```
just build-runtimes
just run
```

List the other available commands with `just help`.

## Contributions
Make any changes to the env rather than to the bare configs.

DBs are provided for resuming post-migration - don't commit your db changes unless you're re-running the migration, and never commit them after tests have run.

## Updating submodules
Make sure to run `git submodule update --recursive` after you pull from the repo to update the submodules to the commits tracked in the repo.

You can run e.g. `cd runtimes && git checkout <commit_hash> && cd - && git add runtimes && git commit` to update the commit that the runtimes submodule points to.