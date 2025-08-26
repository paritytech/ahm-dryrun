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

interface CrowdloanFund {
  para_id: number;
  fund_index: number;
  depositor: string;
  deposit: string;
  raised: string;
  end: number;
  cap: string;
  first_period: number;
  last_period: number;
  trie_index: number;
}

interface LeaseEntry {
  para_id: number;
  leases: Array<[string, string] | null>; // [account, amount] or null
}

interface CrowdloanContribution {
  para_id: number;
  contributor: string;
  amount: string;
  memo: string;
}

export const crowdloanTests: MigrationTest = {
  name: "crowdloan_pallet",
  pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
    const { rc_api_before, ah_api_before } = context;

    // Collect RC crowdloan funds data
    const rc_funds = await rc_api_before.query.crowdloan.funds.entries();
    const rc_funds_data: CrowdloanFund[] = rc_funds.map(([key, value]) => {
      const para_id = (key.args[0] as any).toNumber();
      const fund = value as any;
      return {
        para_id,
        fund_index: fund.fundIndex.toNumber(),
        depositor: fund.depositor.toString(),
        deposit: fund.deposit.toString(),
        raised: fund.raised.toString(),
        end: fund.end.toNumber(),
        cap: fund.cap.toString(),
        first_period: fund.firstPeriod.toNumber(),
        last_period: fund.lastPeriod.toNumber(),
        trie_index: fund.trieIndex.toNumber(),
      };
    });

    // Collect RC leases data
    const rc_leases = await rc_api_before.query.slots.leases.entries();
    const rc_leases_data: LeaseEntry[] = rc_leases.map(([key, value]) => {
      const para_id = (key.args[0] as any).toNumber();
      const leases = value as any;
      return {
        para_id,
        leases: leases.map((lease: any) =>
          lease.isSome
            ? [lease.unwrap()[0].toString(), lease.unwrap()[1].toString()]
            : null
        ),
      };
    });

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
    // TODO: Implement post-check logic

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
  rc_funds_before: CrowdloanFund[],
  rc_leases_before: LeaseEntry[],
  rc_contributions_before: CrowdloanContribution[]
): Promise<void> {
  // Get AH storage after migration
  const ah_lease_reserves_after =
    await ah_api_after.query.ahOps.rcLeaseReserve.entries();
  const ah_crowdloan_contributions_after =
    await ah_api_after.query.ahOps.rcCrowdloanContribution.entries();
  const ah_crowdloan_reserves_after =
    await ah_api_after.query.ahOps.rcCrowdloanReserve.entries();

  // Verify lease reserves migration
  await verifyLeaseReservesMigration(ah_lease_reserves_after, rc_leases_before);

  // Verify crowdloan contributions migration
  await verifyCrowdloanContributionsMigration(
    ah_crowdloan_contributions_after,
    rc_contributions_before
  );

  // Verify crowdloan reserves migration
  await verifyCrowdloanReservesMigration(
    ah_crowdloan_reserves_after,
    rc_funds_before
  );
}

async function verifyLeaseReservesMigration(
  ah_lease_reserves_after: any[],
  rc_leases_before: LeaseEntry[]
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
      const [unreserve_block, para_id, account] = key.args;
      return para_id.toNumber() === rc_lease.para_id;
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
      const [withdraw_block, para_id, contributor] = key.args;
      return (
        para_id.toNumber() === rc_contribution.para_id &&
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
  rc_funds_before: CrowdloanFund[]
): Promise<void> {
  // Verify each fund reserve exists in AH
  for (const rc_fund of rc_funds_before) {
    const matching_entry = ah_reserves_after.find(([key]) => {
      const [unreserve_block, para_id, depositor] = key.args;
      return (
        para_id.toNumber() === rc_fund.para_id &&
        depositor.toString() === rc_fund.depositor
      );
    });

    assert(
      matching_entry !== undefined,
      `Crowdloan reserve for para_id ${rc_fund.para_id}, depositor ${rc_fund.depositor} not found after migration`
    );
  }
}
