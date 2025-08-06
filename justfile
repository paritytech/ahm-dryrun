mod coverage

set dotenv-load

PROJECT_ROOT_PATH := `DIR="${JUSTFILE:-justfile}"; DIR="$(realpath "$DIR")"; echo "$(dirname "$DIR")"`

# In CI some image doesn't have scp and we can fallback to cp
cp_cmd := `which scp || which cp`

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
