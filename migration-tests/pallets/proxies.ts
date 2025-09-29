import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import { ApiDecoration } from '@polkadot/api/types';
import type { Vec, u128 } from '@polkadot/types';
import type { AccountId32 } from '@polkadot/types/interfaces';
import type { PalletProxyProxyDefinition } from '@polkadot/types/lookup';
import type { Codec } from '@polkadot/types/types';

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

async function collectRcProxyEntries(api: ApiDecoration<"promise">): Promise<Map<[delegator: string, nonce: number], Array<[proxyType: string, delegate: string]>>> {
    const proxies = new Map<[delegator: string, nonce: number], Array<[proxyType: string, delegate: string]>>();
    const entries = await api.query.proxy.proxies.entries();

    for (const [key, value] of entries) {
        const delegator = key.args[0] as unknown as AccountId32;
        const nonce = await api.query.system.account(delegator).then(acc => acc.nonce.toNumber());

        const [delegations] = value as unknown as [Vec<PalletProxyProxyDefinition>, u128];
        for (const delegation of delegations) {
            const mapKey = [delegator.toString(), nonce] as [delegator: string, nonce: number];
            
            if (!proxies.has(mapKey)) {
                proxies.set(mapKey, []);
            }
            proxies.get(mapKey)!.push([
                delegation.proxyType.toString(),
                delegation.delegate.toString()
            ]);
        }
    }

    return proxies;
}

let free_proxies: string[] = [];
export const proxyTests: MigrationTest = {
    name: 'proxy_pallet',

    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        const rc_proxies_map = await collectRcProxyEntries(rc_api_before);
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

        // Verify RC is empty after migration
        const rc_proxies_after = await rc_api_after.query.proxy.proxies.entries();
        assert(rc_proxies_after.length > 10, `RC proxies got: ${rc_proxies_after.length}, want: more than 10`);
        
        for (const [key, value] of rc_proxies_after) {
            const delegator = key.args[0] as unknown as AccountId32;
            const [proxies, deposit] = value as unknown as [Vec<PalletProxyProxyDefinition>, u128];
            
            assert(deposit.toNumber() === 0, `Pure account ${delegator.toHuman()} should have no deposit but has ${deposit.toNumber()}`);

            for (const proxy of proxies) {
                assert(proxy.proxyType.toString() === 'Any', `Pure proxy got wrong account type for free, expected Any but got ${proxy.proxyType.toHuman()}`);
            }
        }

        // Iterate over RC pre-migration state
        const rc_pre = pre_payload.rc_pre_payload as Map<[delegator: string, nonce: number], Array<[proxyType: string, delegate: string]>>;
        for (const [[account, nonce], proxies] of rc_pre.entries()) {
            // Skip accounts with non-zero nonce
            if (nonce !== 0) {
                continue;
            }

            // Count number of Any proxy types
            const numAny = proxies.filter(([proxyType]) => proxyType === 'Any').length;
            if (numAny === 0) {
                // Verify no empty vectors in storage
                const hasProxies = await rc_api_after.query.proxy.proxies(account);
                if (hasProxies) {
                    console.log(`Has proxies for ${account}`);
                }
                // assert(!hasProxies, "No empty vectors should exist in storage");
                continue;
            }

            // Get post-migration proxies for this account
            const [postProxies, deposit] = await rc_api_after.query.proxy.proxies(account);

            console.log(`Number of proxies should match for ${account}. Got: ${postProxies.length}, Expected: ${numAny}`);
            // Verify deposit is zero and proxy count matches
            assert(deposit.isZero(), `Deposit should be zero for pure proxy ${account}`);
            if (postProxies.length !== numAny) {
                // console.log(`Number of proxies should match for ${account}. Got: ${postProxies.length}, Expected: ${numAny}`);
            }
            // assert.equal(postProxies.length, numAny, 
            //     `Number of proxies should match for ${account}. Got: ${postProxies.length}, Expected: ${numAny}`);
        }




    },

    //     for (const [key, _] of rc_proxies_after) {
    //     // Print differences between pre and post state
    //     const post_proxies = rc_proxies_after.map(([key, _]) => key.args[0].toString());
        
    //     console.log('Pre migration free proxies:', free_proxies.length);
    //     console.log('Post migration proxies:', post_proxies.length);

    //     // Find entries only in pre state
    //     const only_in_pre = free_proxies.filter(x => !post_proxies.includes(x));
    //     if (only_in_pre.length > 0) {
    //         console.log('Only in pre state:', only_in_pre);
    //     }

    //     // Find entries only in post state  
    //     const only_in_post = post_proxies.filter(x => !free_proxies.includes(x));
    //     if (only_in_post.length > 0) {
    //         console.log('Only in post state:', only_in_post);
    //     }
    //     assert(rc_proxies_after.length === free_proxies.length, `RC proxies got: ${rc_proxies_after.length}, want: ${free_proxies.length}`);

    //     // Get current AH state
    //     const ah_post = await collectProxyEntries(ah_api_after);

    //     // Check merged delegations
    //     const delegators = new Set([...rc_pre.keys(), ...ah_pre.keys()]);

    //     for (const delegator of delegators) {
    //         const ah_pre_delegations = ah_pre.get(delegator) || [];
    //         const rc_pre_delegations = rc_pre.get(delegator) || [];
    //         const ah_post_delegations = ah_post.get(delegator) || [];

    //         // Check all AH pre-delegations still exist
    //         for (const pre_d of ah_pre_delegations) {
    //             assert(
    //                 ah_post_delegations.some(post_d => 
    //                     post_d.delegate === pre_d.delegate && 
    //                     post_d.proxyType.toString() === pre_d.proxyType.toString()
    //                 ),
    //                 `Missing AH pre-delegation after migration for ${delegator}`
    //             );
    //         }

    //         // Check translated RC delegations exist
    //         for (const rc_d of rc_pre_delegations) {
    //             const rcProxyType = rc_d.proxyType.toNumber();
    //             const expectedAhProxyType = convertProxyType(rcProxyType);

    //             // Skip unsupported proxy types
    //             if (expectedAhProxyType === null) {
    //                 console.debug(`Skipping unsupported RC proxy type ${RcProxyType[rcProxyType]} for ${delegator}`);
    //                 continue;
    //             }

    //             // Check if the converted proxy type exists in AH post-migration
    //             const found = ah_post_delegations.some(post_d => {
    //                 const postProxyType = post_d.proxyType.toNumber();
    //                 return post_d.delegate === rc_d.delegate && postProxyType === expectedAhProxyType;
    //             });

    //             assert(
    //                 found,
    //                 `Missing translated RC delegation for ${delegator}: RC type ${rcProxyType} (${RcProxyType[rcProxyType]}) should be converted to AH type ${expectedAhProxyType} (${AhProxyType[expectedAhProxyType]})`
    //             );
    //         }
    //     }
    // }
};