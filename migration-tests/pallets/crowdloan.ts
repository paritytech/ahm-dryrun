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