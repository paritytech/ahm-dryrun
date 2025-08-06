mod coverage

set dotenv-load

PROJECT_ROOT_PATH := `DIR="${JUSTFILE:-justfile}"; DIR="$(realpath "$DIR")"; echo "$(dirname "$DIR")"`

# In CI some image doesn't have scp and we can fallback to cp
cp_cmd := `which scp || which cp`

    # Run AHM for Polkadot
# Run AHM for Polkadot
default:
    just ahm polkadot

# ------------------------- ONE-TIME SETUP -------------------------

# only to be run the first time, or when submodules changes.
init:
    git submodule update --init --recursive

# only run once if any of the deps, like ZB, DG, or such are updated
setup:
    git submodule update --remote --merge
    just install-doppelganger
    just install-zombie-bite


# ------------------------- RUNNING AHM -------------------------

ahm runtime *id:
    #!/usr/bin/env bash
    just build {{ runtime }}
    if [ -z "{{ id }}" ]; then
        migration_id="migration-run-$(date +%s)"
    else
        migration_id="migration-run-{{ id }}"
    fi

    npm run build
    PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
        npm run ahm \
        "./$migration_id" \
        "{{runtime}}:${RUNTIME_WASM}/{{runtime}}_runtime.compact.compressed.wasm" \
        "asset-hub:${RUNTIME_WASM}/asset_hub_{{runtime}}_runtime.compact.compressed.wasm"

# ------------------------- BUILDING RUNTIMES -------------------------

# only run once, per the runtime that you want to test.
build runtime:
    #!/usr/bin/env bash
    if [ "{{ runtime }}" = "paseo" ]; then
        cd ${PASEO_PATH} && ${CARGO_CMD} build --release -p asset-hub-paseo-runtime -p paseo-runtime && cd ..
        {{ cp_cmd }} ${PASEO_PATH}/target/release/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    elif [ "{{ runtime }}" = "polkadot" ]; then
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release -p asset-hub-polkadot-runtime -p polkadot-runtime && cd ..
        {{ cp_cmd }} ${RUNTIMES_PATH}/target/release/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    elif [ "{{ runtime }}" = "kusama" ]; then
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release -p asset-hub-kusama-runtime -p staging-kusama-runtime && cd ..
        {{ cp_cmd }} ${RUNTIMES_PATH}/target/release/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    else
        echo "Error: Unsupported runtime '{{ runtime }}'. Supported runtimes are: paseo, polkadot, kusama"
        exit 1
    fi

# ------------------------- RUNNING E2E TESTS -------------------------

e2e-tests *TEST:
    cd ${PET_PATH} && yarn && yarn test {{ TEST }}

wah-e2e-tests *TEST:
    #!/usr/bin/env bash
    # if no test modules are provided, run all of them
    tests="assetHubWestend."
    for test in {{ TEST }}; do
        tests="$tests assetHubWestend.$test"
    done
    just e2e-tests $tests

# Run the migration tests on westend
run-westend-migration-tests:
    npm run build
    npm run compare-state

# -------------------------------- Running AHM with Chopsticks [NOT SUPPORTED RIGHT NOW] --------------------------------
# Run the network migration with Chopsticks
run:
    just submodule-init
    just submodule-update
    just build-polkadot
    npm install
    npm run build
    npm run chopsticks-migration

# Run the network from the pre-migration state
run-pre:
    POLKADOT_BLOCK_NUMBER=${POLKADOT_BLOCK_NUMBER_PRE} POLKADOT_ASSET_HUB_BLOCK_NUMBER=${POLKADOT_ASSET_HUB_BLOCK_NUMBER_PRE}  npx @acala-network/chopsticks@latest xcm -r ./configs/polkadot.yml -p ./configs/polkadot-asset-hub.yml

# Create a snapshot for polkadot RC and AH from local nodes
fetch-storage:
    npx @acala-network/chopsticks@latest fetch-storages '0x' --endpoint=${POLKADOT_RPC}:${RELAY_NODE_RPC_PORT} --block ${POLKADOT_BLOCK_NUMBER} --config ./configs/polkadot.yml
    npx @acala-network/chopsticks@latest fetch-storages '0x' --endpoint=wss://polkadot-asset-hub-rpc.polkadot.io --block ${POLKADOT_ASSET_HUB_BLOCK_NUMBER} --config ./configs/polkadot-asset-hub.yml

report-account-migration-status:
    npm run build
    npm run report-account-migration-status

# Install dependencies for testing
test-prepare:
    npm install