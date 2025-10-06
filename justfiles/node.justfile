# Run in the project root
set working-directory := ".."

_default: help

help:
    @just --list node --unsorted

run-kusama: deps
	just node run chains/asset-hub-kusama-spec.json warp 9944 9945 chains/ $(cat chains/rc-name.txt) $(cat chains/ah-name.txt)

deps: download-chain-spec install-omni-node randomize-names

clean:
	rm -rf chains/

# Install the polkadot-omni-node binary if it is not installed
install-omni-node:
	#!/usr/bin/env bash

	if ! command -v polkadot-omni-node &> /dev/null; then
		echo "polkadot-omni-node is not installed, installing..."
		cargo install polkadot-omni-node
	else
		echo "polkadot-omni-node is already installed"
	fi

	polkadot-omni-node --version

# Pick random memorable names for your RC and AH node
randomize-names:
	#!/usr/bin/env bash
	set -ex

	if [ -f chains/rc-name.txt ] && [ -f chains/ah-name.txt ]; then
		echo "chains/rc-name.txt and chains/ah-name.txt already exist"
		exit 0
	fi

	mkdir -p chains
	TIMESTAMP=$(date +%s)

	echo "ahm-sync-$TIMESTAMP" > chains/rc-name.txt
	echo "ahm-sync-$TIMESTAMP" > chains/ah-name.txt

# Download Asset Hub Kusama Spec
download-chain-spec:
	#!/usr/bin/env bash
	set -ex

	mkdir -p chains
	# If chains/asset-hub-kusama-spec.json is not present, download it
	if [ ! -f chains/asset-hub-kusama-spec.json ]; then
		echo "chains/asset-hub-kusama-spec.json is not present, downloading..."
		curl -L https://raw.githubusercontent.com/paritytech/polkadot-sdk/6007549589b8cb441159728e6894748bdaefe504/cumulus/parachains/chain-specs/asset-hub-kusama.json -o chains/asset-hub-kusama-spec.json -s
	else
		echo "chains/asset-hub-kusama-spec.json is already present"
	fi

# Run the polkadot-omni-node binary with the given Spec, Sync mode, Ports and DB directory
run spec_path sync port port_para db_dir rc_name ah_name:
	#!/usr/bin/env bash
	set -ex

	echo "NODE NAMES: {{ rc_name }} and {{ ah_name }}"

	polkadot-omni-node --chain "{{ spec_path }}" -lruntime=info --sync {{ sync }} --blocks-pruning 600 --state-pruning 600 --base-path {{ db_dir }} --no-hardware-benchmarks --rpc-max-request-size 1000000 --rpc-max-response-size 1000000 --rpc-port {{ port }} --name {{ rc_name }} -- -lruntime=info --sync {{ sync }} --blocks-pruning 600 --state-pruning 600 --base-path {{ db_dir }} --no-hardware-benchmarks --rpc-max-request-size 1000000 --rpc-max-response-size 1000000 --rpc-port {{ port_para }} --name {{ ah_name }}
