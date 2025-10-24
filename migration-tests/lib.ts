import "@polkadot/api-augment";
import "@polkadot/types-augment";

import { ApiPromise, WsProvider } from "@polkadot/api";
import { logger } from "../shared/logger.js";
import { MigrationTest, TestContext } from "./types.js";
import { vestingTests } from "./pallets/vesting.js";
import { assetRateTests } from './pallets/asset_rate.js';
import { treasury_spend } from "./chopsticks.js";
import { proxyTests } from "./pallets/proxies.js";
import { voterListTests } from './pallets/staking/voter_list.js';
import { convictionVotingTests } from "./pallets/conviction_voting.js";
import { indicesTests } from "./pallets/indices.js";
import { bountiesTests } from "./pallets/bounties.js";
import { treasuryTests } from "./pallets/treasury.js";
import { referendaTests } from "./pallets/referenda.js";
import { multisigTests } from "./pallets/multisig.js";
import { generalStakingTests } from "./pallets/staking/general.js";
import { ApiDecoration } from "@polkadot/api/types/index.js";

// when updating this, also update the testsByNetwork below
type Network = "Westend" | "Paseo" | "Kusama" | "Polkadot";

// All available tests
const allTests = [
  treasuryTests,
  referendaTests,
  assetRateTests,
  convictionVotingTests,
  indicesTests,
  proxyTests,
  voterListTests,
  vestingTests,
  bountiesTests,
  multisigTests,
  generalStakingTests,
];

// Excludes tests from the pool of all available tests
const excludedTestsPerNetwork: Record<Network, MigrationTest[]> = {
  Westend: [
    // the pallet is not available on Westend
    bountiesTests,
    // https://github.com/paritytech/ahm-dryrun/issues/67
    convictionVotingTests,
    // https://github.com/paritytech/ahm-dryrun/issues/85
    treasuryTests,
    // https://github.com/paritytech/ahm-dryrun/issues/66
    referendaTests,
    multisigTests
  ],
  Paseo: [],
  Kusama: [
    // https://github.com/paritytech/ahm-dryrun/issues/67
    convictionVotingTests,
    voterListTests,
    // proxyTests,
  ],
  Polkadot: [
    convictionVotingTests,
    voterListTests,
  ],
};

// Function to get tests for a specific network
function getTestsForNetwork(network: Network): MigrationTest[] {
  const excludedTests = excludedTestsPerNetwork[network];
  return allTests.filter(test => !excludedTests.includes(test));
}

export async function runTests(context: TestContext, network: Network): Promise<string[]> {
  let errs: string[] = [];
  const tests = getTestsForNetwork(network);

  for (const test of tests) {
    let stage = "pre-check";

    try {
      const pre_payload = await test.pre_check(context.pre);
      stage = "post-check";
      await test.post_check(context.post, pre_payload);

      logger.info(`✅ Test ${test.name} test completed successfully`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`❌ Test '${test.name}' failed during ${stage}: ${String(error)}`);
      } else {
        logger.error(`❌ Test '${test.name}' failed during ${stage}:`, { error });
      }
      errs.push(test.name);
    }
  }

  return errs;
}

export async function main(
  rc_endpoint: string,
  ah_endpoint: string,
  network: Network = "Westend",
): Promise<string[]> {

  logger.info('Setup configuration:', {
    rc_endpoint,
    ah_endpoint,
  });

  const { context, apis } = await setupTestContext(
    rc_endpoint,
    ah_endpoint,
  );

  // to correctly state assert, the best is to take Westend before 1st and WAH after 2nd,
  // though knowing that between 1st and 2nd migration in WAH, few users might have added few things
  // so a small mismatch might be expected.
  const errs = await runTests(context, network);

  // TODO (@x3c41a): `treasury_spend` is using hardcoded polkadot endpoints
  // await treasury_spend();

  // Disconnect all APIs
  await Promise.all(apis.map((api) => api.disconnect()));

  return errs;
}

async function setupTestContext(
  relay_endpoint: string,
  asset_hub_endpoint: string,
): Promise<{ context: TestContext; apis: ApiPromise[] }> {
  // Setup Relay Chain API
  const rc_api = await ApiPromise.create({
    provider: new WsProvider(relay_endpoint),
  });

  const rc_migration_start_result = await rc_api.query.rcMigrator.migrationStartBlock();
  const rc_migration_finish_result = await rc_api.query.rcMigrator.migrationEndBlock();  
  if (rc_migration_start_result.isEmpty || rc_migration_finish_result.isEmpty) {
    throw new Error('Migration blocks not found in rcMigrator storage');
  }
  const rc_migration_start_block = rc_migration_start_result.toPrimitive();
  const rc_migration_finish_block = rc_migration_finish_result.toPrimitive();

  const rc_block_hash_before = await rc_api.rpc.chain.getBlockHash(rc_migration_start_block as number);
  const rc_api_before = await rc_api.at(rc_block_hash_before);

  const rc_block_hash_after = await rc_api.rpc.chain.getBlockHash(
    rc_migration_finish_block as number,
  );
  const rc_api_after = await rc_api.at(rc_block_hash_after);

  // Setup Asset Hub API
  const ah_api = await ApiPromise.create({
    provider: new WsProvider(asset_hub_endpoint),
  });

  const ah_migration_start_result = await ah_api.query.ahMigrator.migrationStartBlock();
  const ah_migration_finish_result = await ah_api.query.ahMigrator.migrationEndBlock();
  if (ah_migration_start_result.isEmpty || ah_migration_finish_result.isEmpty) {
    throw new Error('Migration blocks not found in ahMigrator storage');
  }
  const ah_migration_start_block = ah_migration_start_result.toPrimitive();
  const ah_migration_finish_block = ah_migration_finish_result.toPrimitive();

  const ah_block_hash_before = await ah_api.rpc.chain.getBlockHash(ah_migration_start_block as number);
  const ah_api_before = await ah_api.at(ah_block_hash_before);

  const ah_block_hash_after = await ah_api.rpc.chain.getBlockHash(
    ah_migration_finish_block as number,
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
