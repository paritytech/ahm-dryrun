/*
 * Script runs right after starting the migration with rcMigrator pallet.
 * The script may run in the background and output the logs to a file.
 *
 * Script flow:
 *   - connects to zombie-bite RC which runs on port ${ZOMBIE_BITE_ALICE_PORT}
 *   - preprocessing:
 *       - reads all the accounts by batches of 1000
 *       - reports progress
 *       - creates a reversed map {account_hex: position}
 *       - saves this map to back-up file
 *   - every 20 seconds:
 *       - fetches account from rcMigrator pallet - AccountsMigrationOngoing{lastKey: account}
 *       - looks for account's position in the reversed map
 *       - makes sure that the position is growing (and reversed map is working)
 *       - calculates accounts migration progress and prints it.
 * */

import { ApiPromise, WsProvider } from "@polkadot/api";
import type { StorageKey } from "@polkadot/types";
import type { AccountInfo } from "@polkadot/types/interfaces";
import { performance } from "perf_hooks";
import * as fs from "fs";
import { config } from "dotenv";
import { logger } from "../shared/logger.js";
import {
  rc_migrator_network,
  TraitsScheduleDispatchTime,
} from "@polkadot-api/descriptors";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { decodeAddress, blake2AsU8a, xxhashAsU8a } from "@polkadot/util-crypto";
import { u8aConcat, u8aToHex } from "@polkadot/util";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { getPolkadotSigner } from "polkadot-api/signer";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";

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

const BACKUP_FILE = "reversedMap.json";
config();
const WS_URL = `ws://localhost:${process.env.ZOMBIE_BITE_ALICE_PORT}`;

async function main(run_schedule_migration:boolean = true) {
  const wsProvider = new WsProvider(WS_URL);
  const api = await ApiPromise.create({ provider: wsProvider });

  if(run_schedule_migration) await scheduleMigration();
  const reversedMap = await fetchAndCacheAccounts(api);
  await api.disconnect();

  await monitorProgress(reversedMap);
}

async function scheduleMigration() {
  const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
  const RCApi = client.getTypedApi(rc_migrator_network);
  const call = RCApi.tx.RcMigrator.schedule_migration({
    start_moment: TraitsScheduleDispatchTime.After(1),
  });

  const sudoCall = RCApi.tx.Sudo.sudo({ call: call.decodedCall });
  const result = await sudoCall.signAndSubmit(aliceSigner);

  logger.info('Migration scheduled', { result });
}

async function fetchAndCacheAccounts(
  api: ApiPromise,
): Promise<Record<string, number>> {
  let totalFetched = 0;
  const reversedMap: Record<string, number> = {};
  const pageSize = 1000;
  let startKey: string | undefined = undefined;
  let page = 0;
  let totalElapsed = 0;

  const startTime = performance.now();
  logger.info('Starting account fetching process');

  while (true) {
    const pageStart = performance.now();
    const entries = await api.query.system.account.entriesPaged({
        args: [],
        pageSize,
        startKey,
    }) as unknown as Array<[StorageKey, AccountInfo]>;
    const pageEnd = performance.now();
    const pageDuration = pageEnd - pageStart;
    totalElapsed += pageDuration;

    logger.debug(`Page ${page} took ${pageDuration.toFixed(2)} ms`);
    if (entries.length === 0) break;

    for (const [storageKey] of entries) {
      const hexKey = storageKey.toHex();
      reversedMap[hexKey] = totalFetched++;
    }

    startKey = entries[entries.length - 1][0].toHex();
    const totalMinutes = Math.floor(totalElapsed / 60000);
    const totalSeconds = ((totalElapsed % 60000) / 1000).toFixed(1);
    logger.info(
      `Fetched ${entries.length} accounts on page ${page}`,
      {
        totalAccounts: totalFetched,
        totalTime: `${totalMinutes} minutes and ${totalSeconds} seconds`
      }
    );

    page++;
  }

  const totalTime = performance.now() - startTime;
  logger.info('Finished fetching accounts', {
    totalAccounts: totalFetched,
    totalTimeMs: totalTime.toFixed(2)
  });

  fs.writeFileSync(BACKUP_FILE, JSON.stringify(reversedMap, null, 2));
  logger.info(`Saved reversedMap to ${BACKUP_FILE}`);

  return reversedMap;
}

async function monitorProgress(reversedMap: Record<string, number>) {
  const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
  const RCApi = client.getTypedApi(rc_migrator_network);

  let lastKeyPosition = -1;
  const delay_ms = 20000;

  while (true) {
    const rcMigrationStage =
      await RCApi.query.RcMigrator.RcMigrationStage.getValue();

    if (!isValidMigrationStage(rcMigrationStage)) {
      logger.warn(
        `last_key is missing in the stage`,
        { stage: JSON.stringify(rcMigrationStage) }
      );
      await delay(delay_ms);
      continue;
    }

    const lastKey = rcMigrationStage.value.last_key;
    if (!lastKey) {
      await delay(delay_ms);
      continue;
    }

    logger.debug(`Processing last key: ${lastKey}`);
    const storageKey = createStorageKeyFromSS58(lastKey);
    logger.debug(`Looking for storage key: ${storageKey}`);

    const position = reversedMap[storageKey];
    if (position === undefined) {
      logger.warn(`${storageKey} is not present in reversedMap`);
    } else if (lastKeyPosition > position) {
      logger.warn(
        `bad key transition: lastKeyPosition > position`,
        { lastKeyPosition, position }
      );
    } else {
      const totalAccounts = Object.keys(reversedMap).length;
      const progress = (position / totalAccounts) * 100;
      lastKeyPosition = position;
      logger.info(`Account migration progress`, {
        current: position,
        total: totalAccounts,
        progress: `${progress.toFixed(3)}%`
      });
    }

    await delay(delay_ms);
  }
}

function isValidMigrationStage(stage: any): stage is {
  type: "AccountsMigrationOngoing";
  value: { last_key: string };
} {
  return (
    stage &&
    stage.type === "AccountsMigrationOngoing" &&
    stage.value &&
    "last_key" in stage.value
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const system_account_prefix = u8aConcat(
  xxhashAsU8a("System", 128),
  xxhashAsU8a("Account", 128),
);
function createStorageKeyFromSS58(lastKey: string): string {
  const publicKey = decodeAddress(lastKey); // convert SS58 to raw public key
  const hash = blake2AsU8a(publicKey, 128);
  const key = u8aConcat(system_account_prefix, hash, publicKey);

  return u8aToHex(key);
}

const run_schedule_migration = process.argv[2] && process.argv[2] == 'no-schedule' ? false : true;
main(run_schedule_migration).catch((error) => {
  logger.error('Main function error', { error });
});
