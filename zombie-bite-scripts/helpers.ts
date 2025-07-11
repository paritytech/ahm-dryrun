import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { promises as fs_promises } from "fs";

const rcPort = process.env.ZOMBIE_BITE_RC_PORT || 63168;
const ahPort = process.env.ZOMBIE_BITE_AH_PORT || 63170;
const finalization = false;
let mock_finish_flag = false;

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

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function monitMigrationFinish(
  base_path?: string,
  rc_port?: string | number,
  ah_port?: string | number,
) {
  const base_path_to_use = base_path || ".";
  const rc_uri = `ws://localhost:${rc_port || rcPort}`;
  const ah_uri = `ws://localhost:${ah_port || ahPort}`;

  let r = await Promise.all([
    rc_check(rc_uri),
    ah_check(ah_uri),
    mock_finish(20 * 1000, !!process.env.ZOMBIE_BITE_AHM_MOCKED),
  ]);

  const content = {
    rc_finish_block: r[0],
    ah_finish_block: r[1],
  };

  await fs_promises.writeFile(
    `${base_path_to_use}/migration_done.json`,
    JSON.stringify(content),
  );
  return content;
}

async function mock_finish(delay_ms: number, is_mocked: boolean) {
  mock_finish_flag = is_mocked;
  if(is_mocked) await delay(delay_ms);
}

async function rc_check(uri: string) {
  return new Promise(async (resolve) => {
    console.log(`checking rc at uri: ${uri}`);
    const api = await connect(uri);
    const unsub = await api.query.rcMigrator.rcMigrationStage(
      async (raw: any) => {
        let stage = raw.toHuman();
        const finished =
          Object.keys(stage)[0] == "MigrationDone" || mock_finish_flag;
        if (finished) {
          // Retrieve the latest header
          const lastHeader = await api.rpc.chain.getHeader();
          const number = lastHeader.number;
          console.debug(`[RC] Migration finished at block #${number}`);
          await finish(unsub, api);
          return resolve(number);
        } else {
          console.debug(`[RC] Migration in stage ${JSON.stringify(stage)}, keep waiting`);
        }
      },
    );
  });
}

async function ah_check(uri: string) {
  return new Promise(async (resolve) => {
    console.log(`checking ah at uri: ${uri}`);
    const api = await connect(uri);
    const unsub = await api.query.ahMigrator.ahMigrationStage(
      async (raw: any) => {
        let stage = raw.toHuman();
        const finished =
          Object.keys(stage)[0] == "MigrationDone" || mock_finish_flag;
        if (finished) {
          // Retrieve the latest header
          const lastHeader = await api.rpc.chain.getHeader();
          const number = lastHeader.number;
          console.debug(`[AH] Migration finished at block #${number}`);
          await finish(unsub, api);
          return resolve(number);
        } else {
          console.debug(`[AH] Migration in stage ${JSON.stringify(stage)}, keep waiting`);
        }
      },
    );
  });
}

export async function scheduleMigration(rc_port?: number) {
  const rc_uri = `ws://localhost:${rc_port || rcPort}`;
  await cryptoWaitReady();

  const keyring = new Keyring({ type: "sr25519" });
  const alice = keyring.addFromUri("//Alice");

  const api = await connect(rc_uri);
  // @ts-ignore
  let nonce = (await api.query.system.account(alice.address)).nonce.toNumber();

  return new Promise(async (resolve, reject) => {
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
            return resolve(true);
          }
        } else if (result.status.isFinalized) {
          console.log(
            `Transaction finalized at blockHash ${result.status.asFinalized}`,
          );
          finish(unsub, api);
          return resolve(true);
        } else if (result.isError) {
          console.log(`Transaction error`);
          finish(unsub, api);
          return reject()
        }
      });
  });
}
