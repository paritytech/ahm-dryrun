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
      console.log(`new block: ${header.number.toNumber()} from endpoint ${endpoint}`);
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
        return resolve();
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


    const timeout = new Promise((_, reject) => {
      setTimeout(() => {
        reject();
      }, 60 * 1000); // 1min timeout
    });

    await Promise.race([waitNBlocks(endpoint, blockCount), timeout]);
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify(error));
    process.exit(1);
  }
}

main();
