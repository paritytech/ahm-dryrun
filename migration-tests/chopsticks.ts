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

export async function treasury_spend(ah_api_after: ApiPromise): Promise<void> {
    
    // _NOTE_:uncomment if you want to test kusama
    // await spend_kusama();
    

    const {assetHub} = await setupNetworks({
        assetHub: {
            endpoint: 'wss://westend-asset-hub-rpc.polkadot.io',
            port: 8008,
        },
    });

    const number = (await assetHub.api.rpc.chain.getHeader()).number.toNumber()
    console.log('latest block number', number);

    await assetHub.api.rpc('dev_setStorage', {
        scheduler: {
            agenda: [
                [
                    [number + 1], [{
                        call: {
                            Inline: "0x0a08001cbd2d43530a44705ad088af313e18f80b53ef16b36177cd4b77b846f2a5f07cfed05a02",  // balances.forceSetBalance(Ferdie, 987654321)
                        },
                        origin: {
                            System: 'Root'
                        }
                    }]
                ]
            ]
        }
    });

    // Just in case two extra blocks.
    await assetHub.api.rpc('dev_newBlock', { count: 3 });

    // Check events
    const events = await assetHub.api.query.system.events();
    console.log('events: ', events.toHuman());
}

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
