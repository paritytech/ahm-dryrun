import "@polkadot/api-augment";
import assert from "assert";
import {
  PreCheckContext,
  PostCheckContext,
  MigrationTest,
  PreCheckResult,
} from "../types.js";
import type { Codec } from "@polkadot/types/types";
import type { ParaId } from "@polkadot/types/interfaces";
import { ApiPromise } from "@polkadot/api";

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

interface CrowdloanContribution {
  withdraw_block: number;
  contributor: string;
  para_id: number;
  amount: string;
  crowdloan_account: string;
}

export const crowdloanTests: MigrationTest = {
  name: "crowdloan_pallet",
  pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
    const { rc_api_before, ah_api_before } = context;

    // Collect RC crowdloan funds data
    const rc_funds = await rc_api_before.query.crowdloan.funds.entries();
    const rc_funds_data: CrowdloanReserve[] = [];

    for (const [key, value] of rc_funds) {
      const para_id = (key.args[0] as any).toNumber();
      const fund = value as any;

      // Get leases for this parachain to calculate unreserve_block
      const leases = await rc_api_before.query.slots.leases(para_id);

      // Handle Codec properly - convert to array first
      const leasesArray = (leases as any).toArray();
      const num_active_leases = leasesArray.filter(
        (lease: any) =>
          lease &&
          typeof lease === "object" &&
          "isSome" in lease &&
          lease.isSome
      ).length;

      // Calculate unreserve_block - add await here
      const unreserve_block = await calculateUnreserveBlock(
        rc_api_before,
        num_active_leases
      );

      rc_funds_data.push({
        unreserve_block,
        depositor: fund.depositor.toString(),
        para_id,
        amount: fund.deposit.toString(),
      });
    }

    // Collect RC leases data
    const rc_leases = await rc_api_before.query.slots.leases.entries();
    const rc_leases_data: LeaseReserve[] = [];

    for (const [key, value] of rc_leases) {
      const para_id = (key.args[0] as any).toNumber();
      const leases = value as any;

      // Process each lease to create LeaseReserve entries
      for (let i = 0; i < leases.length; i++) {
        const lease = leases[i];
        if (
          lease &&
          typeof lease === "object" &&
          "isSome" in lease &&
          lease.isSome
        ) {
          const [account, amount] = lease.unwrap();

          // Calculate unreserve_block for this lease
          const num_remaining_leases = leases.length - i;
          const unreserve_block = await calculateUnreserveBlock(
            rc_api_before,
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
    }

    // Collect RC contributions data (this is more complex due to child trie)
    // TODO : dhirajs0 get the contribution data from the child stograge
    const rc_contributions: CrowdloanContribution[] = [];

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
        contributions: rc_contributions,
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
      contributions: rc_contributions_before,
    } = pre_payload.rc_pre_payload;

    await verifyRcStorageEmpty(rc_api_after);

    await verifyAhStorageMatchesRcPreMigrationData(
      ah_api_after,
      rc_funds_before,
      rc_leases_before,
      rc_contributions_before
    );
  },
} as const;

async function verifyRcStorageEmpty(rc_api_after: any): Promise<void> {
  const rc_funds_after = await rc_api_after.query.crowdloan.funds.entries();
  const rc_leases_after = await rc_api_after.query.slots.leases.entries();
  // TODO : dhirajs0 get the contribution data from the child storage
  // const rc_contributions_after = [];

  assert.equal(
    rc_funds_after.length,
    0,
    "RC crowdloan funds should be empty after migration"
  );
  assert.equal(
    rc_leases_after.length,
    0,
    "RC leases should be empty after migration"
  );
  // assert.equal(rc_contributions_after.length, 0, 'RC contributions should be empty after migration');
}

async function verifyAhStorageMatchesRcPreMigrationData(
  ah_api_after: any,
  rc_funds_before: CrowdloanReserve[],
  rc_leases_before: LeaseReserve[],
  rc_contributions_before: CrowdloanContribution[]
): Promise<void> {
  // Get AH storage after migration
  const ah_lease_reserves_after =
    await ah_api_after.query.ahOps.rcLeaseReserve.entries();
  const ah_crowdloan_contributions_after =
    await ah_api_after.query.ahOps.rcCrowdloanContribution.entries();
  const ah_crowdloan_reserves_after =
    await ah_api_after.query.ahOps.rcCrowdloanReserve.entries();

  await verifyLeaseReservesMigration(ah_lease_reserves_after, rc_leases_before);

  await verifyCrowdloanContributionsMigration(
    ah_crowdloan_contributions_after,
    rc_contributions_before
  );

  await verifyCrowdloanReservesMigration(
    ah_crowdloan_reserves_after,
    rc_funds_before
  );
}

async function verifyLeaseReservesMigration(
  ah_lease_reserves_after: any[],
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
    const matching_entry = ah_lease_reserves_after.find(([key]) => {
      const [unreserve_block, para_id, account, amount] = key.args;
      return (
        para_id.toNumber() === rc_lease.para_id &&
        unreserve_block.toNumber() === rc_lease.unreserve_block &&
        account.toString() === rc_lease.account &&
        amount.toString() === rc_lease.amount
      );
    });

    assert(
      matching_entry !== undefined,
      `Lease reserve for para_id ${rc_lease.para_id} not found after migration`
    );
  }
}

async function verifyCrowdloanContributionsMigration(
  ah_contributions_after: any[],
  rc_contributions_before: CrowdloanContribution[]
): Promise<void> {
  // Verify each contribution exists in AH
  for (const rc_contribution of rc_contributions_before) {
    const matching_entry = ah_contributions_after.find(([key]) => {
      const [withdraw_block, para_id, contributor, amount] = key.args;
      return (
        para_id.toNumber() === rc_contribution.para_id &&
        withdraw_block.toNumber() === rc_contribution.withdraw_block &&
        contributor.toString() === rc_contribution.contributor
      );
    });

    assert(
      matching_entry !== undefined,
      `Contribution for para_id ${rc_contribution.para_id}, contributor ${rc_contribution.contributor} not found after migration`
    );
  }
}

async function verifyCrowdloanReservesMigration(
  ah_reserves_after: any[],
  rc_funds_before: CrowdloanReserve[]
): Promise<void> {
  // Verify each fund reserve exists in AH
  for (const rc_fund of rc_funds_before) {
    const matching_entry = ah_reserves_after.find(([key]) => {
      const [unreserve_block, para_id, depositor, amount] = key.args;
      return (
        para_id.toNumber() === rc_fund.para_id &&
        unreserve_block.toNumber() === rc_fund.unreserve_block &&
        depositor.toString() === rc_fund.depositor &&
        amount.toString() === rc_fund.amount
      );
    });

    assert(
      matching_entry !== undefined,
      `Crowdloan reserve for para_id ${rc_fund.para_id}, depositor ${rc_fund.depositor} not found after migration`
    );
  }
}

/**
 * Calculate the lease ending block from the number of remaining leases
 */
async function calculateUnreserveBlock(
  api: any,
  num_leases: number
): Promise<number> {
  try {
    // Get current block number
    const current_block = await api.rpc.chain.getHeader();
    const now = current_block.number.toNumber();

    // Get lease period configuration - handle Codec properly
    const lease_period = (await api.consts.slots.leasePeriod) as any;
    const lease_offset = (await api.consts.slots.leaseOffset) as any;

    const period = lease_period.toNumber();
    const offset = lease_offset.toNumber();

    // Sanity check: current block should be >= offset
    if (now < offset) {
      throw new Error(
        `Current block ${now} is less than lease offset ${offset}`
      );
    }

    // Calculate current period: (now - offset) / period
    const current_period = Math.floor((now - offset) / period);

    // Calculate last period end block: (current_period + num_leases) * period + offset
    const last_period_end_block =
      (current_period + num_leases) * period + offset;

    return last_period_end_block;
  } catch (error) {
    console.error("Error calculating unreserve block:", error);
    // Fallback: return current block + some reasonable offset
    const current_block = await api.rpc.chain.getHeader();
    return current_block.number.toNumber() + 1000; // Fallback offset
  }
}
