import '@polkadot/api-augment';
import { MigrationTest, PostCheckContext, PreCheckContext, PreCheckResult } from '../../types.js';
import assert from 'assert';
import type { StorageKey } from '@polkadot/types/primitive';
import type { Codec } from '@polkadot/types/types';

export const generalStakingTests: MigrationTest = {
    name: 'general_staking_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        return {
            rc_pre_payload: undefined,
            ah_pre_payload: undefined
        };
    },
    post_check: async (
        context:    PostCheckContext,
        pre_payload:    PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;

        const wantMode = await detectNetwork(rc_api_after) === 'polkadot' ? 'Buffered' : 'Active';
        const mode = await rc_api_after.query.stakingAhClient.mode();
        assert(mode.toHuman() === wantMode, `Staking mode should be ${wantMode}`);

        const activeEra = await ah_api_after.query.staking.activeEra();
        assert(activeEra.isSome, 'Assert activeEra is Some');

        const currentEra = await ah_api_after.query.staking.currentEra();
        assert(activeEra.isSome, 'Assert activeEra is Some');

        const forcing = await ah_api_after.query.staking.forceEra();
        assert(forcing.toHuman() === 'NotForcing', 'Assert forceEra is NotForcing');

        const currentMultiBlockPhase = await ah_api_after.query.multiBlockElection.currentPhase();

        // TODO: check for session report. Is it an event or a query?
        if (currentMultiBlockPhase.toHuman() === 'Off') {
            // If phase is Off, current era should be the same as active era
            assert(currentEra.unwrap().toNumber() === activeEra.unwrap().index.toNumber(), 'Assert currentEra matches activeEra index');
        } else {
            // If phase IS NOT Off, current era should equal to active era + 1
            assert(currentEra.unwrap().toNumber() === activeEra.unwrap().index.toNumber() + 1, 'Assert currentEra matches activeEra index + 1');
        }

    }
}; 

type Network = "kusama" | "polkadot";
async function detectNetwork(api: any): Promise<Network> {
    const chainName = (await api.rpc.system.chain()).toString().toLowerCase();
  
    if (chainName.includes("kusama")) return "kusama";
    if (chainName.includes("polkadot")) return "polkadot";
  
    // For Asset Hub chains
    if (chainName.includes("asset-hub-kusama") || chainName.includes("statemine"))
      return "kusama";
    if (
      chainName.includes("asset-hub-polkadot") ||
      chainName.includes("statemint")
    )
      return "polkadot";
  
    throw new Error(
      `Unsupported network: ${chainName}. Only kusama and polkadot are supported.`,
    );
  }