import { ApiPromise, WsProvider } from '@polkadot/api';
import { assert } from '@polkadot/util';

interface EventRecord {
    blockNumber: number;
    section: string;
    method: string;
    data: any;
}

async function findEraStartBlock(originalApi: ApiPromise, postAHMAPI: ApiPromise): Promise<[number, number]> {
  const currentBlock = await postAHMAPI.query.ahMigrator.migrationEndBlock();
  const currentBlockNumber = 11152290; // closer to era change (11152292) then actual migration end block
//   const currentBlockNumber = Number(currentBlock);

  const allEvents: EventRecord[] = [];
  // Look forward for max 24*60*60/6 blocks (24 hours / 6 seconds per block)
  let lastBlock = currentBlockNumber + 14400;

  for (let i = currentBlockNumber + 1; i <= lastBlock; i++) {
    if (i % 200 === 0) {
      console.log(`Processing block ${i}`);
    }

    const blockHash = await originalApi.rpc.chain.getBlockHash(i);
    const apiAtBlock = await originalApi.at(blockHash);

    const currentEraOpt = await apiAtBlock.query.staking.currentEra();
    const currentEra = currentEraOpt.isSome ? currentEraOpt.unwrap().toNumber() : -1;
    
    const systemEvents = await apiAtBlock.query.system.events();
    for (const event of systemEvents) {
        const e = {
            blockNumber: i,
            section: event.event.section,
            method: event.event.method,
            data: JSON.stringify(event.event.data.toJSON()),
        };
        allEvents.push(e);

        if (e.section.toLowerCase() === "staking" && e.method.toLowerCase() === "sessionrotated") {
            const data = event.event.data.toJSON() as any[];
            const [startingSession, activeEra, planned] = data;

            if (activeEra === currentEra-1 && planned === currentEra) {
                const relayBlockNumber = await apiAtBlock.query.parachainSystem.lastRelayChainBlockNumber();
                const rcBlockNumber = Number(relayBlockNumber.toPrimitive());
                
                return [rcBlockNumber, i];
            }
        }
    }
  }
  throw new Error(`Could not find currentEra === activeEra + 1 within search range ${currentBlockNumber} to ${lastBlock}`);
}

async function main(network: string) {
    const endpoints: Record<string, string> = {
      // TODO: add Polkadot endpoints and retry connection if failed
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
        
        const [rcBlock, ahBlock] = await findEraStartBlock(api, postAHMAPI as ApiPromise);
        console.log(`✅ First block in the next era - RC: ${rcBlock}, AH: ${ahBlock}`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    } finally {
      await api.disconnect();
    }
  }

const network = process.argv[2] || 'kusama';
main(network).catch(console.error);