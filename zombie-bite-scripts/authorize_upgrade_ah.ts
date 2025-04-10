import fs from "fs";
import { blake2AsHex } from "@polkadot/util-crypto";
import { config } from "dotenv";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";

import {
  polkadot_rc,
  XcmV4Instruction,
  XcmV3WeightLimit,
  XcmV3Junctions,
  XcmV3Junction,
  XcmVersionedLocation,
  XcmVersionedXcm,
  XcmV2OriginKind,
} from "@polkadot-api/descriptors";

import { getPolkadotSigner } from "polkadot-api/signer";
import { Binary, createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";

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

config();
const rcPort = process.env.ZOMBIE_BITE_RC_PORT || 9977;
const RC_WS_URL = `ws://localhost:${rcPort}`;
const client = createClient(withPolkadotSdkCompat(getWsProvider(RC_WS_URL)));
const RCApi = client.getTypedApi(polkadot_rc);

const wasmFilePath =
  "./runtime_wasm/asset_hub_polkadot_runtime.compact.compressed.wasm";
const wasmBuffer = fs.readFileSync(wasmFilePath);
const wasmHash = blake2AsHex(wasmBuffer);

const authorizeCall = RCApi.tx.System.authorize_upgrade({
  code_hash: Binary.fromHex(wasmHash),
});
const authorizeCallHexData = (await authorizeCall.getEncodedData()).asHex();

const message = XcmVersionedXcm.V4([
  XcmV4Instruction.UnpaidExecution({
    weight_limit: XcmV3WeightLimit.Unlimited(),
    check_origin: undefined,
  }),
  XcmV4Instruction.Transact({
    origin_kind: XcmV2OriginKind.Superuser(),
    require_weight_at_most: {
      ref_time: 800000000n,
      proof_size: 9999n,
    },
    call: Binary.fromHex(authorizeCallHexData),
  }),
]);

const dest = XcmVersionedLocation.V4({
  parents: 0,
  interior: XcmV3Junctions.X1(XcmV3Junction.Parachain(1000)),
});

const xcmCall = RCApi.tx.XcmPallet.send({
  dest: dest,
  message: message,
});

const sudoCall = RCApi.tx.Sudo.sudo({
  call: xcmCall.decodedCall,
});

const hash = await sudoCall.signAndSubmit(aliceSigner);
console.log(`Transaction sent! Hash: ${hash}`);
