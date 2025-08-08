# MAINTAIN: Please put subcommands into the `justfiles` directory.
# Legacy version at https://github.com/paritytech/ahm-dryrun/blob/f229a46614202d87bd43b796d69748f804c57705/just-old

set dotenv-load

mod coverage
mod zb "justfiles/zb.justfile"
mod ahm "justfiles/ahm.justfile"

_default: help

help:
    @echo "👋 Welcome to Asset Hub Migration (AHM) Test Suite"
    @echo "Docs are in the README and the repo: https://github.com/paritytech/ahm-dryrun\n"
    @just --list --unsorted

# Initialize or update the submodules.
init:
    git submodule update --init --recursive

# Install all dependencies. Run it when changing branches or pulling.
setup: init
    just install-doppelganger
    just install-zombie-bite
    just install-monitor

# ------------------------- INSTALLING DEPENDENCIES -------------

# Install the `doppelganger` binary on your system.
install-doppelganger:
    SKIP_WASM_BUILD=1 cargo install --git https://github.com/paritytech/doppelganger-wrapper --bin doppelganger \
        --bin doppelganger-parachain \
        --bin polkadot-execute-worker \
        --bin polkadot-prepare-worker  \
        --locked --force --root ${DOPPELGANGER_PATH}

# Install the `zombie-bite` binary on your system.
install-zombie-bite:
    cargo install --git https://github.com/pepoviola/zombie-bite --bin zombie-bite --locked --force

# Install the AHM Monitor
install-monitor:
    mkdir -p ./ahm-monitor/backend/data
    cd ahm-monitor/backend \
    && npm install \
    && npm run migrate \
    && npm run push \
    && npm run build

# ------------------------- BUILDING RUNTIMES -------------------

# only run once, per the runtime that you want to test.
build runtime:
    #!/usr/bin/env bash
    if [ "{{ runtime }}" = "paseo" ]; then
        cd ${PASEO_PATH} && ${CARGO_CMD} build --release -p asset-hub-paseo-runtime -p paseo-runtime && cd ..
        cp ${PASEO_PATH}/target/release/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    elif [ "{{ runtime }}" = "polkadot" ]; then
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release -p asset-hub-polkadot-runtime -p polkadot-runtime && cd ..
        cp ${RUNTIMES_PATH}/target/release/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    elif [ "{{ runtime }}" = "kusama" ]; then
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release -p asset-hub-kusama-runtime -p staging-kusama-runtime && cd ..
        cp ${RUNTIMES_PATH}/target/release/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    else
        echo "Error: Unsupported runtime '{{ runtime }}'. Supported runtimes are: paseo, polkadot, kusama"
        exit 1
    fi

# ------------------------- RUNNING E2E TESTS -------------------

e2e-tests *TEST:
    cd ${PET_PATH} && yarn && yarn test {{ TEST }}

# ------------------------- CLEANING UP -------------------------

# Clean up some generated clutter.
clean:
    rm -rf migration-run-*
    git checkout HEAD -- .papi/descriptors/{package.json,dist/{index.d.ts,index.js,index.mjs}}
    rm -f zombie-bite/doppelganger/{.crates.toml,.crates2.json}

# Clean up everything.
clean-harder: clean
    rm -f package-lock.json .package.json.sum
    rm -rf logs node_modules dist
    rm -rf paseo-runtimes/target
    rm -rf runtimes/target
    rm -rf polkadot-ecosystem-tests/node_modules
    rm -rf ahm-monitor/backend/{node_modules,dist,data}
