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

    return {
      rc_pre_payload: {},
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
