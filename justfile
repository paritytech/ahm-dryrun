mod coverage

set dotenv-load

PROJECT_ROOT_PATH := `DIR="${JUSTFILE:-justfile}"; DIR="$(realpath "$DIR")"; echo "$(dirname "$DIR")"`

# In CI some image doesn't have scp and we can fallback to cp
cp_cmd := `which scp || which cp`

# Run AHM for Polkadot
default:
    just ahm polkadot

# List the available commands
help:
    @just --list

# ------------------------- ONE-TIME SETUP ----------------------

# only to be run the first time, or when submodules changes.
init:
    git submodule update --init --recursive

# only run once if any of the deps, like ZB, DG, or such are updated
setup:
    git submodule update --remote --merge
    just install-doppelganger
    just install-zombie-bite

# ------------------------- INSTALLING DEPENDENCIES -------------

install-doppelganger:
    SKIP_WASM_BUILD=1 cargo install --git https://github.com/paritytech/doppelganger-wrapper --bin doppelganger \
        --bin doppelganger-parachain \
        --bin polkadot-execute-worker \
        --bin polkadot-prepare-worker  \
        --locked --root ${DOPPELGANGER_PATH}

install-zombie-bite:
    cargo install --git https://github.com/pepoviola/zombie-bite --bin zombie-bite --locked --force

# ------------------------- RUNNING AHM -------------------------

ahm runtime *base_path:
    #!/usr/bin/env bash
    just build {{ runtime }}
    if [ -z "{{ base_path }}" ]; then
        # no base_path supplied, generate one.
        base_path_to_use="./migration-run-$(date +%s)"
    else
        base_path_to_use="{{ base_path }}"
    fi

    just npm-build && \
    PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
        npm run ahm \
        "$base_path_to_use" \
        "{{runtime}}" \
        "${RUNTIME_WASM}/{{runtime}}_runtime.compact.compressed.wasm" \
        "${RUNTIME_WASM}/asset_hub_{{runtime}}_runtime.compact.compressed.wasm"

# ------------------------- BUILDING RUNTIMES -------------------


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

# ------------------------- NPM HELPERS -------------------------

# run npm install IFF needed
npm-build:
    #!/usr/bin/env bash
    sha256sum -c .package.json.sum || (npm install && sha256sum package.json > .package.json.sum && echo "✅ npm install" && echo "✅ sha256sum saved")
    npm run build

# ------------------------- ZOMBIE-BITE SUBCOMMANDS -------------

zb-bite base_path runtime:
    #!/usr/bin/env bash
    just build {{ runtime }}

    PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
    zombie-bite bite -d {{ base_path }} \
        -r {{ runtime }} \
        --rc-override "${RUNTIME_WASM}/{{runtime}}_runtime.compact.compressed.wasm" \
        --ah-override "${RUNTIME_WASM}/asset_hub_{{runtime}}_runtime.compact.compressed.wasm"

zb-spawn base_path *step:
    #!/usr/bin/env bash
    if [ -z "{{ step }}" ]; then
        PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
        zombie-bite spawn -d {{ base_path }}
    else
        PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
        zombie-bite spawn -d {{ base_path }} -s {{ step }}
    fi

zb-perform-migration base_path:
    #!/usr/bin/env bash
    just npm-build
    ALICE_PORT=$(jq -r .alice_port "{{ base_path }}/ports.json")
    COL_PORT=$(jq -r .collator_port "{{ base_path }}/ports.json")

    # node dist/zombie-bite-scripts/migration_shedule_migration.js $ALICE_PORT
    # set a diff log level to run this
    TS_LOG_LEVEL=debug node dist/zombie-bite-scripts/migration_finished_monitor.js {{ base_path }} $ALICE_PORT $COL_PORT

    STOP_FILE="{{base_path }}/stop.txt"
    echo "signal teardown network by creating file ${STOP_FILE}"

    # signal stop network
    touch ${STOP_FILE}

    # wait until finishing packaging by checking the stop.txt existence
    COUNT=0
    until [ ! -f "$STOP_FILE" ]; do
    echo "STOP_FILE: $STOP_FILE still present, keep waiting..."
    COUNT=$((COUNT +1))
        if [[ $COUNT -gt 600 ]];then
        echo "ERR: STOP FAIL"
        exit 1;
        fi;
    sleep 2
    done
    echo "'stop.txt' file not present anymore, teardown network completed..."


# ------------------------- RUNNING E2E TESTS -------------------

e2e-tests *TEST:
    cd ${PET_PATH} && yarn && yarn test {{ TEST }}
