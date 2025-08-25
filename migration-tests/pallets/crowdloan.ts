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
  },
} as const;
