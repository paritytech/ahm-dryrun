import '@polkadot/api-augment';
import '@polkadot/types-augment';
import { ApiPromise } from '@polkadot/api';
import { setupNetworks } from '@acala-network/chopsticks-testing'
import { Enum } from '@polkadot/types';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';

import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";
import { getPolkadotSigner } from "polkadot-api/signer";

// Initialize HDKD key pairs and signers
const entropy = mnemonicToEntropy(DEV_PHRASE);
const miniSecret = entropyToMiniSecret(entropy);
const derive = sr25519CreateDerive(miniSecret);

const hdkdKeyPairAlice = derive("//Alice");
const aliceSigner = getPolkadotSigner(
  hdkdKeyPairAlice.publicKey,
  "Sr25519",
  hdkdKeyPairAlice.sign,
);

// Wait for crypto to be ready before creating Keyring
await cryptoWaitReady();
const keyring = new Keyring({ type: 'sr25519' });
const alicePair = keyring.addFromUri('//Alice');

const POT_ACCOUNT = '5EYCAe5ijiYfyeZ2JJCGq56LmPyNRAKzpG4QkoQkkQNB5e6Z';

export async function treasury_spend(ah_api_after: ApiPromise): Promise<void> {

    await local_spend_polkadot();
    await new Promise(() => {}); // Wait indefinitely
    return;
    

    const {assetHub} = await setupNetworks({
        assetHub: {
            endpoint: 'wss://westend-asset-hub-rpc.polkadot.io',
            port: 8008,
            'runtime-log-level': 5,
        },
    });

    console.log('POT balance before:');
    console.log((await assetHub.api.query.system.account(POT_ACCOUNT)).data.toString());

    for (let i = 0; i < 3; i++) {
        const codec = await assetHub.api.query.parachainSystem.lastRelayChainBlockNumber();
        const number = parseInt(codec.toString(), 10);
        console.log(`Setting agenda for ${i} with number ${number}`);

    
        await assetHub.api.rpc('dev_setStorage', {
            scheduler: {
                agenda: [
                    [
                        [number], [{
                            call: {
                                // Treasury.spend() - https://github.com/polkadot-fellows/runtimes/blob/6048e1c18f36a9e00ea396d39b456f5e92ba1552/pallets/rc-migrator/src/treasury.md#spend-call-api
                                Inline: "0x5e05050000010049130500010100d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d00", 
                            },
                            origin: {
                                System: 'Root'
                            }
                        }]
                    ]
                ]
            }
        });

      await assetHub.api.rpc('dev_newBlock', { count: 1 });

      // Get the latest block hash
      const headHash = await assetHub.api.rpc.chain.getBlockHash();
      // Create an API instance at the latest block
      const apiAt = await assetHub.api.at(headHash);

      // Query and print events
      const events = await apiAt.query.system.events();
      console.log(`Events after ${i} iteration:`);
      for (const event of events) {
        console.log('Event:', event.event.method, event.event.section);
        console.log('Data:', JSON.stringify(event.event.data, null, 2));
      }

      console.log('POT balance after:');
      console.log((await apiAt.query.system.account(POT_ACCOUNT)).data.toString());
    }
}


// DO NOT REVIEW THIS FUNCTIONS

async function local_spend_polkadot(): Promise<void> {
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

    const alice_address = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
    const alice = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
    console.log('Alice balance before:');


    assetHub.api.query.assets.account(1984, alice)
    const balance_before = await assetHub.api.query.assets.account(1984, alice_address);
    // const balance_before = await polkadot.api.query.foreignAssets.account(1984, alice_address);
    console.log(balance_before.toString());

    const amount = 444444444444n;
    const call = polkadot.api.tx.treasury.spendLocal(amount, alice);

    const inlineHex = call.method.toHex();
    console.log("inlineHex is ", inlineHex);

    const number = (await polkadot.api.rpc.chain.getHeader()).number.toNumber()
    await polkadot.api.rpc('dev_setStorage', {
        scheduler: {
            agenda: [
                [
                    [number + 1], [{
                        call: {
                            // Inline: inlineHex,
                            // spend USDT to Alice
                            Inline: "0x130504000100a10f0002043205011f07c920f0211f0400010100d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d00"
                        },
                        origin: {
                            System: 'Root'
                        }
                    }],
                ],
            ]
        }
    });

    // Make blocks to include the scheduled call
    await polkadot.api.rpc('dev_newBlock', { count: 1 });

   
    let index = 0;
    const events = await polkadot.api.query.system.events();
      console.log(`Events after spend block:`);
      for (const event of events) {
        console.log('Event:', event.event.method, event.event.section);
        console.log('Data:', JSON.stringify(event.event.data, null, 2));
        if (event.event.section === 'treasury' && event.event.method === 'AssetSpendApproved') {
          index = (event.event.data[0] as any).toNumber();
          console.log('AssetSpendApproved index:', index);
          break;
        }
      }


    const pay_out_call = polkadot.api.tx.treasury.payout(index);
    // const pay_out_call = polkadot.api.tx.treasury.checkStatus(index);
    await polkadot.dev.setStorage({
        System: {
          account: [[[alice_address], { providers: 1, data: { free: 100000e10 } }]],
        },
      })
    
    try {
        const status = await pay_out_call.signAndSend(alicePair, ({ events = [], status, txHash }) => {
            console.log(`Current status is ${status.type}`);
        
            if (status.isFinalized) {
                console.log(`Transaction included at blockHash ${status.asFinalized}`);
                console.log(`Transaction hash ${txHash.toHex()}`);
        
                // Loop through Vec<EventRecord> to display all events
                events.forEach(({ phase, event: { data, method, section } }) => {
                    console.log(`\t' ${phase}: ${section}.${method}:: ${data}`);
                });

            }
        });
        console.log('status is ', status);
    } catch (error) {
        console.error('Payout transaction failed:', error);
    }

    const events_after_payout = await polkadot.api.query.system.events();
    console.log(`Events after payout block:`);
    for (const event of events_after_payout) {
        console.log('Event:', event.event.method, event.event.section);
        console.log('Data:', JSON.stringify(event.event.data, null, 2));
      }

      await polkadot.api.rpc('dev_newBlock', { count: 1 });
      await assetHub.api.rpc('dev_newBlock', { count: 1 });
      // TODO: top up Alice balance with config.
    const balance_after = await assetHub.api.query.assets.account(1984, alice);
    console.log('Alice USDT balance:');
    console.log(balance_after.toHuman());

    const before = balance_before.isSome ? BigInt(balance_before.unwrap().balance.toString()) : 0n;
    const after = balance_after.isSome ? BigInt(balance_after.unwrap().balance.toString()) : 0n;
    console.log('Alice balance after - before:');
    console.log(after - before);
}

// async function spend_polkadot(): Promise<void> {
//     const {polkadot} = await setupNetworks({
//         polkadot: {
//             endpoint: 'wss://polkadot-rpc.publicnode.com',
//             port: 8008,
//         },
//     });

//     const number = (await polkadot.api.rpc.chain.getHeader()).number.toNumber()
//     console.log('latest block number', number);
//     console.log('Treasury balance before:');
//     console.log((await polkadot.api.query.system.account('13UVJyLnbVp9RBZYFwFGyDvVd1y27Tt8tkntv6Q7JVPhFsTB')).data.toString());

//     const assetKind = {
//       V4: {
//         location: {
//           parents: 0,
//           interior: {
//             X1: [
//               { Parachain: 1000 }
//             ]
//           }
//         },
//         assetId: {
//           parents: 0,
//           interior: {
//             X2: [
//               { PalletInstance: 50 },
//               { GeneralIndex: 1984 }
//             ]
//           }
//         }
//       }
//     };
//     const amount = 1337n;
//     const beneficiary = {
//       V4: {
//         parents: 0,
//         interior: {
//           X1: [
//             {
//               AccountId32: {
//                 network: null,
//                 id: '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d'
//               }
//             }
//           ]
//         }
//       }
//     };
//     const validFrom = null;
//     const asd = new Enum('V4', {
//         location: {
//             parents: 0,
//             interior: { X1: [{ Parachain: 1000 }] }
//         },
//         assetId: {
//             parents: 0,
//             interior: { X2: [{ PalletInstance: 50 }, { GeneralIndex: 1984 }] }
//         }
//     });
//     const call = polkadot.api.tx.treasury.spend(
//       Enum('V4', {
//         location: {
//           parents: 0,
//           interior: { X1: [{ Parachain: 1000 }] }
//         },
//         assetId: {
//           parents: 0,
//           interior: { X2: [{ PalletInstance: 50 }, { GeneralIndex: 1984 }] }
//         }
//       }),
//       amount,
//       {Address32: {id: '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d'}},
//       null
//     );
//     const inlineHex = call.method.toHex();
//     console.log("inlineHex is ", inlineHex);

//     await polkadot.api.rpc('dev_setStorage', {
//         scheduler: {
//             agenda: [
//                 [
//                     [number + 1], [{
//                         call: {
//                             // works and emits events
//                             Inline: "0x130504000100a10f0002043205011fe5140500010100d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d00",
//                         },
//                         origin: {
//                             System: 'Root'
//                         }
//                     }]
//                 ]
//             ]
//         }
//     });

//     // Make blocks to include the scheduled call
//     await polkadot.api.rpc('dev_newBlock', { count: 1 });

//     console.log('Treasury balance after:');
//     console.log((await polkadot.api.query.system.account('13UVJyLnbVp9RBZYFwFGyDvVd1y27Tt8tkntv6Q7JVPhFsTB')).data.toString());

//     const events = await polkadot.api.query.system.events();
//       console.log(`Events after spend block:`);
//       events.forEach(event => {
//         console.log('Event:', event.event.method, event.event.section);
//         console.log('Data:', JSON.stringify(event.event.data, null, 2));
//       });
// }

async function spend_kusama(): Promise<void> {
    const {kusama} = await setupNetworks({
        kusama: {
            endpoint: 'wss://ksm-rpc.stakeworld.io',
            port: 8008,
        },
    });

    const number = (await kusama.api.rpc.chain.getHeader()).number.toNumber()
    console.log('latest block number', number);
    console.log('POT balance before:');
    console.log((await kusama.api.query.system.account('HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F')).data.toString());

    await kusama.api.rpc('dev_setStorage', {
        scheduler: {
            agenda: [
                [
                    [number + 1], [{
                        call: {
                            // works and emits events
                            Inline: "0x12030f00101336ed590f00d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d",
                        },
                        origin: {
                            System: 'Root'
                        }
                    }]
                ]
            ]
        }
    });

    // Make blocks to include the scheduled call
    await kusama.api.rpc('dev_newBlock', { count: 2 });

    console.log('POT balance after:');
    console.log((await kusama.api.query.system.account('HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F')).data.toString());

    const events = await kusama.api.query.system.events();
      console.log(`Events after spend block:`);
      events.forEach(event => {
        console.log('Event:', event.event.method, event.event.section);
        console.log('Data:', JSON.stringify(event.event.data, null, 2));
      });
}

const getInitStorages = () => ({
    System: {
      account: [
        [[POT_ACCOUNT], { providers: 1, data: { free: 1000e10 } }],
      ],
    },
    Assets: {
      account: [
        // maybe supply is missing
        [[1984, POT_ACCOUNT], { balance: 1000e6 }], // USDT
      ],
    },
    // ForeignAssets: {
    //   account: [
    //     [[config.eth, defaultAccounts.alice.address], { balance: 10n ** 18n }], // 1 ETH
    //     [[config.eth, '13cKp89Msu7M2PiaCuuGr1BzAsD5V3vaVbDMs3YtjMZHdGwR'], { balance: 10n ** 20n }], // 100 ETH for Sibling 2000
    //   ],
    // },
  })
