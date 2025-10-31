import { ApiPromise, WsProvider } from '@polkadot/api';
import { assert } from '@polkadot/util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface EventRecord {
    blockNumber: number;
    section: string;
    method: string;
    data: any;
}

async function findFirstBlockInNextEra(originalApi: ApiPromise, postAHMAPI: ApiPromise): Promise<number> {
  // Get current active era
  const activeEra = await postAHMAPI.query.staking.activeEra();
  if (activeEra.isNone) {
    throw new Error('No active era found');
  }

  const nextEraIndex = activeEra.unwrap().index.toNumber() + 1;

  const currentBlock = await postAHMAPI.query.ahMigrator.migrationEndBlock();
  const currentBlockNumber = Number(currentBlock);

  const allEvents: EventRecord[] = [];
  let lastBlock = currentBlockNumber + 8000; //14400; // Look forward for max 24*60*60/6 blocks (24 hours / 6 seconds per block)
  
  // Prepare CSV file if it's the first block
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const csvFilePath = path.join(__dirname, 'events.csv');
  if (!fs.existsSync(csvFilePath)) {
      fs.writeFileSync(csvFilePath, 'blockNumber,section,method,data\n', { encoding: 'utf-8' });
  }

  const currentEraOpt = await postAHMAPI.query.staking.currentEra();
  const currentEra = currentEraOpt.isSome ? currentEraOpt.unwrap().toNumber() : -1;
  

  for (let i = lastBlock; i >= currentBlockNumber; i--) {
    if (i % 180 === 0) {
      console.log(`Processing block ${i}`);
    }
    const blockHash = await originalApi.rpc.chain.getBlockHash(i);
    const apiAtBlock = await originalApi.at(blockHash);
    const systemEvents = await apiAtBlock.query.system.events();

    for (const event of systemEvents) {
        const e = {
            blockNumber: i,
            section: event.event.section,
            method: event.event.method,
            data: JSON.stringify(event.event.data.toJSON()).replace(/"/g, '""'), // escape quotes for CSV
        };
        allEvents.push(e);

        // Write to CSV
        const csvLine = `${e.blockNumber},"${e.section}","${e.method}","${e.data}"\n`;
        fs.appendFileSync(csvFilePath, csvLine, { encoding: 'utf-8' });

        if (event.event.section.toLowerCase() === "staking" && event.event.method.toLowerCase() === "sessionrotated") {
            // Still optionally log the block where the session is rotated
            console.log(`SessionRotated event found at block ${i}`);
            const data = event.event.data.toJSON() as any;
            const activeEra = data.activeEra;
            const plannedEra = data.plannedEra;
            if (activeEra === currentEra - 1 && plannedEra === currentEra) {
                console.log(`Found a block in the next era: ${i}`);
                return i;
            }
            // return i;
        }
    }
  }
  throw new Error(`Could not find first block in era ${nextEraIndex} within search range ${currentBlockNumber} to ${lastBlock}`);
}

async function verifyPreviousBlockInPreviousEra(api: ApiPromise, block: number) {
    const prevBlockHash = await api.rpc.chain.getBlockHash(block - 1);
    const prevApiAtBlock = await api.at(prevBlockHash);
    const prevEraAtBlock = await prevApiAtBlock.query.staking.activeEra();

    if (prevEraAtBlock.isNone) {
      throw new Error(`Previous block ${block - 1} has no era information`);
    }
    const prevEraIndex = prevEraAtBlock.unwrap().index.toNumber();

    const currentBlockhash = await api.rpc.chain.getBlockHash(block);
    const currentApiAtBlock = await api.at(currentBlockhash);
    const currentEraAtBlock = await currentApiAtBlock.query.staking.activeEra();

    if (currentEraAtBlock.isNone) {
      throw new Error(`Current block ${block} has no era information`);
    }
    const currentEraIndex = currentEraAtBlock.unwrap().index.toNumber();

    assert(prevEraIndex === currentEraIndex - 1, 
      `Previous block ${block - 1} is in era ${prevEraIndex}, expected to be in era ${currentEraIndex - 1}`);
}

async function main(network: string) {
    const endpoints: Record<string, string> = {
      // TODO: make a list of endpoints and retry connection if failed
      'kusama': 'wss://kusama-asset-hub-rpc.polkadot.io',
    };
  
    const endpoint = endpoints[network];
    if (!endpoint) {
      throw new Error(`Unsupported network: ${network}, supported networks are: kusama`);
    }
  
    const provider = new WsProvider(endpoint);
    const api = await ApiPromise.create({ provider });
  
    try {
        const migrationEndBlock = await api.query.ahMigrator.migrationEndBlock();
        if (migrationEndBlock.isEmpty) {
          throw new Error('Migration end block not found');
        }
        const postAHMBlockNumber = Number(migrationEndBlock.toPrimitive());
        const postAHMBlockHash = await api.rpc.chain.getBlockHash(postAHMBlockNumber);
        const postAHMAPI = await api.at(postAHMBlockHash);
        // migrationEndBlockNumber = migrationEndBlockNumber + 1;
        const block = await findFirstBlockInNextEra(api, postAHMAPI as ApiPromise);
        console.log(`First block in the next era: ${block}`);
        await verifyPreviousBlockInPreviousEra(api, block);
  
        const rcBiteBlock = block;
        console.log(rcBiteBlock);
  
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    } finally {
      await api.disconnect();
    }
  }

const network = process.argv[2] || 'kusama';
main(network).catch(console.error);