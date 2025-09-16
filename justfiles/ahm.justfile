# Run in the project root
set working-directory := ".."

_default: help

# Help menu
help:
    @just --list ahm --unsorted

# Run the Asset Hub Migration for Paseo with an optional base path
paseo *base_path:
    @just ahm _run paseo {{ base_path }}

# (Untested) Run the Asset Hub Migration for Polkadot with an optional base path
polkadot *base_path:
    @just ahm _run polkadot {{ base_path }}

# (Internal) Run the Asset Hub Migration for a given runtime and an optional base path
_run runtime *base_path:
    #!/usr/bin/env bash
    just build {{ runtime }}
    if [ -z "{{ base_path }}" ]; then
        # no base_path supplied, generate one.
        base_path_to_use="./migration-run-$(date +%s)"
    else
        base_path_to_use="{{ base_path }}"
    fi

    just ahm _npm-build && \
    PATH=$(pwd)/${DOPPELGANGER_PATH}/bin:$PATH \
        npm run ahm \
        "$base_path_to_use" \
        "{{runtime}}" \
        "${RUNTIME_WASM}/{{runtime}}_runtime.compact.compressed.wasm" \
        "${RUNTIME_WASM}/asset_hub_{{runtime}}_runtime.compact.compressed.wasm"

# (Internal) Run npm install.
_npm-build:
    #!/usr/bin/env bash
    sha256sum -c .package.json.sum || (npm install && sha256sum package.json > .package.json.sum && echo "✅ npm install" && echo "✅ sha256sum saved")
    npm run build

# (Untested) Run the Asset Hub Migration Monitor
monitor:
    @echo "Currently not implemented, please check https://github.com/paritytech/asset-hub-migration-monitor"
    @echo "You can run the following commands to run the monitor:\n"
    @echo "git clone https://github.com/paritytech/asset-hub-migration-monitor && cd asset-hub-migration-monitor"
    @echo "export ASSET_HUB_URL="ws://localhost:9945""
    @echo "export RELAY_CHAIN_URL="ws://localhost:9944""
    @echo "just run-backend"
    @echo "open https://migration.paritytech.io/?backend_url=http://localhost:3000"
# TODO @donal: Monitoring here

permatest runtime base_path repeat:
    #!/usr/bin/env bash
    set -ex

    rm -f "$LOGFILE"

    LOGFILE="permatest-{{ runtime }}-{{ base_path }}.log"
    # Redirect and Tee all output to the log file
    exec > >(tee -a "$LOGFILE") 2>&1

    for i in {1..{{ repeat }}}; do
        just ahm test-once {{ runtime }} {{ base_path }}
        echo "--------------------------------"
        echo " MIGRATION FINISHED ITERATION #${i}"
        echo "--------------------------------"
    done

# Permatest paseo
test-once runtime base_path:
    #!/usr/bin/env bash
    set -ex

    just ahm _npm-build

    # Set exit hook to kill the network
    trap "just zb force-kill" EXIT

    # Kill any leftover networks
    just zb force-kill

    # Spawn the network and save the pid
    just zb spawn {{ base_path }} &
    NETWORK_PID=$!

    # Wait for nodes to come online
    just zb wait-for-nodes {{ base_path }}

    # Try to take snapshot. If the network is not ready yet then retry.
    for i in {1..20}; do
        # First delete the old snapshots
        rm -f "{{ runtime }}-*.snap"
        if just zb snapshot {{ runtime }} {{ base_path }} pre; then
            break
        fi

        sleep 10
    done

    # Start the migration
    just zb start-migration {{ base_path }}
    echo "Migration started"

    # Wait for the migration to finish
    just zb wait-for-migration-done {{ base_path }}
    echo "Migration finished"

    # Wait a bit for Node DB to properly write everything
    sleep 10
    just zb snapshot {{ runtime }} {{ base_path }} post

    # We already took snapshots so we can force kill it.
    just zb force-kill

    # Run post migration tests
    abs_base_path=$(realpath {{ base_path }})
    just ahm rust-test {{ runtime }} ${abs_base_path}

# Run post rust migration tests
rust-test runtime base_path:
    #!/usr/bin/env bash
    set -ex

    cd runtimes

    # Check if base_path is absolute or relative
    if [[ "{{ base_path }}" = /* ]]; then
        # Absolute path - use as is. Used in CI
        SNAP_BASE="{{ base_path }}"
    else
        # Relative path - prepend ../../../
        # Used when locally running `just ahm rust-test ...`
        SNAP_BASE="../../../{{ base_path }}"
    fi

    SKIP_WASM_BUILD=1 \
    SNAP_RC_PRE="${SNAP_BASE}/rc-pre.snap" \
    SNAP_AH_PRE="${SNAP_BASE}/ah-pre.snap" \
    SNAP_RC_POST="${SNAP_BASE}/rc-post.snap" \
    SNAP_AH_POST="${SNAP_BASE}/ah-post.snap" \
    RUST_LOG="runtime::ah-migrator=debug,runtime::rc-migrator=debug,remote-ext=info,runtime=warn,runtime=info" \
    cargo test -p polkadot-integration-tests-ahm  \
      --release \
      --features {{ runtime }}-ahm \
      --features try-runtime \
      post_migration_checks_only -- --include-ignored --nocapture --test-threads 1
