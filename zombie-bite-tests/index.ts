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

config()
const RC_WS_URL = process.env.ZOMBIE_BITE_RC_ENDPOINT || "ws://localhost:9977";
const client = createClient(
  withPolkadotSdkCompat(getWsProvider(RC_WS_URL)),
);
const RCApi = client.getTypedApi(polkadot_rc);

const dest = XcmVersionedLocation.V4({
  parents: 1,
  interior: XcmV3Junctions.X1(XcmV3Junction.Parachain(1000)),
});

const message = XcmVersionedXcm.V4([
  XcmV4Instruction.UnpaidExecution({
    weight_limit: XcmV3WeightLimit.Unlimited(),
    check_origin: undefined,
  }),
  XcmV4Instruction.Transact({
    origin_kind: XcmV2OriginKind.Superuser(),
    require_weight_at_most: {
      ref_time: 999999999n,
      proof_size: 7777777n,
    },
    call: Binary.fromHex(
      "0x00090b4504a75e80db9cc956610c2a7ca5689df83a15a5311a1d62e4e3bf7bd2825c",
    ),
  }),
]);

const xcmCall = RCApi.tx.XcmPallet.send({
  dest: dest,
  message: message,
});

const sudoCall = RCApi.tx.Sudo.sudo({
  call: xcmCall.decodedCall,
});

const hash = await sudoCall.signAndSubmit(aliceSigner);

console.log(`Transaction sent! Hash: ${hash}`);
