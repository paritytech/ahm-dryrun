// import { test, expect } from "bun:test";
//
// import { polkadot_rc } from "@polkadot-api/descriptors";
//
// import { Binary, Enum, createClient } from "polkadot-api";
// import { getWsProvider } from "polkadot-api/ws-provider/web";
// import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
//
// import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
//
//
// const client = createClient(withPolkadotSdkCompat(getWsProvider("ws://localhost:59015")));
// const RCApi = client.getTypedApi(polkadot_rc);
//



import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
    DEV_PHRASE,
    entropyToMiniSecret,
    mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";

import { getPolkadotSigner } from "polkadot-api/signer";
//
//
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

import { polkadot_rc, XcmV4Instruction, XcmV3WeightLimit } from "@polkadot-api/descriptors";

import { Binary, Enum, createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";

import { ApiPromise, WsProvider, Keyring }  from '@polkadot/api'

const client = createClient(withPolkadotSdkCompat(getWsProvider("ws://localhost:54568")));
const RCApi = client.getTypedApi(polkadot_rc);

const provider = new WsProvider('ws://127.0.0.1:54568');
const api = await ApiPromise.create({ provider });

const keyring = new Keyring({ type: 'sr25519' });
const alice = keyring.addFromUri('//Alice');

console.log(`Alice's Address: ${alice.address}`);

const balance = await api.query.system.account(alice.address);
console.log(`Alice's Balance: ${balance}`);


// const msg = Enum("V4", [XcmV4Instruction.ClearOrigin()]);
const msg = Enum("V4", [XcmV4Instruction.UnpaidExecution({
    weight_limit: XcmV3WeightLimit.Unlimited(),
})]);
const res = await RCApi.tx.XcmPallet.execute({
    message: msg,
    max_weight: {ref_time: 999999999n, proof_size: 7777777n },
}).signAndSubmit(aliceSigner);

console.log("res is ", res);

// const res = await RCApi.tx.xcmPallet.send({parents: 1, interior: XcmV3Junctions.X1(XcmV3Junction.Parachain(1000))}, {V4: [ {
//         SetFeesMode: {
//             jit_withdraw: true,
//         },
//     } ]}).signAndSubmit(aliceSigner);