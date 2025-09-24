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

# Initial setup after you cloned the repo. Run it once.
init:
    git submodule update --init --recursive

# Install all dependencies. Run it once.
setup: init
    just install-doppelganger
    just install-zombie-bite
    just install-try-runtime

# ------------------------- INSTALLING DEPENDENCIES -------------

# Install the `doppelganger` binary on your system.
install-doppelganger:
    SKIP_WASM_BUILD=1 cargo install --git https://github.com/paritytech/doppelganger-wrapper --bin doppelganger \
        --bin doppelganger-parachain \
        --bin polkadot-execute-worker \
        --bin polkadot-prepare-worker  \
        --locked --root ${DOPPELGANGER_PATH}

# Install the `zombie-bite` binary on your system.
install-zombie-bite:
    cargo install --git https://github.com/pepoviola/zombie-bite --bin zombie-bite --locked --force

# Install the `try-runtime-cli` binary in your system
install-try-runtime:
    cargo install --git https://github.com/paritytech/try-runtime-cli --locked

# ------------------------- BUILDING RUNTIMES -------------------

# only run once, per the runtime that you want to test.
build runtime:
    #!/usr/bin/env bash
    set -xe
    mkdir -p ./runtime_wasm

    if [ "{{ runtime }}" = "polkadot" ]; then
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --profile production --features on-chain-release-build,polkadot-ahm -p asset-hub-polkadot-runtime -p polkadot-runtime && cd ..
        cp ${RUNTIMES_PATH}/target/production/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    elif [ "{{ runtime }}" = "kusama" ]; then
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --profile production --features on-chain-release-build,kusama-ahm -p asset-hub-kusama-runtime -p staging-kusama-runtime && cd ..
        cp ${RUNTIMES_PATH}/target/production/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
        # rename staging_kusama_runtime.compact.compressed.wasm to kusama_runtime.compact.compressed.wasm for naming convention compatibility
        mv ./runtime_wasm/staging_kusama_runtime.compact.compressed.wasm ./runtime_wasm/kusama_runtime.compact.compressed.wasm
    else
        echo "Error: Unsupported runtime '{{ runtime }}'. Supported runtimes are: polkadot, kusama"
        exit 1
    fi

# ------------------------- RUNNING E2E TESTS -------------------

e2e-tests *TEST:
    cd "${PET_PATH}" && yarn && yarn test "{{ TEST }}"

# ------------------------- RUNNING INTEGRATION TESTS -------------------

compare-state base_path runtime:
    just ahm _npm-build
    npm run compare-state {{ base_path }} {{ runtime }}

find-rc-block-bite network="kusama":
    just ahm _npm-build
    npm run find-rc-block-bite {{ network }}

make-new-snapshot base_path:
    just ahm _npm-build
    npm run make-new-snapshot {{ base_path }}
