# Run in the project root
set working-directory := ".."

_default: help

help:
    @just --list zb --unsorted

# First part of the Zombie-Bite flow. This forks off the network.
bite base_path runtime:
    #!/usr/bin/env bash
    set -xe

    just build {{ runtime }}
    mkdir -p {{ base_path }}

    PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
    zombie-bite bite -d {{ base_path }} \
        -r {{ runtime }} \
        --rc-override "${RUNTIME_WASM}/{{runtime}}_runtime.compact.compressed.wasm" \
        --ah-override "${RUNTIME_WASM}/asset_hub_{{runtime}}_runtime.compact.compressed.wasm"

# Second part of the Zombie-Bite flow. This "spawns" the network with the forked state.
spawn base_path *step:
    #!/usr/bin/env bash
    if [ -z "{{ step }}" ]; then
        PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
        zombie-bite spawn -d {{ base_path }}
    else
        PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
        zombie-bite spawn -d {{ base_path }} -s {{ step }}
    fi

start-migration base_path:
    #!/usr/bin/env bash
    set -ex

    just ahm _npm-build
    ALICE_PORT=$(jq -r .alice_port "{{ base_path }}/ports.json")

    node dist/zombie-bite-scripts/migration_shedule_migration.js $ALICE_PORT

wait-for-migration-done base_path:
    #!/usr/bin/env bash
    set -ex

    just ahm _npm-build
    ALICE_PORT=$(jq -r .alice_port "{{ base_path }}/ports.json")
    COL_PORT=$(jq -r .collator_port "{{ base_path }}/ports.json")

    # set a diff log level to run this
    TS_LOG_LEVEL=debug node dist/zombie-bite-scripts/migration_finished_monitor.js {{ base_path }} $ALICE_PORT $COL_PORT

# Kill everything ZB and Polkadot related. RIP if you are running a local node.
force-kill:
    #!/usr/bin/env bash
    set -ex

    killall zombie-bite || true
    killall doppelganger || true
    killall polkadot-prepare-worker polkadot-execute-worker polkadot polkadot-collator || true

soft-kill-migration base_path:
    #!/usr/bin/env bash
    set -ex

    STOP_FILE="{{ base_path }}/stop.txt"
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

# Third part of the Zombie-Bite flow. This performs the migration on a forked and running network.
perform-migration base_path:
    #!/usr/bin/env bash
    set -ex

    just zb start-migration {{ base_path }}
    just zb wait-for-migration-done {{ base_path }}
    just zb kill-migration {{ base_path }}

# Take Rust snapshots of the network. Example: just zb snapshot paseo paseo-bite pre
snapshot runtime base_path pre_or_post:
    #!/usr/bin/env bash
    set -xe

    if [ ! -d "{{ base_path }}" ]; then
        echo "Error: base_path '{{ base_path }}' does not exist"
        exit 1
    fi

    if ! command -v try-runtime &> /dev/null; then
        cargo install --git https://github.com/paritytech/try-runtime-cli --locked
    fi

    just ahm _npm-build
    RC_PORT=$(jq -r .alice_port "{{ base_path }}/ports.json")
    AH_PORT=$(jq -r .collator_port "{{ base_path }}/ports.json")

    # Get block numbers for synchronized snapshots
    BLOCK_INFO=$(node dist/zombie-bite-scripts/snapshot_block_numbers.js ${RC_PORT} ${AH_PORT})
    RC_BLOCK=$(echo ${BLOCK_INFO} | jq -r .rc_block_hash)
    AH_BLOCK=$(echo ${BLOCK_INFO} | jq -r .ah_block_hash)

    try-runtime create-snapshot --uri ws://127.0.0.1:${RC_PORT} --at ${RC_BLOCK} "{{ base_path }}/{{ runtime }}-rc-{{ pre_or_post }}.snap"
    try-runtime create-snapshot --uri ws://127.0.0.1:${AH_PORT} --at ${AH_BLOCK} "{{ base_path }}/{{ runtime }}-ah-{{ pre_or_post }}.snap"

# Wait for nodes to be ready with retry logic
wait-for-nodes base_path:
    #!/usr/bin/env bash
    just ahm _npm-build
    RC_PORT=$(jq -r .alice_port "{{ base_path }}/ports.json")
    AH_PORT=$(jq -r .collator_port "{{ base_path }}/ports.json")

    # Retry function for node readiness
    wait_for_node() {
        local port=$1
        local name=$2
        for i in {1..10}; do
            if node dist/zombie-bite-scripts/wait_n_blocks.js ws://localhost:${port} 2 2>/dev/null; then
                echo "${name} node ready"
                return 0
            fi
            echo "Attempt $i/10: ${name} node not ready, waiting 5s..."
            sleep 5
        done
        echo "ERROR: ${name} node failed to become ready after 10 attempts"
        return 1
    }

    # Check both nodes in parallel
    wait_for_node $RC_PORT "RC" &
    RC_PID=$!

    wait_for_node $AH_PORT "AH" &
    AH_PID=$!

    # Wait for both to complete
    wait $RC_PID
    RC_READY_ECODE=$?
    wait $AH_PID
    AH_READY_ECODE=$?

    EXIT_CODE=$((RC_READY_ECODE + AH_READY_ECODE))
    if [[ $EXIT_CODE -eq 0 ]];then
        echo "Both nodes are ready";
    else
        echo "Node/s are not ready";
    fi;

    exit $EXIT_CODE;

# Monitor for AccountsMigrationInit and take pre-migration snapshot
monitor-pre-snapshot base_path network:
    #!/usr/bin/env bash
    set -xe
    just ahm _npm-build
    node dist/zombie-bite-scripts/migration_snapshot.js {{ base_path }} {{ network }} pre

# Monitor for MigrationDone and take post-migration snapshot
monitor-post-snapshot base_path network:
    #!/usr/bin/env bash
    set -xe
    just ahm _npm-build
    node dist/zombie-bite-scripts/migration_snapshot.js {{ base_path }} {{ network }} post
