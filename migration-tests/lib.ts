import "@polkadot/api-augment";
import "@polkadot/types-augment";

import { ApiPromise, WsProvider } from "@polkadot/api";
import { MigrationTest, TestContext } from "./types.js";
import { vestingTests } from "./pallets/vesting.js";
import { assetRateTests } from './pallets/asset_rate.js';
// import { bountiesTests } from './pallets/bounties.js';
import { voterListTests } from './pallets/staking/voter_list.js';

export const tests: MigrationTest[] = [
  // bountiesTests,
  vestingTests,
  assetRateTests,
  voterListTests
];

export async function runTests(context: TestContext) {
  for (const test of tests) {
    let stage = "pre-check";

    try {
      const pre_payload = await test.pre_check(context.pre);
      stage = "post-check";
      await test.post_check(context.post, pre_payload);

      console.log(`✅ Test ${test.name} test completed successfully`);
    } catch (error: unknown) {
      console.error(`❌ Test '${test.name}' failed during ${stage}:`);
      console.error(error);
    }
  }
}

export async function main(
  rc_endpoint: string,
  rc_before: number,
  rc_after: number,
  ah_endpoint: string,
  ah_before: number,
  ah_after: number,
) {
  const relayChainConfig: ChainConfig = {
    endpoint: rc_endpoint,
    before_block: rc_before,
    after_block: rc_after,
  };

  const assetHubConfig: ChainConfig = {
    endpoint: ah_endpoint,
    before_block: ah_before,
    after_block: ah_after,
  };

  // HARDCODED test data
  // {
  //     endpoint: 'wss://westend-rpc.polkadot.io',
  //     before_block: 26041702, // westend RC before first migration
  //     // https://westend.subscan.io/event?page=1&time_dimension=date&module=rcmigrator&event_id=assethubmigrationfinished
  //     after_block: 26071771, // westend RC after migration
  // };

  // const assetHubConfig: ChainConfig = ah_chain_config ? ah_chain_config :
  // {
  //     endpoint: 'wss://westend-asset-hub-rpc.polkadot.io',
  //     before_block: 11716733, // wah before first migration started
  //     after_block: 11736597, // wah after second migration ended
  // };

  console.log("Setup configuration:");
  console.log("rc_chain_config", relayChainConfig);
  console.log("ah_chain_config", assetHubConfig);

  const { context, apis } = await setupTestContext(
    relayChainConfig,
    assetHubConfig,
  );

  // to correctly state assert, the best is to take Westend before 1st and WAH after 2nd,
  // though knowing that between 1st and 2nd migration in WAH, few users might have added few things
  // so a small mismatch might be expected.
  await runTests(context);

  // Disconnect all APIs
  await Promise.all(apis.map((api) => api.disconnect()));
}

export interface ChainConfig {
  endpoint: string;
  before_block: number;
  after_block: number;
}

async function setupTestContext(
  relayChainConfig: ChainConfig,
  assetHubConfig: ChainConfig,
): Promise<{ context: TestContext; apis: ApiPromise[] }> {
  // Setup Relay Chain API
  const rc_api = await ApiPromise.create({
    provider: new WsProvider(relayChainConfig.endpoint),
  });

  const rc_block_hash_before = await rc_api.rpc.chain.getBlockHash(
    relayChainConfig.before_block,
  );
  const rc_api_before = await rc_api.at(rc_block_hash_before);

  const rc_block_hash_after = await rc_api.rpc.chain.getBlockHash(
    relayChainConfig.after_block,
  );
  const rc_api_after = await rc_api.at(rc_block_hash_after);

  // Setup Asset Hub API
  const ah_api = await ApiPromise.create({
    provider: new WsProvider(assetHubConfig.endpoint),
  });

  const ah_block_hash_before = await ah_api.rpc.chain.getBlockHash(
    assetHubConfig.before_block,
  );
  const ah_api_before = await ah_api.at(ah_block_hash_before);

  const ah_block_hash_after = await ah_api.rpc.chain.getBlockHash(
    assetHubConfig.after_block,
  );
  const ah_api_after = await ah_api.at(ah_block_hash_after);

  const context: TestContext = {
    pre: {
      rc_api_before,
      ah_api_before,
    },
    post: {
      rc_api_after,
      ah_api_after,
    },
  };

  return { context, apis: [rc_api, ah_api] };
}
