import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { promises as fs_promises } from "fs";
import { logger } from "../shared/logger.js";

const rcPort = process.env.ZOMBIE_BITE_ALICE_PORT || 63168;
const ahPort = process.env.ZOMBIE_BITE_AH_PORT || 63170;

let finalization = false;
let mock_finish_flag = false;

interface At {
  at: number
};

interface After {
  after: number
};

type DispatchTime = At | After;

export interface scheduleMigrationArgs {
  rc_port?: number|string,
  rc_block_start?: DispatchTime
  cool_off_end?: DispatchTime
  warm_up_end?: DispatchTime
  ignore_staking_check?: boolean,
  finalization?: boolean,
};

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

export async function delay(ms: number) {
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
  if(is_mocked) {
    logger.debug('Mock finish enabled, waiting', { delay_ms });
    await delay(delay_ms);
  }
}

function migration_done(stage: any) {
  return JSON.stringify(stage) == '"MigrationDone"';
}

export function isAccountsMigrationInit(stage: any): boolean {
  return JSON.stringify(stage) === '"AccountsMigrationInit"';
}

export function isDataMigrationOngoing(stage: any): boolean {
  return JSON.stringify(stage) === '"DataMigrationOngoing"';
}

export function isCoolOff(stage: any): boolean {
  const stageStr = JSON.stringify(stage);
  return stageStr && stageStr.includes('"CoolOff"');
}
async function rc_check(uri: string) {
  return new Promise(async (resolve) => {
    logger.info('Checking RC migration status', { uri });
    const api = await connect(uri);
    // blocks that could be not in the db from the 'bitting' process
    let bootstraping_blocks = 3;

    // Subscribe to finalized block headers
    const unsub = await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
      logger.debug(`RC Finalized Block #${header.number}: ${header.hash}`);

      try {
        const apiAt = await api.at(header.hash);
        // if we already have a block to check set bootstraping complete
        bootstraping_blocks = 0;

        let raw = await apiAt.query.rcMigrator.rcMigrationStage();
        let stage = raw.toHuman();

        const finished = migration_done(stage) || mock_finish_flag;
        if (finished) {
          const number = header.number;
          logger.info('RC migration finished', { blockNumber: number.toNumber() });
          await finish(unsub, api);
          return resolve(number);
        } else {
          logger.debug('RC migration in progress', { stage });
        }
      } catch(e) {
        if(bootstraping_blocks <= 0) throw e;
        bootstraping_blocks -= 1;
      };
    });
  });
}

async function ah_check(uri: string) {
  return new Promise(async (resolve) => {
    logger.info('Checking AH migration status', { uri });
    const api = await connect(uri);
    // blocks that could be not in the db from the 'bitting' process
    let bootstraping_blocks = 3;

    // Subscribe to finalized block headers
    const unsub = await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
      logger.debug(`AH Finalized Block #${header.number}: ${header.hash}`);

      try {
        const apiAt = await api.at(header.hash);
        // if we already have a block to check set bootstraping complete
        bootstraping_blocks = 0;

        let raw = await apiAt.query.ahMigrator.ahMigrationStage();
        let stage = raw.toHuman();

        const finished = migration_done(stage) || mock_finish_flag;
        if (finished) {
          const number = header.number;
          logger.info('AH migration finished', { blockNumber: number.toNumber() });
          await finish(unsub, api);
          return resolve(number);
        } else {
          logger.debug('AH migration in progress', { stage });
        }
      } catch(e) {
        if(bootstraping_blocks <= 0) throw e;
        bootstraping_blocks -= 1;
      };
    });
  });
}

export interface ScheduleMigrationStatus {
  success: boolean,
  errorName?: string
}

export async function waitForEvent(eventSubstring: string, rc_port?:number): Promise<boolean> {
  logger.debug('args', rc_port, eventSubstring);
  const rc_uri = `ws://localhost:${rc_port || rcPort}`;
  const api = await connect(rc_uri);

  const found = await new Promise((resolve) => {
    api.query.system.events((events: any) => {
      let eventString = "";
      const matchedEvent = events.find((record: any) => {
        eventString = "";
        // extract the phase, event and the event types
        const { event, phase } = record;
        const types = event.typeDef;
        eventString += `${event.section} : ${
          event.method
        } :: phase=${phase.toString()}\n`;
        eventString += event.meta.docs.toString();
        // loop through each of the parameters, displaying the type and data
        event.data.forEach((data: any, index: any) => {
          eventString += `${types[index].type};${data.toString()}`;
        });
        logger.debug("eventString", eventString);
        return eventString.includes(eventString);
      });

      if (matchedEvent) {
        logger.debug("mached event string", eventString);
        return resolve(true);
      }
    });
  });
  return !!found;
}

export async function checkScheduleMigrationCallStatus(atBlock: string, status: ScheduleMigrationStatus, rc_port?: number): Promise<boolean> {
  logger.debug('args', rc_port, atBlock);
  const rc_uri = `ws://localhost:${rc_port || rcPort}`;
  const api = await connect(rc_uri);

  const block = await api.derive.chain.getBlock(atBlock);

  let scheduleMigrationCall = block.extrinsics.find(({ dispatchError, dispatchInfo, events, extrinsic }) =>
    extrinsic.method.section == "rcMigrator" && extrinsic.method.method == "scheduleMigration"
  );

  if(!scheduleMigrationCall) throw new Error("Can't find scheduleMigration Call");

  // expect no error
  if(status.success) {
    logger.debug("scheduleMigration dispatched ok");
    return scheduleMigrationCall.dispatchError ? false : true;
  } else {
    // ensure the tx fails
    if(!scheduleMigrationCall.dispatchError) {
      logger.debug("scheduleMigration dispatched ok, but error was expected");
      return false;
    }
    // check the error if passed
    if(status.errorName) {
      let errorfinded;
      // decode the error
      if (scheduleMigrationCall?.dispatchError.isModule) {
        const decoded = api.registry.findMetaError(scheduleMigrationCall?.dispatchError.asModule);
        errorfinded = status.errorName == decoded.name;
      } else {
        // Other, CannotLookup,
        errorfinded = scheduleMigrationCall?.dispatchError.toString().includes(status.errorName);
      }
      logger.debug(`scheduleMigration generate an error as expected, errorName: '${status.errorName}' matched: ${errorfinded}`);
      return errorfinded;
    } else {
      // tx fail and not error was provided
      logger.debug("scheduleMigration generate an error as expected");
      return true;
    }
  }
}

export async function scheduleMigration(migration_args?: scheduleMigrationArgs) {
  logger.info('migration_args', migration_args);
  const rc_uri = `ws://localhost:${migration_args && migration_args.rc_port || rcPort}`;
  await cryptoWaitReady();

  const keyring = new Keyring({ type: "sr25519" });
  const alice = keyring.addFromUri("//Alice");

  const api = await connect(rc_uri);
  // @ts-ignore
  let nonce = (await api.query.system.account(alice.address)).nonce.toNumber();

  // check start and cool_off_end
  const start = migration_args && migration_args.rc_block_start || { after: 1 };
  const warm_up_end = migration_args && migration_args.warm_up_end || { after: 1 };
  const cool_off_end = migration_args && migration_args.cool_off_end || { after: 2 };
  const ignore_staking_check = (migration_args && migration_args.ignore_staking_check == false) ? false : true;

  finalization = migration_args && migration_args.finalization ? true : false;

  logger.info('Scheduling migration', { start, warm_up_end, cool_off_end,ignore_staking_check, nonce, finalization });

  return new Promise(async (resolve, reject) => {
    const unsub: any = await api.tx.rcMigrator.scheduleMigration(start, warm_up_end, cool_off_end, ignore_staking_check)
      .signAndSend(alice, { nonce: nonce, era: 0 }, (result) => {
        logger.info('Migration transaction status', { status: result.status.toString() });

        if (result.status.isInBlock) {
          const blockHash = result.status.asInBlock.toString();
          logger.info('Transaction included in block', {
            blockHash
          });
          if (finalization) {
            logger.info('Waiting for finalization...');
          } else {
            finish(unsub, api);
            return resolve(blockHash);
          }
        } else if (result.status.isFinalized) {
          const blockHash = result.status.asFinalized.toString()
          logger.info('Transaction finalized', {
            blockHash
          });
          finish(unsub, api);
          return resolve(blockHash);
        } else if (result.isError) {
          logger.error('Transaction error', { error: result.toHuman() });
          finish(unsub, api);
          return reject()
        }
      });
  });
}
