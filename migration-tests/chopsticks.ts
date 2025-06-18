import '@polkadot/api-augment';
import '@polkadot/types-augment';
import { ApiPromise } from '@polkadot/api';
import { setupNetworks } from '@acala-network/chopsticks-testing'

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

const POT_ACCOUNT = '5EYCAe5ijiYfyeZ2JJCGq56LmPyNRAKzpG4QkoQkkQNB5e6Z';

export async function treasury_spend(ah_api_after: ApiPromise): Promise<void> {
    
    // _NOTE_:uncomment if you want to test kusama
    // await spend_kusama();
    

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
                                // Treasury.spendLocal(12, Alice)
                                Inline: "0x5e030b00c0bcf7e90a00d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d", 
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
      events.forEach(event => {
        console.log('Event:', event.event.method, event.event.section);
        console.log('Data:', event.event.data.toHuman());
      });

      console.log('POT balance after:');
      console.log((await apiAt.query.system.account(POT_ACCOUNT)).data.toString());
    }
}


// DO NOT REVIEW THIS FUNCTIONS

async function spend_kusama(): Promise<void> {
    const {kusama} = await setupNetworks({
        kusama: {
            endpoint: 'wss://ksm-rpc.stakeworld.io',
            port: 8008,
        },
    });

    const number = (await kusama.api.rpc.chain.getHeader()).number.toNumber()
    console.log('latest block number', number);

    await kusama.api.rpc('dev_setStorage', {
        scheduler: {
            agenda: [
                [
                    [number + 1], [{
                        call: {
                            // works and emits events
                            Inline: "0x00090000000000000000000000000000000000000000000000000000000000000000",  // authorize upgrated
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
    await kusama.api.rpc('dev_newBlock', { count: 3 });
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
