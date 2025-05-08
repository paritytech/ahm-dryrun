import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";
import { blake2AsHex, cryptoWaitReady } from "@polkadot/util-crypto";

const rcPort = process.env.ZOMBIE_BITE_RC_PORT || 9977;
const RC_WS_URL = `ws://localhost:${rcPort}`;
const finalization = false;

async function connect(apiUrl, types = {}) {
    const provider = new WsProvider(apiUrl);
    const api = new ApiPromise({ provider, types });
    await api.isReady;
    return api;
}

function finish(unsub, api) {
    unsub();
    api.disconnect();
}

( async () => {
    await cryptoWaitReady();

    const keyring = new Keyring({ type: "sr25519" });
    const alice = keyring.addFromUri("//Alice");

    const api = await connect(RC_WS_URL);
    let nonce = (
        (await api.query.system.account(alice.address))
      ).nonce.toNumber();


    const unsub = await api.tx.sudo
      .sudo(api.tx.rcMigrator.scheduleMigration({ after: 1 }))
      .signAndSend(alice, { nonce: nonce, era: 0 }, (result) => {
        console.log(`Current status is ${result.status}`);
        if (result.status.isInBlock) {
          console.log(
            `Transaction included at blockhash ${result.status.asInBlock}`,
          );
          if (finalization) {
            console.log("Waiting for finalization...");
          } else {
            finish(unsub, api);
          }
        } else if (result.status.isFinalized) {
          console.log(
            `Transaction finalized at blockHash ${result.status.asFinalized}`,
          );
          finish(unsub, api);
        } else if (result.isError) {
          console.log(`Transaction error`);
          finish(unsub, api);
        }
      });
})();