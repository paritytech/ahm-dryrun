import { ApiPromise, WsProvider } from '@polkadot/api';
import { assert } from '@polkadot/util';

async function findFirstBlockInEra(api: ApiPromise): Promise<number> {
  // Get current active era
  const activeEra = await api.query.staking.activeEra();
  if (activeEra.isNone) {
    throw new Error('No active era found');
  }

  const currentEraIndex = activeEra.unwrap().index.toNumber();

  const currentBlock = await api.rpc.chain.getHeader();
  const currentBlockNumber = currentBlock.number.toNumber();

  // Binary search to find first block in current era
  let left = Math.max(0, currentBlockNumber - 14400); // Look back max 24*60*60/6 blocks (24 hours / 6 seconds per block)
  let right = currentBlockNumber;
  let firstBlockInEra = right;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const blockHash = await api.rpc.chain.getBlockHash(mid);
    const apiAtBlock = await api.at(blockHash);
    const eraAtBlock = await apiAtBlock.query.staking.activeEra();
    
    if (eraAtBlock.isNone) {
      left = mid + 1;
      continue;
    }

    const eraIndex = eraAtBlock.unwrap().index.toNumber();
    if (eraIndex === currentEraIndex) {
      // This block is in our target era - try looking earlier
      firstBlockInEra = mid;
      right = mid - 1;
    } else if (eraIndex < currentEraIndex) {
      // Too early - look later
      left = mid + 1;
    }
  }

  return firstBlockInEra;
}

async function main(network: string) {
  const endpoints: Record<string, string> = {
    // TODO: make a list of endpoints and retry connection if failed
    'kusama': 'wss://kusama-rpc.polkadot.io',
    'polkadot': 'wss://rpc.polkadot.io',
  };

  const endpoint = endpoints[network];
  if (!endpoint) {
    throw new Error(`Unsupported network: ${network}, supported networks are: kusama, polkadot`);
  }

  const provider = new WsProvider(endpoint);
  const api = await ApiPromise.create({ provider });

  try {
    const block = await findFirstBlockInEra(api);
    await verifyPreviousBlockInPreviousEra(api, block);

    const offset = 500; // 500 blocks to be safe that all the tests will execute and we won't wait for the next era forever
    const rcBiteBlock = block - offset;

    // output the block number to stdout so it can be captured by the workflow
    console.log(rcBiteBlock);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await api.disconnect();
  }
}

async function verifyPreviousBlockInPreviousEra(api: ApiPromise, block: number) {
    const prevBlockHash = await api.rpc.chain.getBlockHash(block - 1);
    const prevApiAtBlock = await api.at(prevBlockHash);
    const prevEraAtBlock = await prevApiAtBlock.query.staking.activeEra();
    
    if (prevEraAtBlock.isNone) {
      throw new Error(`Previous block ${block - 1} has no era information`);
    }

    const prevEraIndex = prevEraAtBlock.unwrap().index.toNumber();
    const currentEraAtBlock = await api.query.staking.activeEra();
    const currentEraIndex = currentEraAtBlock.unwrap().index.toNumber();

    assert(prevEraIndex === currentEraIndex - 1, 
      `Previous block ${block - 1} is in era ${prevEraIndex}, expected to be in era ${currentEraIndex - 1}`);
}

const network = process.argv[2] || 'kusama';
main(network).catch(console.error);