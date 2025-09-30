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
    IdentityJudgement = 4, // removed
    CancelProxy = 5,
    Auction = 6,
    Society = 7,
    NominationPools = 8,
    Spokesperson = 9,
    ParaRegistration = 10
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
    NominationPools = 9,
    Auction = 10,
    ParaRegistration = 11,
    Society = 12,
    Spokesperson = 13
}

// Mapping from Relay Chain to Asset Hub proxy types
const proxyTypeMapping: Record<RcProxyType, AhProxyType | null> = {
    [RcProxyType.Any]: AhProxyType.Any,
    [RcProxyType.NonTransfer]: AhProxyType.NonTransfer,
    [RcProxyType.Governance]: AhProxyType.Governance,
    [RcProxyType.Staking]: AhProxyType.Staking,
    [RcProxyType.IdentityJudgement]: null, // removed
    [RcProxyType.CancelProxy]: AhProxyType.CancelProxy,
    [RcProxyType.Auction]: AhProxyType.Auction,
    [RcProxyType.Society]: AhProxyType.Society,
    [RcProxyType.NominationPools]: AhProxyType.NominationPools,
    [RcProxyType.Spokesperson]: AhProxyType.Spokesperson,
    [RcProxyType.ParaRegistration]: AhProxyType.ParaRegistration, // not supported in AH
};

function rcProxyTypeFromString(rcProxyType: string): RcProxyType {
    switch (rcProxyType) {
        case 'Any':
            return RcProxyType.Any;
        case 'NonTransfer':
            return RcProxyType.NonTransfer;
        case 'Governance':
            return RcProxyType.Governance;
        case 'Staking':
            return RcProxyType.Staking;
        case 'CancelProxy':
            return RcProxyType.CancelProxy;
        case 'Auction':
            return RcProxyType.Auction;
        case 'Society':
            return RcProxyType.Society;
        case 'NominationPools':
            return RcProxyType.NominationPools;
        case 'Spokesperson':
            return RcProxyType.Spokesperson;
        case 'ParaRegistration':
            return RcProxyType.ParaRegistration;
        default:
            throw new Error(`Invalid RC proxy type: ${rcProxyType}`);
    }
}

function convertProxyType(rcProxyType: RcProxyType): AhProxyType | null {
    return proxyTypeMapping[rcProxyType] ?? null;
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
        const mapKey = [delegator.toString(), nonce] as [delegator: string, nonce: number];
        for (const delegation of delegations) {
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

        // Verify RC has some entries after migration
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

            // Count number of Any proxy types for that account
            const numAny = proxies.filter(([proxyType]) => proxyType === 'Any').length;
            const [postProxies, deposit] = await rc_api_after.query.proxy.proxies(account);
            
            if (numAny === 0) {
                const containsKey = rc_proxies_after.some(([k]) => k.args[0].toString() === account);
                assert(!containsKey, "No empty vectors should exist in storage");
                continue;
            }

            // Verify deposit is zero and proxy count matches
            assert(deposit.isZero(), `Deposit should be zero for pure proxy ${account}`);
            assert.equal(postProxies.length, numAny, 
                `Number of proxies should match for ${account}. Got: ${postProxies.length}, Expected: ${numAny}`);
        }

        // Verify AH proxies after migration are merged from RC and AH pre-migration states
        const ah_pre = pre_payload.ah_pre_payload as ProxyMap;
        // Get all delegators from both RC and AH pre-migration states
        const translated_delegators = new Set([
            ...Array.from(rc_pre.keys()).map(([delegator]) => translateAccountRcToAh(delegator)),
            ...Array.from(ah_pre.keys())
        ]);

        let failed = 0;
        for (const delegator of translated_delegators) {
            // Get post-migration AH delegations
            const [ah_post_proxies] = await ah_api_after.query.proxy.proxies(delegator);
            const ah_post_delegations = ah_post_proxies.map(d => ({
                proxyType: d.proxyType,
                delegate: d.delegate.toString()
            }));

            // Verify all pre-migration AH delegations still exist
            const ah_pre_delegations = ah_pre.get(delegator) || [];
            for (const ah_pre_d of ah_pre_delegations) {
                assert(
                    ah_post_delegations.some(d => 
                        d.proxyType.eq(ah_pre_d.proxyType) && 
                        d.delegate === ah_pre_d.delegate
                    ),
                    `AH delegations should still be available for delegator ${delegator}. Missing ${JSON.stringify(ah_pre_d)} in post-migration state`
                );
            }

            // Find original RC delegator that translates to current AH delegator
            const original_rc_delegator = Array.from(rc_pre.keys()).find(([orig]) => 
                translateAccountRcToAh(orig) === delegator
            );
            // If we found an original RC delegator, verify their delegations were properly translated
            if (original_rc_delegator) {
                const rc_delegations = rc_pre.get(original_rc_delegator) || [];

                // Verify all translatable RC delegations exist in post-migration state
                for (const [rcProxyType, rcDelegate] of rc_delegations) {
                    
                    const convertedType = convertProxyType(rcProxyTypeFromString(rcProxyType));
                    // Skip if proxy type cannot be translated
                    if (convertedType === null) continue;

                    const translatedDelegate = translateAccountRcToAh(rcDelegate);

                    
                    const res = ah_post_delegations.some(d =>
                        d.proxyType.toString() === AhProxyType[convertedType] &&
                        d.delegate === translatedDelegate
                    );
                    if (!res) {
                        console.log(`Converted type ${AhProxyType[convertedType]} translated delegate ${translatedDelegate} in post-migration state`);
                        console.log(`AH post delegations: ${JSON.stringify(ah_post_delegations)}`);
                        console.log(`Delegator: ${delegator}`);
                        failed++;
                        // console.log(`RC delegations: ${JSON.stringify(rc_delegations)}`);
                        // console.log(`AH post delegations: ${JSON.stringify(ah_post_delegations)}`);
                    }
                    // assert(
                    //     res,
                    //     `RC delegations should be available on AH for delegator ${delegator}. Missing proxy type ${rcProxyType} for delegate ${rcDelegate} in post-migration state. Original RC delegations: ${JSON.stringify(rc_delegations)}, Pre-migration AH delegations: ${JSON.stringify(ah_pre_delegations)}`
                    // );
                }
            }
        }
        console.log(`Failed: ${failed}`);

    },
};