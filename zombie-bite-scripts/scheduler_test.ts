import { cryptoWaitReady } from "@polkadot/util-crypto";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";

const finalization = false;

export async function scheduleMigration(rc_port?: number) {
    const rc_uri = `ws://localhost:${rc_port || 63168}`;
    await cryptoWaitReady();
    console.log("cryptoWaitReady");
  
    const keyring = new Keyring({ type: "sr25519" });
    const alice = keyring.addFromUri("//Alice");
    console.log("keyring alice");
  
    const api = await connect(rc_uri);
    console.log("api");
    // @ts-ignore
    let nonce = (await api.query.system.account(alice.address)).nonce.toNumber();
    console.log("nonce");
    const unsub: any = await api.tx.sudo
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
          return finish(unsub, api);
        } else if (result.isError) {
          console.log(`Transaction error`);
          return finish(unsub, api);
        }
      });
  }

  async function connect(apiUrl: string, types = {}) {
    const provider = new WsProvider(apiUrl);
    const api = new ApiPromise({ provider, types });
    await api.isReady;
    return api;
  }
  async function finish(unsub: any, api: any) {
    unsub();
    api.disconnect();
  }

  async function main() {
    await scheduleMigration(63168);
  }

  main().catch(console.log);