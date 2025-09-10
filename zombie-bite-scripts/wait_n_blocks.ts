// Waits for `n` blocks to be produced on a given endpoint.
//
// Usage:
//  - node wait_n_blocks.js <endpoint> <block_count>
//
// Example:
//  - node wait_n_blocks.js ws://localhost:9944 3
import { ApiPromise, WsProvider } from "@polkadot/api";

async function connect(apiUrl: string) {
  const provider = new WsProvider(apiUrl);
  const api = new ApiPromise({ provider });
  await api.isReady;
  return api;
}

export async function waitNBlocks(endpoint: string, blockCount: number) {
  const api = await connect(endpoint);

  let blocksReceived = 0;
  const startTime = Date.now();

  return new Promise<void>((resolve) => {
    const unsub = api.rpc.chain.subscribeFinalizedHeads((header) => {
      blocksReceived++;

      if (blocksReceived >= blockCount) {
        const elapsed = Date.now() - startTime;
        console.log(JSON.stringify({
          success: true,
          blocksReceived,
          finalBlockNumber: header.number.toNumber(),
          finalBlockHash: header.hash.toString(),
          elapsedMs: elapsed
        }));

        unsub.then(unsubFn => unsubFn());
        api.disconnect();
        resolve();
      }
    });
  });
}

async function main() {
  try {
    if (process.argv.length < 4) {
      console.error('Usage: node wait_n_blocks.js <endpoint> <block_count>');
      console.error('Example: node wait_n_blocks.js ws://localhost:9944 3');
      process.exit(1);
    }

    const endpoint = process.argv[2];
    const blockCount = parseInt(process.argv[3], 10);

    if (isNaN(blockCount) || blockCount < 1) {
      console.error('Error: Block count must be a positive number');
      console.error('Usage: node wait_n_blocks.js <endpoint> <block_count>');
      process.exit(1);
    }

    await waitNBlocks(endpoint, blockCount);
  } catch (error) {
    process.exit(1);
  }
}

main();
