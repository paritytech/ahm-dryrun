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
