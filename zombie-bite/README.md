# Zombie-bite

## Intro

`zombie-bite` is an cli tool that allow you to _fork and spawn_ live networks (e.g polkadot/kusama) keeping the _live state_ with the needed customizations in order to make the new chain/s keep progressing.

### Instruction to spawn Polkadot(with sudo)/AH

 - Install `zombie-bite`

   ```
   cargo install --git https://github.com/pepoviola/zombie-bite --bin zombie-bite
   ```

- Patch and compile polkadot runtime to add sudo

Apply the patch `polkadot_sudo.patch` on top of the polkadot code in `runtimes` directory and then compile the runtime.

```
cd ../runtimes
git apply ../zombie-bite/polkadot_sudo.patch
cargo build --release -p polkadot-runtime
cd -
```

- Compile the needed binaries (from `polkadot-sdk-doppelganger`)

```
cd polkadot-sdk-doppelganger
SKIP_WASM_BUILD=1 cargo build --release -p polkadot-doppelganger-node --bin doppelganger
SKIP_WASM_BUILD=1 cargo build --release -p polkadot-parachain-bin --features doppelganger --bin doppelganger-parachain
SKIP_WASM_BUILD=1 cargo build --release -p polkadot-parachain-bin --bin polkadot-parachain
SKIP_WASM_BUILD=1 cargo build --release --bin polkadot --bin polkadot-prepare-worker --bin polkadot-execute-worker
```

- Make them available in your `PATH`

 ```
 export PATH=$(pwd)/target/release:$PATH
 ```

- Run `zombie-bite`

```
zombie-bite polkadot:<path_to_polkadot_wasm> asset-hub
```

You should get a new network with the `live state` running locally.
