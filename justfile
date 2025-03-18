set dotenv-load

# Fork network and run tests for polkadot from the post-migration state
default:
    just run

# Run the network from the post-migration state
run:
    bun test ./index.ts --timeout=22000000

# Run the network from the pre-migration state
run-pre:
    POLKADOT_BLOCK_NUMBER=${POLKADOT_BLOCK_NUMBER_PRE} POLKADOT_ASSET_HUB_BLOCK_NUMBER=${POLKADOT_ASSET_HUB_BLOCK_NUMBER_PRE} POLKADOT_COLLECTIVES_BLOCK_NUMBER=${POLKADOT_COLLECTIVES_BLOCK_NUMBER_PRE} npx @acala-network/chopsticks@latest xcm -r ./configs/polkadot.yml -p ./configs/polkadot-asset-hub.yml -p ./configs/polkadot-collectives.yml

# Update the runtimes submodule
update-runtimes:
    git submodule update runtimes
    @echo '\nYou probably want to now run `just build-runtimes`'

# Build the runtimes and copy back (works for local and remote)
build-runtimes:
    cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --release --features=on-chain-release-build -p asset-hub-polkadot-runtime -p polkadot-runtime -p collectives-polkadot-runtime
    scp ${BUILD_ARTIFACTS_PATH}/**/**.compact.compressed.wasm ./runtime_wasm/

# Install dependencies for testing
test-prepare:
    npm install

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
