import "@polkadot/api-augment";
import assert from "assert";
import {
  PreCheckContext,
  PostCheckContext,
  MigrationTest,
  PreCheckResult,
} from "../types.js";
import type { IOption, ITuple, Codec } from "@polkadot/types/types";
import type { AccountId32 } from "@polkadot/types/interfaces";
import type { ApiDecoration } from "@polkadot/api/types";
import { ApiPromise } from "@polkadot/api";
import { logger } from "../../shared/logger.js";

interface CrowdloanReserve {
  unreserve_block: number;
  depositor: string;
  para_id: number;
  amount: string;
}

interface LeaseReserve {
  unreserve_block: number;
  account: string;
  para_id: number;
  amount: string;
}

export const crowdloanTests: MigrationTest = {
  name: "crowdloan_pallet",
  pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
    const { rc_api_before, ah_api_before, rc_api_full } = context;

    const rc_funds = await rc_api_before.query.crowdloan.funds.entries();
    const rc_funds_data: CrowdloanReserve[] = [];

    for (const [key, value] of rc_funds) {
      const para_id = (key.args[0] as any).toNumber();
      const fund = value.toJSON() as any;
       
      // Get leases for this parachain to calculate unreserve_block
      const leases = await rc_api_before.query.slots.leases(para_id);
      const leasesArray = leases as unknown as IOption<
        ITuple<[AccountId32, Codec]>
      >[];
      const num_active_leases = leasesArray.filter(
        (lease: IOption<ITuple<[AccountId32, Codec]>>) => lease.isSome
      ).length;

      // Note: Bifrost (para_id 3356) has no active leases
      // Calculate unreserve_block - use full API for RPC calls
      let unreserve_block: number = 0;
      try {
        unreserve_block = await calculateUnreserveBlock(
          rc_api_full,
          num_active_leases
        );
      } catch (error) {
        logger.error(`Error calculating unreserve_block: ${error}`);
      }

      if (!fund.depositor || !fund.deposit) {
        logger.warn(
          `Skipping fund with missing data: depositor=${fund.depositor}, deposit=${fund.deposit}`
        );
        continue;
      }

      rc_funds_data.push({
        unreserve_block,
        depositor: fund.depositor.toString(),
        para_id,
        amount: fund.deposit.toString(),
      });
    }

    const rc_leases = await rc_api_before.query.slots.leases.entries();
    const rc_leases_data: LeaseReserve[] = [];

    for (const [key, value] of rc_leases) {
      const para_id = (key.args[0] as any).toNumber();

      // if para_id is less then 2000, it is a system chain so skip
      if (para_id < 2000) {
        continue;
      }

      const leases = value as unknown as IOption<
        ITuple<[AccountId32, Codec]>
      >[];
      const active_leases = leases.filter(
        (lease: IOption<ITuple<[AccountId32, Codec]>>) =>
          lease.isSome
      );

      if (active_leases.length > 0) {
        // Take only the last active lease matching the rust implementation
        const last_lease = active_leases[active_leases.length - 1];
        const [account, amount] = last_lease.unwrap();

        // Calculate unreserve_block for this lease - use full API for RPC calls
        const num_remaining_leases = active_leases.length;
        const unreserve_block = await calculateUnreserveBlock(
          rc_api_full,
          num_remaining_leases
        );

        rc_leases_data.push({
          unreserve_block,
          account: account.toString(),
          para_id,
          amount: amount.toString(),
        });

      }
    }

    // AH Pre-check assertions - verify AH is empty before migration
    const ah_crowdloan_reserves =
      await ah_api_before.query.ahOps.rcCrowdloanReserve.entries();
    const ah_lease_reserves =
      await ah_api_before.query.ahOps.rcLeaseReserve.entries();
    const ah_crowdloan_contributions =
      await ah_api_before.query.ahOps.rcCrowdloanContribution.entries();

    assert.equal(
      ah_lease_reserves.length,
      0,
      "AH lease reserves should be empty before migration"
    );
    assert.equal(
      ah_crowdloan_contributions.length,
      0,
      "AH crowdloan contributions should be empty before migration"
    );
    assert.equal(
      ah_crowdloan_reserves.length,
      0,
      "AH crowdloan reserves should be empty before migration"
    );

    return {
      rc_pre_payload: {
        funds: rc_funds_data,
        leases: rc_leases_data,
      },
      ah_pre_payload: undefined,
    };
  },

  post_check: async (
    context: PostCheckContext,
    pre_payload: PreCheckResult
  ): Promise<void> => {
    const { rc_api_after, ah_api_after } = context;
    const {
      funds: rc_funds_before,
      leases: rc_leases_before,
    } = pre_payload.rc_pre_payload;

    await verifyRcStorageEmpty(rc_api_after);

    await verifyAhStorageMatchesRcPreMigrationData(
      ah_api_after,
      rc_funds_before,
      rc_leases_before,
    );
  },
} as const;

async function verifyRcStorageEmpty(
  rc_api_after: ApiDecoration<"promise">,
): Promise<void> {
  const rc_funds_after = await rc_api_after.query.crowdloan.funds.entries();

  assert.equal(
    rc_funds_after.length,
    0,
    "RC crowdloan funds should be empty after migration"
  );
}

async function verifyAhStorageMatchesRcPreMigrationData(
  ah_api_after: ApiDecoration<"promise">,
  rc_funds_before: CrowdloanReserve[],
  rc_leases_before: LeaseReserve[],
): Promise<void> {

  const ah_lease_reserves_after =
    await ah_api_after.query.ahOps.rcLeaseReserve.entries();
  const ah_crowdloan_reserves_after =
    await ah_api_after.query.ahOps.rcCrowdloanReserve.entries();

  await verifyLeaseReservesMigration(ah_lease_reserves_after, rc_leases_before);
  await verifyCrowdloanReservesMigration(
    ah_crowdloan_reserves_after,
    rc_funds_before
  );
}

async function verifyLeaseReservesMigration(
  ah_lease_reserves_after: [any, any][],
  rc_leases_before: LeaseReserve[]
): Promise<void> {
  // Handle Bifrost special case (para_id 2030 -> 3356)
  const processed_rc_leases = rc_leases_before.map((lease) => {
    if (lease.para_id === 2030) {
      return { ...lease, para_id: 3356 };
    }
    return lease;
  });

  // Verify each lease reserve exists in AH
  for (const rc_lease of processed_rc_leases) {
    const matching_entry = ah_lease_reserves_after.find(([key, value]) => {
      const [unreserve_block, para_id, account] = key.args;
      const amount = value?.toJSON() as any;
      return (
        para_id?.toNumber() === rc_lease.para_id &&
        unreserve_block.toNumber() === rc_lease.unreserve_block &&
        account?.toString() === rc_lease.account &&
        amount?.toString() === rc_lease.amount
      );
    });

    assert(
      matching_entry !== undefined,
      `Lease reserve for para_id ${rc_lease.para_id} not found after migration`
    );
  }
}


async function verifyCrowdloanReservesMigration(
  ah_reserves_after: [any, any][],
  rc_funds_before: CrowdloanReserve[]
): Promise<void> {

  // Verify each fund reserve exists in AH except for bifrost (para_id 3356)
  let countOfMissingCrowdloanReserves = 0;
  for (const rc_fund of rc_funds_before) {
    const matching_entry = ah_reserves_after.find(([key, value]) => {
      const [unreserve_block, para_id, depositor] = key.args;
      const amount = value?.toJSON() as any;
      return (
        para_id?.toNumber() === rc_fund.para_id &&
        unreserve_block?.toNumber() === rc_fund.unreserve_block &&
        depositor?.toString() === rc_fund.depositor && 
        amount?.toString() === rc_fund.amount
      );
    });

    if (!matching_entry) {
      countOfMissingCrowdloanReserves++;
      logger.debug(
        `Crowdloan reserve for para_id ${rc_fund.para_id}, depositor ${rc_fund.depositor}, amount ${rc_fund.amount}, unreserve_block ${rc_fund.unreserve_block} not found after migration`
      );
    }
  }
  // countOfMissingCrowdloanReserves should be equal 1 for bifrost (para_id 3356)
  assert.equal(countOfMissingCrowdloanReserves, 1, `Count of missing crowdloan reserves should be 1 for bifrost (para_id 3356) but found ${countOfMissingCrowdloanReserves}`);
}

/**
 * Calculate the lease ending block from the number of remaining leases (including the current).
 *
 * This function matches the Rust implementation in rc-migrator/src/crowdloan.rs
 *
 * # Example
 *
 * We are in the middle of period 3 and there are 2 leases left:
 * |-0-|-1-|-2-|-3-|-4-|-5-|
 *               ^-----^
 * Then this function returns the end block number of period 4 (start block of period 5).
 */
async function calculateUnreserveBlock(
  api: ApiPromise,
  num_leases: number
): Promise<number> {
  try {

    // Get current block number
    const current_block = await api.rpc.chain.getHeader();
    const now = current_block.number.toNumber();

    // Get lease period configuration
    const lease_period =  api.consts.slots.leasePeriod as any;
    const lease_offset =  api.consts.slots.leaseOffset as any;

    const period = lease_period.toNumber();
    const offset = lease_offset.toNumber();

    // Sanity check: current block should be >= offset
    if (now < offset) {
      throw new Error(
        `Current block ${now} is less than lease offset ${offset}`
      );
    }

    // The current period: (now - offset) / period
    const current_period = Math.floor((now - offset) / period);

    // (current_period + num_leases) * period + offset
    const last_period_end_block =
      (current_period + num_leases) * period + offset;

    // Ensure the unreserve block is not in the past
    if (last_period_end_block <= now) {
      // If the calculated block is in the past, use current block + period to make it in the future - this is a special case for bifrost (para_id 3356) which has no active leases
      const future_unreserve_block = now + period;
      logger.debug(
        `Calculated unreserve block ${last_period_end_block} is in the past (current: ${now}), using future block: ${future_unreserve_block} for num_leases: ${num_leases}`
      );
      return future_unreserve_block;
    }

    return last_period_end_block;
  } catch (error) {
    logger.error("Error calculating unreserve block:", error);
    throw new Error(`Error calculating unreserve block: ${error}`);
  }
}
