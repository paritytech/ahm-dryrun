# MAINTAIN: Please put subcommands into the `justfiles` directory.
# Legacy version at https://github.com/paritytech/ahm-dryrun/blob/f229a46614202d87bd43b796d69748f804c57705/just-old

set dotenv-load

mod coverage
mod zb "justfiles/zb.justfile"
mod ahm "justfiles/ahm.justfile"

_default: help

help:
    @echo "👋 Welcome to Asset Hub Migration (AHM) Test Suite"
    @echo "Docs are in the README and the repo: https://github.com/paritytech/ahm-dryrun\n"
    @just --list --unsorted

# Initial setup after you cloned the repo. Run it once.
init:
    git submodule update --init --recursive

# Install all dependencies. Run it once.
setup: init
    just install-doppelganger
    just install-zombie-bite
    just install-try-runtime

# ------------------------- INSTALLING DEPENDENCIES -------------

# Install the `doppelganger` binary on your system.
install-doppelganger:
    SKIP_WASM_BUILD=1 cargo install --git https://github.com/paritytech/doppelganger-wrapper --bin doppelganger \
        --bin doppelganger-parachain \
        --bin polkadot-execute-worker \
        --bin polkadot-prepare-worker  \
        --locked --root ${DOPPELGANGER_PATH}

# Install the `zombie-bite` binary on your system.
install-zombie-bite:
    cargo install --git https://github.com/pepoviola/zombie-bite --bin zombie-bite --locked --force

# Install the `try-runtime-cli` binary in your system
install-try-runtime:
    cargo install --git https://github.com/paritytech/try-runtime-cli --locked

# Install `pdu` binary in your system
install-pdu:
    cargo install polkadot-du --locked

# ------------------------- BUILDING RUNTIMES -------------------

# only run once, per the runtime that you want to test.
build runtime:
    #!/usr/bin/env bash
    set -xe
    mkdir -p ./runtime_wasm

    if [ "{{ runtime }}" = "polkadot" ]; then
        # only enable `metadata-hash`, but not `on-chain-release-build` to still have logs enabled.
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --profile production --features metadata-hash,polkadot-ahm -p asset-hub-polkadot-runtime -p polkadot-runtime && cd ..
        cp ${RUNTIMES_PATH}/target/production/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
    elif [ "{{ runtime }}" = "kusama" ]; then
        # only enable `metadata-hash`, but not `on-chain-release-build` to still have logs enabled.
        cd ${RUNTIMES_PATH} && ${CARGO_CMD} build --profile production --features metadata-hash,kusama-ahm -p asset-hub-kusama-runtime -p staging-kusama-runtime && cd ..
        cp ${RUNTIMES_PATH}/target/production/wbuild/**/**.compact.compressed.wasm ./runtime_wasm/
        # rename staging_kusama_runtime.compact.compressed.wasm to kusama_runtime.compact.compressed.wasm for naming convention compatibility
        mv ./runtime_wasm/staging_kusama_runtime.compact.compressed.wasm ./runtime_wasm/kusama_runtime.compact.compressed.wasm
    else
        echo "Error: Unsupported runtime '{{ runtime }}'. Supported runtimes are: polkadot, kusama"
        exit 1
    fi

# ------------------------- RUNNING INTEGRATION TESTS -------------------

compare-state base_path runtime:
    just ahm _npm-build
    npm run create-migration-done-file {{ base_path }}
    npm run compare-state {{ base_path }} {{ runtime }}

find-rc-block-bite network="kusama":
    just ahm _npm-build
    npm run find-rc-block-bite {{ network }}

make-new-snapshot base_path:
    just ahm _npm-build
    npm run make-new-snapshot {{ base_path }}

# ------------------------- RUNNING E2E TESTS -------------------

e2e-tests NETWORK:
    #!/usr/bin/env bash
    set -e

    # Validate NETWORK argument
    if [[ "{{ NETWORK }}" != "kusama" && "{{ NETWORK }}" != "polkadot" ]]; then
        echo "Error: NETWORK must be one of: kusama, polkadot"
        exit 1
    fi

    # Load shared E2E environment setup (loads .env, validates vars, installs deps)
    source scripts/setup-e2e-env.sh
    setup_e2e_env "{{ NETWORK }}"

    # Run only Asset Hub E2E tests
    failed_count=0
    test_results=""
    find packages -name "*assetHub${NETWORK_CAPITALIZED}*e2e*.test.ts" -type f > /tmp/test_list.txt

    # Set up interrupt handler to exit on `CTRL^C` without starting the next set of tests
    # `pkill -P $$` kills all descendant processes which were spawned by the current process, to avoid leaving
    # orphaned processes running.
    # `exit 130` is the standard signal for `SIGINT` in bash.
    trap 'echo -e "\nInterrupted. Killing yarn processes and exiting..."; pkill -P $$; exit 130' INT

    while read -r test; do
        echo "Running E2E test: $test"
        if ! yarn test "$test" -u; then
            failed_count=$((failed_count + 1))
            test_results="${test_results}❌ Test failed: $test\n"
        else
            test_results="${test_results}✅ Test passed: $test\n"
        fi
    done < /tmp/test_list.txt

    # Print results and failure count
    echo -e "$test_results"
    echo "Total failed tests: $failed_count"

    # Exit with failed count as exit code
    exit $failed_count

staged-e2e-tests NETWORK STAGE:
    #!/usr/bin/env bash
    set -e

    # Validate NETWORK argument
    if [[ "{{ NETWORK }}" != "kusama" && "{{ NETWORK }}" != "polkadot" ]]; then
        echo "Error: NETWORK must be one of: kusama, polkadot"
        exit 1
    fi

    # Load shared E2E environment setup (loads .env, validates vars, installs deps)
    source scripts/setup-e2e-env.sh
    setup_e2e_env "{{ NETWORK }}"

    # Define stages: name:::prefix:::modules:::pattern
    stages=(
        "Essential Tests:::assetHub${NETWORK_CAPITALIZED}:::staking accounts nominationPools scheduler:::lifecycle|transfer_allow_death|transfer_keep_alive|transfer_all|scheduling a call is possible"
        "More Account Tests, Remainder of (Staking + Nomination Pools):::assetHub${NETWORK_CAPITALIZED}:::accounts staking nominationPools:::^(?!.*(transfer_allow_death|transfer_keep_alive|transfer_all|liquidity|lifecycle))"
        "Governance, Vesting, Multisig, Proxy, Remaining Scheduler Tests, Bounties & Child Bounties:::assetHub${NETWORK_CAPITALIZED}:::governance vesting multisig proxy scheduler bounties childBounties:::^(?!.*(scheduling a call is possible))"
        "Remaining PAH Accounts tests:::assetHub${NETWORK_CAPITALIZED}:::accounts:::liquidity"
        "Polkadot Relay E2E Tests:::packages/polkadot/src/{{ NETWORK }}:::accounts proxy multisig:::"
    )

    # Validate STAGE argument - can only be done after `scripts/setup-e2e-env.sh` is run
    total_stages=${#stages[@]}
    if [[ "{{ STAGE }}" == "all" ]]; then
        run_all=true
    elif [[ "{{ STAGE }}" =~ ^[0-9]+$ ]]; then
        if [[ "{{ STAGE }}" -lt 1 || "{{ STAGE }}" -gt $total_stages ]]; then
            echo "Error: STAGE must be between 1 and $total_stages, or 'all'"
            exit 1
        fi
        run_all=false
    else
        echo "Error: STAGE must be a number between 1 and $total_stages, or 'all'"
        exit 1
    fi

    # Set up interrupt handler to exit on `CTRL^C` without starting the next set of tests
    trap 'echo -e "\nInterrupted. Killing yarn processes and exiting..."; pkill -P $$; exit 130' INT

    failed_count=0
    test_results=""

    # Run all stages, from first to last, or, if given a specific stage, run only that stage.
    # Stages are done sequentially, but there is intra-stage concurrency.
    stage_num=1
    for stage_def in "${stages[@]}"; do
        # Skip if specific stage requested and this isn't it
        if [[ "$run_all" == "false" && "{{ STAGE }}" -ne $stage_num ]]; then
            stage_num=$((stage_num + 1))
            continue
        fi
        stage_name="${stage_def%%:::*}"
        rest="${stage_def#*:::}"
        prefix="${rest%%:::*}"
        rest="${rest#*:::}"
        modules="${rest%%:::*}"
        pattern="${rest#*:::}"

        echo "=========================================="
        echo "🚀 STAGE ${stage_num}: ${stage_name}"
        echo "=========================================="

        # Build test command with all modules
        modules_array=($modules)
        test_args=""
        for mod in "${modules_array[@]}"; do
            test_args="${test_args} ${prefix}.${mod}"
        done

        echo "Running:${test_args} -t '$pattern'"
        if ! yarn test ${test_args} -t "$pattern" --run -u; then
            failed_count=$((failed_count + 1))
            test_results="${test_results}❌ Stage ${stage_num}: ${stage_name}\n"
        else
            test_results="${test_results}✅ Stage ${stage_num}: ${stage_name}\n"
        fi

        stage_num=$((stage_num + 1))
    done

    # Print final results
    echo "=========================================="
    echo "🏁 ALL STAGES COMPLETE"
    echo "=========================================="
    echo -e "$test_results"
    echo "Total failed tests: $failed_count"

    # Exit with failed count as exit code
    exit $failed_count