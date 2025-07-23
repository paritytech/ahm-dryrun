mod coverage

set dotenv-load

PROJECT_ROOT_PATH := `DIR="${JUSTFILE:-justfile}"; DIR="$(realpath "$DIR")"; echo "$(dirname "$DIR")"`

# In CI some image doesn't have scp and we can fallback to cp

cp_cmd := `which scp || which cp`

# Fork network and run tests for polkadot from the post-migration state
default:
    just run

# Run the network migration
run:
    just submodule-init
    just submodule-update
    just build-polkadot
    npm install
    npm run build
    npm run chopsticks-migration

# Run the network from the pre-migration state
run-pre:
    POLKADOT_BLOCK_NUMBER=${POLKADOT_BLOCK_NUMBER_PRE} POLKADOT_ASSET_HUB_BLOCK_NUMBER=${POLKADOT_ASSET_HUB_BLOCK_NUMBER_PRE} POLKADOT_COLLECTIVES_BLOCK_NUMBER=${POLKADOT_COLLECTIVES_BLOCK_NUMBER_PRE} npx @acala-network/chopsticks@latest xcm -r ./configs/polkadot.yml -p ./configs/polkadot-asset-hub.yml -p ./configs/polkadot-collectives.yml

# Create a snapshot for polkadot RC and AH from local nodes
fetch-storage:
    npx @acala-network/chopsticks@latest fetch-storages '0x' --endpoint=${POLKADOT_RPC}:${RELAY_NODE_RPC_PORT} --block ${POLKADOT_BLOCK_NUMBER} --config ./configs/polkadot.yml
    npx @acala-network/chopsticks@latest fetch-storages '0x' --endpoint=wss://polkadot-asset-hub-rpc.polkadot.io --block ${POLKADOT_ASSET_HUB_BLOCK_NUMBER} --config ./configs/polkadot-asset-hub.yml

# Run a local relay and asset hub node to speed up snapshot creation
run-chain:
    ${SDK_BUILD_ARTIFACTS_PATH}/polkadot-omni-node --chain ${SDK_PATH}/cumulus/polkadot-parachain/chain-specs/asset-hub-polkadot.json -lruntime=info --sync "warp" --database paritydb --blocks-pruning 600 --state-pruning 600 --base-path ~/Downloads/ --no-hardware-benchmarks --rpc-max-request-size 100000000 --rpc-max-response-size 100000000 --rpc-port ${AH_NODE_RPC_PORT} \
                                                                                                                          -- -lruntime=info --sync "warp" --database paritydb --blocks-pruning 600 --state-pruning 600 --base-path ~/Downloads/ --no-hardware-benchmarks --rpc-max-request-size 100000000 --rpc-max-response-size 100000000 --rpc-port ${RELAY_NODE_RPC_PORT}

# Build the omni-node
build-omni-node:
    cd ${SDK_PATH} && cargo build --release -p polkadot-omni-node

# Update the runtimes submodule
submodule-update:
    git submodule update --recursive
    @echo '\nYou probably want to now run `just build-<runtime>` for westend, kusama or polkadot'

# Initialize the submodules
submodule-init:
    git submodule update --init --recursive

# Build the kusama runtimes and copy back
build-kusama:
    cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release --features=on-chain-release-build -p asset-hub-kusama-runtime -p kusama-runtime
    {{ cp_cmd }} ${RUNTIMES_BUILD_ARTIFACTS_PATH}/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/

# Build the polkadot runtimes and copy back
build-polkadot *EXTRA:
    cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release --features=metadata-hash {{ EXTRA }} -p asset-hub-polkadot-runtime -p polkadot-runtime -p collectives-polkadot-runtime
    {{ cp_cmd }} ${RUNTIMES_BUILD_ARTIFACTS_PATH}/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/

# Build the paseo runtimes and copy back
build-paseo *EXTRA:
    cd ${PASEO_PATH} && ${CARGO_CMD} build --release --features=metadata-hash {{ EXTRA }} -p asset-hub-paseo-runtime -p paseo-runtime -p collectives-paseo-runtime
    {{ cp_cmd }} ${RUNTIMES_BUILD_ARTIFACTS_PATH}/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/

clean-westend:
    # cleanup is required for proper porting, as the porting procedure is not idempotent
    echo "Cleaning up any modifications to ${SDK_PATH}"
    cd "${SDK_PATH}" && case "${PWD}" in \
        {{ PROJECT_ROOT_PATH }}/polkadot-sdk) git reset --hard && git clean -fdx ;; \
        *) echo "ERROR: SDK_PATH must be a 'polkadot-sdk' directory but got ["${PWD}"] instead" && exit 1 ;; \
    esac

init-westend:
    echo "Initializing Westend for building"
    if ! command -v zepter &> /dev/null; then cargo install --locked zepter; fi
    flag="{{ PROJECT_ROOT_PATH }}/${SDK_PATH}/.initialized"; \
    if [ ! -f "${flag}" ]; then \
      just clean-westend && \
      cd "${RUNTIMES_PATH}/integration-tests/ahm" && \
        just port westend "{{ PROJECT_ROOT_PATH }}/${SDK_PATH}" "cumulus/test/ahm" && \
          touch "${flag}"; \
    else \
      echo "Westend already initialized."; \
    fi

build-westend:
    echo "Building Westend"
    cd "${SDK_PATH}" && git checkout oty-donal-ahm-builds && "${CARGO_CMD}" build --release --features=metadata-hash,fast-runtime -p asset-hub-westend-runtime -p westend-runtime
    find "${SDK_BUILD_ARTIFACTS_PATH}/wbuild" -name '*westend*.compact.compressed.wasm' -exec {{ cp_cmd }} {} ./runtime_wasm/ \;

build-doppelganger:
    cd ${DOPPELGANGER_PATH} && \
    SKIP_WASM_BUILD=1 cargo build --release -p polkadot-doppelganger-node --bin doppelganger && \
    SKIP_WASM_BUILD=1 cargo build --release -p polkadot-parachain-bin --features doppelganger --bin doppelganger-parachain && \
    SKIP_WASM_BUILD=1 cargo build --release -p polkadot-parachain-bin --bin polkadot-parachain && \
    SKIP_WASM_BUILD=1 cargo build --release --bin polkadot --bin polkadot-prepare-worker --bin polkadot-execute-worker

install-zombie-bite:
    cargo install --git https://github.com/pepoviola/zombie-bite --bin zombie-bite --locked --force

create-polkadot-pre-migration-snapshot: build-doppelganger install-zombie-bite
    just build-polkadot "--features zombie-bite-sudo"
    PATH=$(pwd)/${DOPPELGANGER_PATH}/target/release:$PATH zombie-bite polkadot:./runtime_wasm/polkadot_runtime.compact.compressed.wasm asset-hub:./runtime_wasm/asset_hub_polkadot_runtime.compact.compressed.wasm

create-westend-pre-migration-snapshot: build-westend build-doppelganger install-zombie-bite
    PATH=$(pwd)/${DOPPELGANGER_PATH}/target/release:$PATH zombie-bite westend:./runtime_wasm/westend_runtime.compact.compressed.wasm asset-hub:./runtime_wasm/asset_hub_westend_runtime.compact.compressed.wasm

# run orchestrator for polkadot (fork live network, run migration and post migration tests)
run-orchestrator-polkadot: submodule-init submodule-update build-doppelganger install-zombie-bite
    just build-polkadot "--features zombie-bite-sudo"
    npm install
    npm run build
    PATH=$(pwd)/${DOPPELGANGER_PATH}/target/release:$PATH npm run polkadot-migration

run-orchestrator-paseo: submodule-init submodule-update build-doppelganger install-zombie-bite
    just build-paseo "--features zombie-bite-sudo"
    npm install
    npm run build
    PATH=$(pwd)/${DOPPELGANGER_PATH}/target/release:$PATH npm run polkadot-migration

report-account-migration-status:
    npm run build
    npm run report-account-migration-status

# Run script to upgrade Asset Hub runtime
run-ah-upgrade:
    bun run ./zombie-bite-scripts/authorize_upgrade_ah.ts

# Install dependencies for testing
test-prepare:
    npm install

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

# Run the tests
test:
    npm test

# List the available commands
help:
    @just --list

# Clean node_modules and package-lock.json
clean:
    rm -rf node_modules
    rm -f package-lock.json

# Run the migration tests on westend
run-westend-migration-tests:
    npm run build
    npm run compare-state
