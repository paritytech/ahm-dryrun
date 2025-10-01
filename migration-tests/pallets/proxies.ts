import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import { ApiDecoration } from '@polkadot/api/types';
import type { Vec, u128 } from '@polkadot/types';
import type { AccountId32 } from '@polkadot/types/interfaces';
import type { PalletProxyProxyDefinition } from '@polkadot/types/lookup';
import { translateAccountRcToAh } from '../utils/account_translation.js';

// Origin: https://github.com/polkadot-fellows/runtimes/blob/6048e1c18f36a9e00ea396d39b456f5e92ba1552/relay/polkadot/constants/src/lib.rs#L177
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

// Origin: https://github.com/polkadot-fellows/runtimes/blob/6048e1c18f36a9e00ea396d39b456f5e92ba1552/system-parachains/asset-hubs/asset-hub-polkadot/src/lib.rs#L487
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

let free_proxies: string[] = [];
export const proxyTests: MigrationTest = {
    name: 'proxy_pallet',

    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        const rc_proxies_map = await collectProxyEntries(rc_api_before);
        const ah_proxies_map = await collectProxyEntries(ah_api_before);

        const entries = await rc_api_before.query.proxy.proxies.entries();
        for (const [key, _] of entries) {
            const delegator = key.args[0] as unknown as AccountId32;
            const nonce = await rc_api_before.query.system.account(delegator).then(acc => acc.nonce.toNumber());
            if (nonce === 0) {
                free_proxies.push(delegator.toString());
            }
        }

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
        // Print differences between pre and post state
        const post_proxies = rc_proxies_after.map(([key, _]) => key.args[0].toString());
        
        console.log('Pre migration free proxies:', free_proxies.length);
        console.log('Post migration proxies:', post_proxies.length);

        // Find entries only in pre state
        const only_in_pre = free_proxies.filter(x => !post_proxies.includes(x));
        if (only_in_pre.length > 0) {
            console.log('Only in pre state:', only_in_pre);
        }

        // Find entries only in post state  
        const only_in_post = post_proxies.filter(x => !free_proxies.includes(x));
        if (only_in_post.length > 0) {
            console.log('Only in post state:', only_in_post);
        }
        assert(rc_proxies_after.length === free_proxies.length, `RC proxies got: ${rc_proxies_after.length}, want: ${free_proxies.length}`);

        // Get current AH state
        const ah_post = await collectProxyEntries(ah_api_after);

        // Apply account translation to RC delegators 
        const translated_rc_delegators_set = new Set(
            [...rc_pre.keys()].map(delegator => translateAccountRcToAh(delegator))
        );
        // add ah_pre.keys() to the set
        const translated_rc_delegators = new Set([...translated_rc_delegators_set, ...ah_pre.keys()]);

        for (const translated_delegator of translated_rc_delegators) {
            const ah_pre_delegations = ah_pre.get(translated_delegator) || [];
            const ah_post_delegations = ah_post.get(translated_delegator) || [];

            // Check all AH pre-delegations still exist
            for (const ah_pre_d of ah_pre_delegations) {
                assert(
                    ah_post_delegations.some(ah_post_d => 
                        ah_post_d.delegate === ah_pre_d.delegate && 
                        ah_post_d.proxyType.toString() === ah_pre_d.proxyType.toString()
                    ),
                    `Missing AH pre-delegation after migration for ${translated_delegator}`
                );
            }

            // Find corresponding RC delegations for this translated delegator
            const original_rc_delegator = [...rc_pre.keys()].find(orig => 
                translateAccountRcToAh(orig) === translated_delegator
            );
            const rc_pre_delegations = original_rc_delegator ? rc_pre.get(original_rc_delegator) || [] : [];

            // Check translated RC delegations exist
            for (const rc_pre_d of rc_pre_delegations) {
                const rcProxyType = rc_pre_d.proxyType.toNumber();
                const expectedAhProxyType = convertProxyType(rcProxyType);

                // Skip unsupported proxy types
                if (expectedAhProxyType === null) {
                    console.debug(`Skipping unsupported RC proxy type ${RcProxyType[rcProxyType]} for ${translated_delegator}`);
                    continue;
                }

                // Translate the delegate account for comparison
                const translatedDelegate = translateAccountRcToAh(rc_pre_d.delegate);

                // Check if the converted proxy type exists in AH post-migration
                const found = ah_post_delegations.some(post_d => {
                    const postProxyType = post_d.proxyType.toNumber();
                    return post_d.delegate === translatedDelegate && postProxyType === expectedAhProxyType;
                });

                assert(
                    found,
                    `Missing translated RC delegation for ${translated_delegator}: RC type ${rcProxyType} (${RcProxyType[rcProxyType]}) should be converted to AH type ${expectedAhProxyType} (${AhProxyType[expectedAhProxyType]})`
                );
            }
        }

    }
};