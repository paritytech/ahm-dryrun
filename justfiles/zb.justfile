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

# Third part of the Zombie-Bite flow. This performs the migration on a forked and running network.
perform-migration base_path:
    #!/usr/bin/env bash
    just ahm _npm-build
    ALICE_PORT=$(jq -r .alice_port "{{ base_path }}/ports.json")
    COL_PORT=$(jq -r .collator_port "{{ base_path }}/ports.json")

    node dist/zombie-bite-scripts/migration_shedule_migration.js $ALICE_PORT
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
