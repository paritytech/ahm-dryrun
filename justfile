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
    SKIP_WASM_BUILD=1 cargo install --git https://github.com/paritytech/doppelganger-wrapper --branch doppelganger-stable2509-1 --bin doppelganger \
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

# Install `pdu` binary in your system
install-pdu:
    cargo install polkadot-du --locked

# ------------------------- BUILDING RUNTIMES -------------------

# only run once, per the runtime that you want to test.
build runtime:
    #!/usr/bin/env bash
    set -xe
    mkdir -p ./runtime_wasm

    if [ "{{ runtime }}" = "polkadot" ]; then
        # only enable `metadata-hash`, but not `on-chain-release-build` to still have logs enabled.
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --profile production --features metadata-hash,polkadot-ahm -p asset-hub-polkadot-runtime -p polkadot-runtime && cd ..
        cp ${RUNTIMES_PATH}/target/production/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    elif [ "{{ runtime }}" = "kusama" ]; then
        # only enable `metadata-hash`, but not `on-chain-release-build` to still have logs enabled.
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --profile production --features metadata-hash,kusama-ahm -p asset-hub-kusama-runtime -p staging-kusama-runtime && cd ..
        cp ${RUNTIMES_PATH}/target/production/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
        # rename staging_kusama_runtime.compact.compressed.wasm to kusama_runtime.compact.compressed.wasm for naming convention compatibility
        mv ./runtime_wasm/staging_kusama_runtime.compact.compressed.wasm ./runtime_wasm/kusama_runtime.compact.compressed.wasm
    else
        echo "Error: Unsupported runtime '{{ runtime }}'. Supported runtimes are: polkadot, kusama"
        exit 1
    fi

# ------------------------- RUNNING INTEGRATION TESTS -------------------

compare-state base_path runtime:
    just ahm _npm-build
    npm run create-migration-done-file {{ base_path }}
    npm run compare-state {{ base_path }} {{ runtime }}

find-rc-block-bite network="kusama":
    just ahm _npm-build
    npm run find-rc-block-bite {{ network }}

make-new-snapshot base_path:
    just ahm _npm-build
    npm run make-new-snapshot {{ base_path }}

# ------------------------- RUNNING E2E TESTS -------------------

e2e-tests NETWORK:
    #!/usr/bin/env bash
    set -e

    # Validate NETWORK argument
    if [[ "{{ NETWORK }}" != "kusama" && "{{ NETWORK }}" != "polkadot" ]]; then
        echo "Error: NETWORK must be one of: kusama, polkadot"
        exit 1
    fi

    # Check required environment variables in PET's .env file
    NETWORK_UPPER="{{ NETWORK }}"
    NETWORK_UPPER=${NETWORK_UPPER^^}
    ENDPOINT_VAR="ASSETHUB${NETWORK_UPPER}_ENDPOINT"
    BLOCK_VAR="ASSETHUB${NETWORK_UPPER}_BLOCK_NUMBER"

    # Load PET's .env file if it exists.
    # If not, log that, and run with PET's default. Will cause meaningless test failures if run on an umigrated network
    # due to absence of required pallets.
    if [[ -f "${PET_PATH}/.env" ]]; then
        source "${PET_PATH}/.env"
    fi

    if [[ -z "${!ENDPOINT_VAR}" ]]; then
        echo "Warning: ${ENDPOINT_VAR} environment variable is not set in ${PET_PATH}/.env"
        echo "Running with default PET endpoint for network {{ NETWORK }} (check PET source code)"
    fi

    if [[ -z "${!BLOCK_VAR}" ]]; then
        echo "Warning: ${BLOCK_VAR} environment variable is not set in ${PET_PATH}/.env"
        echo "Running with default block number for network {{ NETWORK }} (check PET source code)"
    fi

    echo "Running tests with:"
    echo "  ${ENDPOINT_VAR}=${!ENDPOINT_VAR}"
    echo "  ${BLOCK_VAR}=${!BLOCK_VAR}"

    cd polkadot-ecosystem-tests

    # Install dependencies
    yarn install

    # Run only KAH E2E tests
    failed_count=0
    test_results=""
    NETWORK_CAPITALIZED="{{ NETWORK }}"
    NETWORK_CAPITALIZED=${NETWORK_CAPITALIZED^}
    find packages -name "*assetHub${NETWORK_CAPITALIZED}*e2e*.test.ts" -type f > /tmp/test_list.txt

    # Set up interrupt handler to exit on `CTRL^C` without starting the next set of tests
    # `pkill -P $$` kills all descendant processes which were spawned by the current process, to avoid leaving
    # orphaned processes running.
    # `exit 130` is the standard signal for `SIGINT` in bash.
    trap 'echo -e "\nInterrupted. Killing yarn processes and exiting..."; pkill -P $$; exit 130' INT

    while read -r test; do
        echo "Running E2E test: $test"
        if ! yarn test "$test" -u; then
            failed_count=$((failed_count + 1))
            test_results="${test_results}❌ Test failed: $test\n"
        else
            test_results="${test_results}✅ Test passed: $test\n"
        fi
    done < /tmp/test_list.txt

    # Print results and failure count
    echo -e "$test_results"
    echo "Total failed tests: $failed_count"

    # Exit with failed count as exit code
    exit $failed_count