import '@polkadot/api-augment';
import '@polkadot/types-augment';
import { setupNetworks } from '@acala-network/chopsticks-testing'
import { Keyring } from '@polkadot/api';
import { FrameSupportTokensFungibleUnionOfNativeOrWithId, XcmVersionedLocation } from '@polkadot/types/lookup';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { logger } from "../shared/logger.js";
import assert from 'assert';

// Wait for crypto to be ready before creating Keyring
await cryptoWaitReady();
const keyring = new Keyring({ type: 'sr25519' });
const alicePair = keyring.addFromUri('//Alice');


export async function treasury_spend(): Promise<void> {
    const aliceSS58 = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
    const aliceHEX = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
    const USDT_ID = 1984;
    const ASSET_HUB_PARA_ID = 1000;
    const ASSETS_PALLET_ID = 50;

    const {polkadot, assetHub} = await setupNetworks({
        polkadot: {
            endpoint: 'wss://polkadot-rpc.publicnode.com',
            port: 8008,
        },
        assetHub: {
            endpoint: 'wss://polkadot-assethub-rpc.blockops.network',
            port: 8009,
        },
    });

    // record balance before
    const balanceBefore = await assetHub.api.query.assets.account(USDT_ID, aliceSS58);
    const amount = 123123123123n;
    const assetKind = {
        "v4": {
            "location": {
                "parents": 0,
                "interior": {
                    "x1": [
                        {
                            "parachain": ASSET_HUB_PARA_ID
                        }
                    ]
                }
            },
            "assetId": {
                "parents": 0,
                "interior": {
                    "x2": [
                        {
                            "palletInstance": ASSETS_PALLET_ID
                        },
                        {
                            "generalIndex": USDT_ID
                        }
                    ]
                }
            }
        }
    } as unknown as FrameSupportTokensFungibleUnionOfNativeOrWithId;
	const beneficiary = {
		"v4": {
			"parents": 0,
			"interior": {
				"x1": [
					{
						"accountId32": {
							"network": null,
							"id": aliceHEX
						}
					}
				]
			}
		}
	} as unknown as XcmVersionedLocation;
    // validFrom - null, which means immediately.	
    const call = polkadot.api.tx.treasury.spend(assetKind, amount, beneficiary, null);
    const hexCall = call.method.toHex();
    
    // schedule `Treasury.spend` call to be executed in the next block
    const nextBlock = (await polkadot.api.rpc.chain.getHeader()).number.toNumber();
    await polkadot.api.rpc('dev_setStorage', {
        scheduler: {
            agenda: [
                [
                    [nextBlock + 1], [{
                        call: {
                            // spend USDT to Alice
                            Inline: hexCall,
                        },
                        origin: {
                            Origins: 'BigSpender'
                        }
                    }],
                ],
            ]
        }
    });

    // Make blocks to execute scheduled call
    await polkadot.api.rpc('dev_newBlock', { count: 1 });

    // top up Alice to sign the payout transaction
    await polkadot.dev.setStorage({
        System: {
            account: [[[aliceSS58], { providers: 1, data: { free: 100000e10 } }]],
        },
    });

    // find index to payout from the events
    let index = 0;
    const events = await polkadot.api.query.system.events();
    logger.info('Events after spend block:');
    for (const event of events) {
        if (event.event.section === 'treasury' && event.event.method === 'AssetSpendApproved') {
            index = (event.event.data[0] as any).toNumber();
            logger.info('AssetSpendApproved index', { index });
            break;
        }
    }
    
    // payout
    await polkadot.api.tx.treasury.payout(index).signAndSend(alicePair);

    // create blocks on RC and AH to ensure that payout is properly processed
    await polkadot.api.rpc('dev_newBlock', { count: 1 });
    await assetHub.api.rpc('dev_newBlock', { count: 1 });
    

    // verify that Alice's balance is increased by the `amount`
    const balanceAfter = await assetHub.api.query.assets.account(USDT_ID, aliceHEX);
    const before = balanceBefore.isSome ? BigInt(balanceBefore.unwrap().balance.toString()) : 0n;
    const after = balanceAfter.isSome ? BigInt(balanceAfter.unwrap().balance.toString()) : 0n;
    assert(after - before === amount, `Expected balance difference to be ${amount}, but got ${after - before}`);
}
