/*
* Script runs right after ah_migrator.startMigration call
* First thing:
*   - preprocessing:
*       - read all the accounts and create a reversed map {account_hex: number}
*       - store accounts len
*   - then run full script with:
*       1. reading paginated accounts and add logging to it (to a file?)
*       2. every 20 seconds reading rcMigrator.MigrationOngoing{account}
*       3. prints curMigrationPos = reversed_map[account]/accounts.len
*       4. makes sure that ^ is growing: e.g. prevPos = -1, compare curMigrationPos=() and prevPos, then swap
*
*
* The script can be executed right after the migration starts. it takes around an hour to fetch all the account key.
* Meanwhile update AH runtime and then call `sudo rcMigrator.startMigration.After(1)`
*
* The script might run in a background and output the logs to a file.
*
* */
// TODO: add rc_port to.env and move to  config

import { ApiPromise, WsProvider } from '@polkadot/api';
import type { StorageKey } from '@polkadot/types';
import type { AccountInfo } from '@polkadot/types/interfaces';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import { config } from "dotenv";
import {
    rc_migrator_network,
} from "@polkadot-api/descriptors";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";

config();

const CACHE_FILE = 'reversedMap.json';
const rcPort = 57813;
const WS_URL = `ws://localhost:${rcPort}`;

async function main() {
    const wsProvider = new WsProvider(WS_URL);
    const api = await ApiPromise.create({ provider: wsProvider });

    const reversedMap = await fetchAndCacheAccounts(api);
    await api.disconnect();

    await monitorProgress(reversedMap);
}

async function fetchAndCacheAccounts(api: ApiPromise): Promise<Record<string, number>> {
    let totalFetched = 0;
    const reversedMap: Record<string, number> = {};
    const pageSize = 1000;
    let startKey: string | undefined = undefined;
    let page = 0;
    let totalElapsed = 0;

    console.time('Total fetching time');
    while (true) {
        const pageStart = performance.now();
        const entries: Array<[StorageKey, AccountInfo]> = await api.query.system.account.entriesPaged({
            args: [],
            pageSize,
            startKey,
        });
        const pageEnd = performance.now();
        const pageDuration = pageEnd - pageStart;
        totalElapsed += pageDuration;

        console.log(`Page ${page} took ${pageDuration.toFixed(2)} ms`);
        if (entries.length === 0) break;

        for (const [storageKey] of entries) {
            const hexKey = storageKey.toHex();
            reversedMap[hexKey] = totalFetched++;
        }

        startKey = entries[entries.length - 1][0].toHex();
        const totalMinutes = Math.floor(totalElapsed / 60000);
        const totalSeconds = ((totalElapsed % 60000) / 1000).toFixed(1);
        console.log(`Fetched ${entries.length} accounts on page ${page}\nTotal accounts: ${totalFetched}\nTotal time: ${totalMinutes} minutes and ${totalSeconds} seconds`);

        page++;
    }
    console.timeEnd('Total fetching time');
    console.log(`Finished fetching. Total accounts fetched: ${totalFetched}`);

    fs.writeFileSync(CACHE_FILE, JSON.stringify(reversedMap, null, 2));
    console.log(`Saved reversedMap to ${CACHE_FILE}`);

    return reversedMap;
}

async function monitorProgress(reversedMap: Record<string, number>) {
    const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
    const RCApi = client.getTypedApi(rc_migrator_network);

    let lastKeyPosition = -1;
    while (true) {
        const rcMigrationStage = await RCApi.query.RcMigrator.RcMigrationStage.getValue();
        if (
            rcMigrationStage &&
            rcMigrationStage.type === 'AccountsMigrationOngoing' &&
            rcMigrationStage.value &&
            'last_key' in rcMigrationStage.value
        ) {
            const lastKey = rcMigrationStage.value.last_key;
            console.log('last key', lastKey);
            if (lastKey) {
                // ensure reversedMap works properly and position only grows
                const position = reversedMap[lastKey];
                if (position === undefined) {
                    console.warn(`${lastKey} is not present in reversedMap`);
                } else if (lastKeyPosition > position) {
                    console.warn(`bad key transition: lastKeyPosition > position: ${lastKeyPosition} > ${position}`);
                } else {
                    console.log(`successful key transition: ${position}`);

                    const progress = position / reversedMap.length * 100;
                    console.log(`account migration progress:  ${progress.toFixed(3)}%`);
                    lastKeyPosition = position;
                }
            }
        } else {
            console.log(`last_key is missing in the stage: ${JSON.stringify(rcMigrationStage)}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 20000));
    }
}


main().catch(console.error);



// import { ApiPromise, WsProvider } from '@polkadot/api';
// import type { StorageKey } from '@polkadot/types';
// import type { AccountInfo } from '@polkadot/types/interfaces';
// import { performance } from 'perf_hooks'; // only needed in Node.js
// import * as fs from 'fs';
//
// const CACHE_FILE = 'reversedMap.json';
//
// async function main() {
//     // const wsProvider = new WsProvider('wss://rpc.polkadot.io');
//     const wsProvider = new WsProvider('ws://localhost:57813');
//     const api = await ApiPromise.create({ provider: wsProvider });
//
//     let totalFetched = 0;
//     const reversedMap: Record<string, number> = {};
//
//     const pageSize = 1000;
//     let startKey: string | undefined = undefined;
//
//     console.time('Total fetching time');
//
//     let page = 0;
//     let totalElapsed = 0;
//
//     while (true) {
//         const pageStart = performance.now();
//
//         const entries: Array<[StorageKey, AccountInfo]> =
//             await api.query.system.account.entriesPaged({
//                 args: [],
//                 pageSize,
//                 startKey,
//             });
//
//         const pageEnd = performance.now();
//         const pageDuration = pageEnd - pageStart;
//         totalElapsed += pageDuration;
//
//         console.log(`Page ${page} took ${pageDuration.toFixed(2)} ms`);
//
//         if (entries.length === 0) break;
//
//         for (const [storageKey] of entries) {
//             const hexKey = storageKey.toHex();
//             reversedMap[hexKey] = totalFetched++;
//         }
//
//         startKey = entries[entries.length - 1][0].toHex();
//         console.log(`Fetched ${entries.length} accounts on page ${page}\nTotal accounts: ${totalFetched}\nTotal time: ${totalElapsed.toFixed(2)} ms`);
//
//         page++;
//     }
//
//     console.timeEnd('Total fetching time');
//     fs.writeFileSync(CACHE_FILE, JSON.stringify(reversedMap, null, 2));
//     console.log(`Saved reversedMap to ${CACHE_FILE}`);
//     // console.log(`Total page fetch time accumulated: ${totalElapsed.toFixed(2)} ms`);
//     console.log(`Finished fetching. Total accounts fetched: ${totalFetched}`);
//
//     await api.disconnect();
//
//
// }
//
// main().catch(console.error);
//
// // monitor the progress
//
// import { config } from "dotenv";
// import {
//     rc_migrator_network,
// } from "@polkadot-api/descriptors";
//
// import { createClient } from "polkadot-api";
// import { getWsProvider } from "polkadot-api/ws-provider/web";
// import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
//
//
// config();
//
// const rcPort = /* process.env.ZOMBIE_BITE_RC_PORT || */ 57813;
// const RC_WS_URL = `ws://localhost:${rcPort}`;
// const client = createClient(withPolkadotSdkCompat(getWsProvider(RC_WS_URL)));
// const RCApi = client.getTypedApi(rc_migrator_network);
//
// let lastKeyPosition = -1;
// while (true) {
//     const rcMigrationStage = await RCApi.query.RcMigrator.RcMigrationStage.getValue();
//     if (
//         rcMigrationStage &&
//         rcMigrationStage.type === 'AccountsMigrationOngoing' &&
//         rcMigrationStage.value &&
//         'last_key' in rcMigrationStage.value
//     ) {
//         const lastKey = rcMigrationStage.value.last_key;
//         console.log('last key', lastKey);
//         if (lastKey) {
//             // ensure the order in reversedMap
//             const position = reversedMap[lastKey];
//             if (!position) {
//                 console.log(`${lastKey} is not present in reversedMap`);
//             }
//             if (lastKeyPosition > position) {
//                 console.log(`bad key transition: lastKeyPosition > position: ${lastKeyPosition} > ${position}`);
//             } else {
//                 console.log(`successfull key transition: ${position}`);
//                 lastKeyPosition = position;
//             }
//         }
//     } else {
//         console.log(`last_key is missing in the stage: ${rcMigrationStage}`);
//     }
//
//
//
//     // Wait 20 seconds before the next poll
//     await new Promise((resolve) => setTimeout(resolve, 20000));
// }






// === leftovers ====

// const cl = createClient(withPolkadotSdkCompat(getWsProvider(RC_WS_URL)));
// cl.getUnsafeApi


// fetch the accounts
// https://github.com/AcalaNetwork/chopsticks/issues/896#issuecomment-2759885250
// let startKey = '0x'
// while (true) {
//     const sysEntries = await RCApi.query.System.Account.getEntries() //entriesPaged({ pageSize: 1000, args: [], startKey })
//     for (const [k] of sysEntries) {
//         console.log("key: ", k.toHuman())
//         startKey = k.toHex()
//     }
//     if (sysEntries.length < 1000) {
//         break
//     }
// }




// const authorizeCall = RCApi.tx.System.authorize_upgrade({
//     code_hash: Binary.fromHex(wasmHash),
// });
// const authorizeCallHexData = (await authorizeCall.getEncodedData()).asHex();
//
// const message = XcmVersionedXcm.V4([
//     XcmV4Instruction.UnpaidExecution({
//         weight_limit: XcmV3WeightLimit.Unlimited(),
//         check_origin: undefined,
//     }),
//     XcmV4Instruction.Transact({
//         origin_kind: XcmV2OriginKind.Superuser(),
//         require_weight_at_most: {
//             ref_time: 800000000n,
//             proof_size: 9999n,
//         },
//         call: Binary.fromHex(authorizeCallHexData),
//     }),
// ]);
//
// const dest = XcmVersionedLocation.V4({
//     parents: 0,
//     interior: XcmV3Junctions.X1(XcmV3Junction.Parachain(1000)),
// });
//
// const xcmCall = RCApi.tx.XcmPallet.send({
//     dest: dest,
//     message: message,
// });
//
// const sudoCall = RCApi.tx.Sudo.sudo({
//     call: xcmCall.decodedCall,
// });
//
// const hash = await sudoCall.signAndSubmit(aliceSigner);
// console.log(`Transaction sent! Hash: ${hash}`);
