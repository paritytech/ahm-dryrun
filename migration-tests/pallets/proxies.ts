import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import { ApiDecoration } from '@polkadot/api/types';
import type { Vec, u128 } from '@polkadot/types';
import type { AccountId32 } from '@polkadot/types/interfaces';
import type { PalletProxyProxyDefinition } from '@polkadot/types/lookup';

// Relay Chain Proxy Types (before migration)
enum RcProxyType {
    Any = 0,
    NonTransfer = 1,
    Governance = 2,
    Staking = 3,
    SudoBalances = 4, // removed
    IdentityJudgement = 5, // removed
    CancelProxy = 6,
    Auction = 7,
    NominationPools = 8,
    ParaRegistration = 9
}

// Asset Hub Proxy Types (after migration)
enum AhProxyType {
    Any = 0,
    NonTransfer = 1,
    CancelProxy = 2,
    Assets = 3,
    AssetOwner = 4,
    AssetManager = 5,
    Collator = 6,
    Governance = 7,
    Staking = 8,
    NominationPools = 9
}

// Mapping from Relay Chain to Asset Hub proxy types
const proxyTypeMapping: Record<RcProxyType, AhProxyType | null> = {
    [RcProxyType.Any]: AhProxyType.Any,
    [RcProxyType.NonTransfer]: AhProxyType.NonTransfer,
    [RcProxyType.Governance]: AhProxyType.Governance,
    [RcProxyType.Staking]: AhProxyType.Staking,
    [RcProxyType.SudoBalances]: null, // removed
    [RcProxyType.IdentityJudgement]: null, // removed
    [RcProxyType.CancelProxy]: AhProxyType.CancelProxy,
    [RcProxyType.Auction]: null, // not supported in AH
    [RcProxyType.NominationPools]: AhProxyType.NominationPools,
    [RcProxyType.ParaRegistration]: null, // not supported in AH
};

// Helper function to convert RC proxy type to AH proxy type
function convertProxyType(rcProxyType: number): number | null {
    return proxyTypeMapping[rcProxyType as RcProxyType] ?? null;
}

type ProxyEntry = {
    proxyType: any;
    delegate: string;
};

type ProxyMap = Map<string, ProxyEntry[]>;

async function collectProxyEntries(api: ApiDecoration<"promise">): Promise<ProxyMap> {
    const proxies = new Map();
    const entries = await api.query.proxy.proxies.entries();

    for (const [key, value] of entries) {
        const delegator = key.args[0] as unknown as AccountId32;
        const [delegations] = value as unknown as [Vec<PalletProxyProxyDefinition>, u128];

        const formattedDelegations = delegations.map(d => ({
            proxyType: d.proxyType,
            delegate: d.delegate.toString()
        }));

        if (formattedDelegations.length > 0) {
            proxies.set(delegator.toString(), formattedDelegations);
        }
    }

    return proxies;
}

export const proxyTests: MigrationTest = {
    name: 'proxy_pallet',

    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        const rc_proxies_map = await collectProxyEntries(rc_api_before);
        const ah_proxies_map = await collectProxyEntries(ah_api_before);

        return {
            rc_pre_payload: rc_proxies_map,
            ah_pre_payload: ah_proxies_map,
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { rc_pre_payload: rc_pre, ah_pre_payload: ah_pre } = pre_payload;

        // Verify RC is empty after migration
        const rc_proxies_after = await rc_api_after.query.proxy.proxies.entries();
        assert(rc_proxies_after.length === 0, 'RC proxies should be empty after migration');

        // Get current AH state
        const ah_post = await collectProxyEntries(ah_api_after);

        // Check merged delegations
        const delegators = new Set([...rc_pre.keys(), ...ah_pre.keys()]);

        for (const delegator of delegators) {
            const ah_pre_delegations = ah_pre.get(delegator) || [];
            const rc_pre_delegations = rc_pre.get(delegator) || [];
            const ah_post_delegations = ah_post.get(delegator) || [];

            // Check all AH pre-delegations still exist
            for (const pre_d of ah_pre_delegations) {
                assert(
                    ah_post_delegations.some(post_d => 
                        post_d.delegate === pre_d.delegate && 
                        post_d.proxyType.toString() === pre_d.proxyType.toString()
                    ),
                    `Missing AH pre-delegation after migration for ${delegator}`
                );
            }

            // Check translated RC delegations exist
            for (const rc_d of rc_pre_delegations) {
                const rcProxyType = rc_d.proxyType.toNumber();
                const expectedAhProxyType = convertProxyType(rcProxyType);

                // Skip unsupported proxy types
                if (expectedAhProxyType === null) {
                    console.debug(`Skipping unsupported RC proxy type ${RcProxyType[rcProxyType]} for ${delegator}`);
                    continue;
                }

                // Check if the converted proxy type exists in AH post-migration
                const found = ah_post_delegations.some(post_d => {
                    const postProxyType = post_d.proxyType.toNumber();
                    return post_d.delegate === rc_d.delegate && postProxyType === expectedAhProxyType;
                });

                assert(
                    found,
                    `Missing translated RC delegation for ${delegator}: RC type ${rcProxyType} (${RcProxyType[rcProxyType]}) should be converted to AH type ${expectedAhProxyType} (${AhProxyType[expectedAhProxyType]})`
                );
            }
        }
    }
};