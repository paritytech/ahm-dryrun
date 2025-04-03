mod coverage

set dotenv-load

# Fork network and run tests for polkadot from the post-migration state
default:
    just run

# Run the network migration
run:
    bun test ./index.ts --timeout=22000000
    # 22000000 miliseconds ~ 6.1 hours which should be enough (in theory) to run accounts migration

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
    scp ${RUNTIMES_BUILD_ARTIFACTS_PATH}/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/

# Build the polkadot runtimes and copy back
build-polkadot *EXTRA:
    cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release --features=on-chain-release-build {{EXTRA}} -p asset-hub-polkadot-runtime -p polkadot-runtime -p collectives-polkadot-runtime
    scp ${RUNTIMES_BUILD_ARTIFACTS_PATH}/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/

# Build the westend runtimes and copy back
# TODO: currently broken due to wasm compilation problem
build-westend:
    cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release --features=on-chain-release-build -p asset-hub-westend-runtime -p westend-runtime -p collectives-westend-runtime
    scp ${RUNTIMES_BUILD_ARTIFACTS_PATH}/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/

# Run zombie-bite to spawn polkadot(with sudo)/asset-hub
run-zombie-bite:
    which zombie-bite 2>&1 > /dev/null || cargo install --git https://github.com/pepoviola/zombie-bite --bin zombie-bite --force

    just build-polkadot "--features zombie-bite-sudo"

    # build doppelganger bins
    cd ${DOPPELGANGER_PATH} && \
    SKIP_WASM_BUILD=1 cargo build --release -p polkadot-doppelganger-node --bin doppelganger && \
    SKIP_WASM_BUILD=1 cargo build --release -p polkadot-parachain-bin --features doppelganger --bin doppelganger-parachain && \
    SKIP_WASM_BUILD=1 cargo build --release -p polkadot-parachain-bin --bin polkadot-parachain && \
    SKIP_WASM_BUILD=1 cargo build --release --bin polkadot --bin polkadot-prepare-worker --bin polkadot-execute-worker

    # run zombie-bite
    PATH=$(pwd)/${DOPPELGANGER_PATH}/target/release:$PATH zombie-bite polkadot:./runtime_wasm/polkadot_runtime.compact.compressed.wasm asset-hub

# Install dependencies for testing
test-prepare:
    npm install

e2e-test *TEST:
    cd ${PET_PATH} && yarn && yarn test {{TEST}}

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
