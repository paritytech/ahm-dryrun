#!/usr/bin/env bash

# Shared E2E test environment setup function for justfile recipes.
#
# This script provides `setup_e2e_env()` which:
# - Loads PET (polkadot-ecosystem-tests) .env configuration
# - Validates required endpoint and block number environment variables
# - Changes to the PET directory and installs dependencies
# - Updates PET's known block numbers
# - Exports `NETWORK_CAPITALIZED` for use in test file patterns
#
# Usage: source scripts/setup-e2e-env.sh && setup_e2e_env "<network>"
# where <network> is "polkadot" or "kusama"

setup_e2e_env() {
    # Check required environment variables in PET's .env file
    NETWORK_UPPER="${1}"
    NETWORK_UPPER=${NETWORK_UPPER^^}
    ENDPOINT_VAR="ASSETHUB${NETWORK_UPPER}_ENDPOINT"
    BLOCK_VAR="ASSETHUB${NETWORK_UPPER}_BLOCK_NUMBER"

    # Load PET's .env file if it exists.
    if [[ -f "${PET_PATH}/.env" ]]; then
        source "${PET_PATH}/.env"
    fi

    if [[ -z "${!ENDPOINT_VAR}" ]]; then
        echo "Warning: ${ENDPOINT_VAR} environment variable is not set in ${PET_PATH}/.env"
        echo "Running with default PET endpoint for network ${1} (check PET source code)"
    fi

    if [[ -z "${!BLOCK_VAR}" ]]; then
        echo "Warning: ${BLOCK_VAR} environment variable is not set in ${PET_PATH}/.env"
        echo "Running with default block number for network ${1} (check PET source code)"
    fi

    echo "Running tests with:"
    echo "  ${ENDPOINT_VAR}=${!ENDPOINT_VAR}"
    echo "  ${BLOCK_VAR}=${!BLOCK_VAR}"

    cd polkadot-ecosystem-tests || exit 1
    yarn install

    # Update PET's known block numbers to the latest
    yarn update-known-good

    NETWORK_CAPITALIZED="${1}"
    NETWORK_CAPITALIZED=${NETWORK_CAPITALIZED^}
}

