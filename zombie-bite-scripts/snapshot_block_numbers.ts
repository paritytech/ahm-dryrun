// Gets matching block hashes for RC and AH for taking a snapshot.
// Without this script it could happen that try-runtime-cli takes a snapshot of an AH block
// that was not backed in the RC block that it would download.
//
// Usage:
//  - node snapshot_block_numbers.js <rc_port> <ah_port>
import { ApiPromise, WsProvider } from "@polkadot/api";

async function connect(apiUrl: string) {
  const provider = new WsProvider(apiUrl);
  const api = new ApiPromise({ provider });
  await api.isReady;
  return api;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getSnapshotBlockNumbers(rc_port: number | string, ah_port: number | string) {
  const RC_RPC_URL = `ws://localhost:${rc_port}`;
  const AH_RPC_URL = `ws://localhost:${ah_port}`;
  try {
    const ah = await connect(AH_RPC_URL);

    const ah_block_hash = await ah.rpc.chain.getFinalizedHead();

    const block = await ah.rpc.chain.getBlock(ah_block_hash);
    
    let parent_number: number | null = null;
    
    // Look for set_validation_data extrinsic
    for (const ext of block.block.extrinsics) {
      const extrinsic = ah.registry.createType('Extrinsic', ext);
      const { method } = extrinsic;
      
      if (method.section === 'parachainSystem' && method.method === 'setValidationData') {
        const args = method.args[0] as any;
        parent_number = args.validationData.relayParentNumber.toNumber();
        break;
      }
    }

    if (parent_number === null) {
      throw new Error("No validation data found in Asset Hub block");
    }

    const relay = await connect(RC_RPC_URL);

    let attempts = 10;
    let rc_block_hash: string | null = null;

    while (attempts > 0) {
      try {
        rc_block_hash = (await relay.rpc.chain.getBlockHash(parent_number)).toString();
        if (rc_block_hash) {
          break;
        }
      } catch (error) {
        // Silent retry
      }
      
      attempts -= 1;
      if (attempts > 0) {
        await delay(3000);
      }
    }

    if (!rc_block_hash) {
      throw new Error("Failed to get relay block hash");
    }

    await ah.disconnect();
    await relay.disconnect();

    return {
      rc_block_hash,
      ah_block_hash: ah_block_hash.toString(),
      parent_number
    };

  } catch (error) {
    throw error;
  }
}

async function main() {
  try {
    if (process.argv.length < 4) {
      console.error('Usage: node snapshot_block_numbers.js <rc_port> <ah_port>');
      console.error('Example: node snapshot_block_numbers.js 9944 9988');
      process.exit(1);
    }
    
    const rcPort = parseInt(process.argv[2], 10);
    const ahPort = parseInt(process.argv[3], 10);
    
    if (isNaN(rcPort) || isNaN(ahPort)) {
      console.error('Error: Both ports must be valid numbers');
      console.error('Usage: node snapshot_block_numbers.js <rc_port> <ah_port>');
      process.exit(1);
    }
    
    const result = await getSnapshotBlockNumbers(rcPort, ahPort);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);
