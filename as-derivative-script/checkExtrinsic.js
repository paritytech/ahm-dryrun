const { ApiPromise, WsProvider } = require('@polkadot/api');
const { u8aConcat, stringToU8a } = require('@polkadot/util');
const { blake2AsU8a } = require('@polkadot/util-crypto');
const fs = require('fs');
const path = require('path');

// ——————————————————————————————————
//  CONFIGURATION
// ——————————————————————————————————
const DERIVATION_PREFIX = stringToU8a('modlpy/utilisuba');
const BATCH_SIZE        = parseInt(process.env.BATCH_SIZE || '20', 10);
const RPC_RETRY_LIMIT   = 3;
const RPC_RETRY_DELAY   = 500; // ms

// ——————————————————————————————————
//  HELPERS
// ——————————————————————————————————
function deriveAccountCorrect(api, signer, derivativeIndex) {
  const accountBytes = api.registry
    .createType('AccountId32', signer)
    .toU8a();
  const indexByte = new Uint8Array([derivativeIndex & 0xff]);
  const raw      = u8aConcat(DERIVATION_PREFIX, accountBytes, indexByte);
  const hash     = blake2AsU8a(raw, 256);
  return api.registry.createType('AccountId32', hash);
}

async function retry(fn, args = [], limit = RPC_RETRY_LIMIT) {
  let err;
  for (let i = 0; i < limit; i++) {
    try {
      return await fn(...args);
    } catch (e) {
      err = e;
      console.log(`⚠️  Retry ${i + 1}/${limit} after error: ${e.message}`);
      await new Promise(r => setTimeout(r, RPC_RETRY_DELAY * (i + 1)));
    }
  }
  throw err;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Counters for debug
let debugCounters = {
  totalExtrinsics: 0,
  utilityExtrinsics: 0,
  utilityMethods: {}
};

async function checkExtrinsicSuccess(api, blockHash, extrinsicIndex) {
  try {
    const events = await api.query.system.events.at(blockHash);
    
    const extrinsicEvents = events.filter(({ phase }) =>
      phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(extrinsicIndex)
    );
    
    // Check if there is a success or failure event
    for (const { event } of extrinsicEvents) {
      if (event.section === 'system') {
        if (event.method === 'ExtrinsicSuccess') {
          return { success: true, error: null };
        } else if (event.method === 'ExtrinsicFailed') {
          const errorInfo = event.data[0];
          return {
            success: false,
            error: errorInfo.isModule
              ? `${errorInfo.asModule.section}.${errorInfo.asModule.name}`
              : errorInfo.toString()
          };
        }
      }
    }
    
    return { success: true, error: null };
  } catch (error) {
    console.log(`   ⚠️  Could not check extrinsic success: ${error.message}`);
    return { success: null, error: 'unknown' };
  }
}

async function checkAsDerivative(callMethod, callArgs, api, blockNumber, extrinsicIndex, signer, writeDetail, counters, blockHash, depth = 0) {
  // Debug: count found methods by section
  if (depth === 0) {
    const sectionName = callMethod.section.toString();
    const methodName = callMethod.method.toString();
    if (!debugCounters.sectionMethods) debugCounters.sectionMethods = {};
    if (!debugCounters.sectionMethods[sectionName]) debugCounters.sectionMethods[sectionName] = {};
    debugCounters.sectionMethods[sectionName][methodName] = (debugCounters.sectionMethods[sectionName][methodName] || 0) + 1;
    
    if (sectionName === 'utility') {
      debugCounters.utilityMethods[methodName] = (debugCounters.utilityMethods[methodName] || 0) + 1;
    }
  }

  if (callMethod.section === 'utility' && callMethod.method === 'asDerivative') {
    const derivativeIndex = callArgs[0].toNumber();
    const innerCall      = callArgs[1];
    const derivedAccount = deriveAccountCorrect(api, signer, derivativeIndex).toString();

    let successInfo = { success: null, error: null };
    if (depth === 0) {
      successInfo = await checkExtrinsicSuccess(api, blockHash, extrinsicIndex);
    }

    counters.unique.add(derivedAccount);
    counters.total++;

    const successStatus = depth === 0
      ? (successInfo.success === true ? 'SUCCESS' : successInfo.success === false ? 'FAILED' : 'UNKNOWN')
      : 'NESTED';

    console.log(`   ✅ FOUND asDerivative #${counters.total}!`);
    console.log(`      Block: ${blockNumber}, Extrinsic: ${extrinsicIndex}`);
    console.log(`      Index: ${derivativeIndex}, Signer: ${signer.substring(0, 10)}...`);
    console.log(`      Derived: ${derivedAccount.substring(0, 10)}...`);
    console.log(`      Depth: ${depth}, Context: ${depth === 0 ? 'Direct' : 'Nested'}`);
    console.log(`      Status: ${successStatus}${successInfo.error ? ` (${successInfo.error})` : ''}`);

    writeDetail({
      block: blockNumber,
      extrinsicIndex,
      signer,
      derivativeIndex,
      derivedAccount,
      success: successInfo.success,
      error: successInfo.error
    });
    
    // Continue checking the inner call for nested asDerivative
    if (innerCall && innerCall.method) {
      await checkAsDerivative(
        innerCall.method,
        innerCall.args,
        api,
        blockNumber,
        extrinsicIndex,
        signer,
        writeDetail,
        counters,
        blockHash,
        depth + 1
      );
    }
    return;
  }

  // 2. Utility batch calls
  if (callMethod.section === 'utility' && ['batch', 'batchAll', 'forceBatch'].includes(callMethod.method)) {
    const callsVec = callArgs[0];
    const callsArr = typeof callsVec.toArray === 'function'
      ? callsVec.toArray()
      : Array.isArray(callsVec)
        ? callsVec
        : [];
    
    if (depth === 0 && callsArr.length > 0) {
      console.log(`   📦 Checking batch (${callMethod.method}) with ${callsArr.length} calls...`);
    }
    
    for (const nested of callsArr) {
      if (nested && nested.method) {
        await checkAsDerivative(
          nested.method,
          nested.args,
          api,
          blockNumber,
          extrinsicIndex,
          signer,
          writeDetail,
          counters,
          blockHash,
          depth + 1
        );
      }
    }
    return;
  }

  // 3. Proxy calls
  if (callMethod.section === 'proxy') {
    let realSigner = signer;
    let innerCall = null;
    
    if (depth === 0) {
      console.log(`   🔗 Checking proxy call (${callMethod.method})...`);
    }
    
    if (['proxy', 'proxyAnnounced'].includes(callMethod.method)) {
      // proxy(real, force_proxy_type, call) or proxyAnnounced(real, force_proxy_type, call, height)
      realSigner = callArgs[0].toString(); // The 'real' account being proxied
      const callIndex = callMethod.method === 'proxy' ? 2 : 2; // call is at index 2 for both
      innerCall = callArgs[callIndex];
    } else if (callMethod.method === 'anonymous') {
      // anonymous(proxy_type, delay, index) - creates anonymous proxy, no inner call
      return;
    } else if (callMethod.method === 'killAnonymous') {
      // killAnonymous(spawner, proxy_type, index, height, ext_index) - removes proxy, no inner call
      return;
    } else if (['removeProxy', 'removeProxies', 'addProxy', 'rejectAnnouncement', 'removeAnnouncement'].includes(callMethod.method)) {
      // These don't contain inner calls
      return;
    }
    
    if (innerCall && innerCall.method) {
      await checkAsDerivative(
        innerCall.method,
        innerCall.args,
        api,
        blockNumber,
        extrinsicIndex,
        realSigner, // Use the real account being proxied
        writeDetail,
        counters,
        blockHash,
        depth + 1
      );
    }
    return;
  }

  // 4. Multisig calls
  if (callMethod.section === 'multisig') {
    if (depth === 0) {
      console.log(`   👥 Checking multisig call (${callMethod.method})...`);
    }
    
    let innerCall = null;
    
    if (callMethod.method === 'asMulti') {
      // asMulti(threshold, other_signatories, maybe_timepoint, call, max_weight)
      innerCall = callArgs[3];
    } else if (callMethod.method === 'asMultiThreshold1') {
      // asMultiThreshold1(other_signatories, call)
      innerCall = callArgs[1];
    } else if (['approveAsMulti', 'cancelAsMulti'].includes(callMethod.method)) {
      // These might contain call hashes but not actual calls to check
      return;
    }
    
    if (innerCall && innerCall.method) {
      await checkAsDerivative(
        innerCall.method,
        innerCall.args,
        api,
        blockNumber,
        extrinsicIndex,
        signer, // Keep original signer for multisig
        writeDetail,
        counters,
        blockHash,
        depth + 1
      );
    }
    return;
  }

  // 5. Sudo calls
  if (callMethod.section === 'sudo') {
    if (depth === 0) {
      console.log(`   👑 Checking sudo call (${callMethod.method})...`);
    }
    
    let innerCall = null;
    
    if (['sudo', 'sudoUncheckedWeight'].includes(callMethod.method)) {
      // sudo(call) or sudoUncheckedWeight(call, weight)
      innerCall = callArgs[0];
    } else if (callMethod.method === 'sudoAs') {
      // sudoAs(who, call)
      innerCall = callArgs[1];
      // Note: we could also update signer to callArgs[0] (the 'who' account)
    }
    
    if (innerCall && innerCall.method) {
      await checkAsDerivative(
        innerCall.method,
        innerCall.args,
        api,
        blockNumber,
        extrinsicIndex,
        signer,
        writeDetail,
        counters,
        blockHash,
        depth + 1
      );
    }
    return;
  }

  // 6. Democracy calls that might contain proposals
  if (callMethod.section === 'democracy') {
    if (depth === 0) {
      console.log(`   🗳️  Checking democracy call (${callMethod.method})...`);
    }
    return;
  }

  // 7. Scheduler calls
  if (callMethod.section === 'scheduler') {
    if (depth === 0) {
      console.log(`   ⏰ Checking scheduler call (${callMethod.method})...`);
    }
    
    let innerCall = null;
    
    if (['schedule', 'scheduleNamed'].includes(callMethod.method)) {
      // schedule(when, maybe_periodic, priority, call) or scheduleNamed(id, when, maybe_periodic, priority, call)
      const callIndex = callMethod.method === 'schedule' ? 3 : 4;
      innerCall = callArgs[callIndex];
    } else if (['scheduleAfter', 'scheduleNamedAfter'].includes(callMethod.method)) {
      // scheduleAfter(after, maybe_periodic, priority, call) or scheduleNamedAfter(id, after, maybe_periodic, priority, call)
      const callIndex = callMethod.method === 'scheduleAfter' ? 3 : 4;
      innerCall = callArgs[callIndex];
    }
    
    if (innerCall && innerCall.method) {
      await checkAsDerivative(
        innerCall.method,
        innerCall.args,
        api,
        blockNumber,
        extrinsicIndex,
        signer,
        writeDetail,
        counters,
        blockHash,
        depth + 1
      );
    }
    return;
  }

  // 8. Preimage calls (used by governance)
  if (callMethod.section === 'preimage') {
    if (depth === 0) {
      console.log(`   🖼️  Checking preimage call (${callMethod.method})...`);
    }
    
    // Preimage calls store proposal data but don't execute them directly
    // The actual execution happens through governance mechanisms
    return;
  }
}

async function testUtilityPallet(api) {
  console.log('\nChecking available methods in Utility pallet...\n');
  
  try {
    if (api.tx.utility) {
      console.log('Available methods in utility (via api.tx):');
      const methods = Object.keys(api.tx.utility);
      methods.forEach(method => {
        console.log(`   - ${method}`);
      });
      
      if (!methods.includes('asDerivative')) {
        console.log('\n⚠️  WARNING: asDerivative not found in methods!');
        console.log('   Methods found:', methods.join(', '));
      } else {
        console.log('\n✅ asDerivative is available!');
      }
      
      return methods;
    }
    
    const metadata = await api.rpc.state.getMetadata();
    const modules = metadata.asLatest.pallets || metadata.asLatest.modules;
    
    const utilityPallet = modules.find(m => {
      const name = m.name ? m.name.toString() : '';
      return name === 'Utility';
    });
    
    if (utilityPallet) {
      console.log('✅ Utility pallet found in metadata');
      
      let callsData = null;
      if (utilityPallet.calls && utilityPallet.calls.isSome) {
        callsData = utilityPallet.calls.unwrap();
      } else if (utilityPallet.calls) {
        callsData = utilityPallet.calls;
      }
      
      if (callsData && callsData.length > 0) {
        console.log(`Found ${callsData.length} methods`);
      }
    }
    
    return [];
    
  } catch (error) {
    console.error('Error testing Utility pallet:', error.message);
    return [];
  }
}

async function debugBlock(api, blockNumber) {
  console.log(`\n🔍 DEBUG: Examining block ${blockNumber}...\n`);
  
  try {
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    const signedBlock = await api.rpc.chain.getBlock(blockHash);
    
    console.log(`Block ${blockNumber}: ${signedBlock.block.extrinsics.length} total extrinsics`);
    
    signedBlock.block.extrinsics.forEach((ex, idx) => {
      const { method, signer } = ex;
      console.log(`\nExtrinsic ${idx}:`);
      console.log(`  Section: ${method.section}`);
      console.log(`  Method: ${method.method}`);
      console.log(`  Signer: ${signer ? signer.toString().substring(0, 20) + '...' : 'None'}`);
      
      // Show details for relevant sections
      const relevantSections = ['utility', 'proxy', 'multisig', 'sudo', 'scheduler'];
      if (relevantSections.includes(method.section)) {
        console.log(`  ⭐ ${method.section.toUpperCase()} CALL FOUND!`);
        console.log(`  Args length: ${method.args.length}`);
        
        if (method.section === 'utility' && ['batch', 'batchAll', 'forceBatch'].includes(method.method) && method.args[0]) {
          const calls = method.args[0];
          const callsArray = Array.isArray(calls) ? calls :
                           (calls.toArray ? calls.toArray() : []);
          console.log(`  Batch contains ${callsArray.length} calls:`);
          callsArray.forEach((call, i) => {
            if (call && call.method) {
              console.log(`    ${i}: ${call.method.section}.${call.method.method}`);
            }
          });
        } else if (method.section === 'proxy' && ['proxy', 'proxyAnnounced'].includes(method.method)) {
          console.log(`  Proxy call - real account: ${method.args[0] ? method.args[0].toString().substring(0, 20) + '...' : 'Unknown'}`);
          const innerCall = method.args[2];
          if (innerCall && innerCall.method) {
            console.log(`  Inner call: ${innerCall.method.section}.${innerCall.method.method}`);
          }
        } else if (method.section === 'multisig' && ['asMulti', 'asMultiThreshold1'].includes(method.method)) {
          const callIndex = method.method === 'asMulti' ? 3 : 1;
          const innerCall = method.args[callIndex];
          if (innerCall && innerCall.method) {
            console.log(`  Inner call: ${innerCall.method.section}.${innerCall.method.method}`);
          }
        } else if (method.section === 'sudo' && ['sudo', 'sudoAs', 'sudoUncheckedWeight'].includes(method.method)) {
          const callIndex = method.method === 'sudoAs' ? 1 : 0;
          const innerCall = method.args[callIndex];
          if (innerCall && innerCall.method) {
            console.log(`  Inner call: ${innerCall.method.section}.${innerCall.method.method}`);
          }
        }
      }
    });
    
  } catch (error) {
    console.error(`Error debugging block ${blockNumber}:`, error.message);
  }
}

// ——————————————————————————————————
//  MAIN
// ——————————————————————————————————
async function main() {
  const wsEndpoint = process.env.RPC_WS || 'wss://asset-hub-paseo-rpc.n.dwellir.com';
  console.log(`🔌 Connecting to ${wsEndpoint}...`);
  
  const provider = new WsProvider(wsEndpoint);
  const api = await ApiPromise.create({ provider });

  // Info chain
  const chain = await api.rpc.system.chain();
  console.log(`✅ Connected to: ${chain}`);

  // First, check available methods
  const availableMethods = await testUtilityPallet(api);

  // Header and blocks
  const head = await retry(api.rpc.chain.getHeader.bind(api.rpc.chain), []);
  const latestNum = head.number.toNumber();
  
  const startBlock = parseInt(process.env.START_BLOCK || (latestNum - 1000), 10);
  const endBlock = parseInt(process.env.END_BLOCK || latestNum, 10);

  console.log(`\n🔢 Block range: ${startBlock} → ${endBlock} (${endBlock - startBlock + 1} blocks)`);
  console.log(`📦 Batch size: ${BATCH_SIZE}\n`);

  // If the range is small, enable detailed debug
  if (endBlock - startBlock < 10) {
    console.log('Small range detected, enabling detailed debug...');
    for (let b = startBlock; b <= endBlock; b++) {
      await debugBlock(api, b);
    }
  }

  const outDir = process.env.OUT_DIR || '.';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  const detailsPath = path.join(outDir, `derived_details_${timestamp}.csv`);
  const summaryPath = path.join(outDir, `derived_summary_${timestamp}.json`);
  
  // Create CSV file with header if it doesn't exist
  if (!fs.existsSync(detailsPath)) {
    fs.writeFileSync(detailsPath, 'block,extrinsicIndex,signer,derivativeIndex,derivedAccount,success\n');
  }

  const counters = { total: 0, unique: new Set(), duplicatesSkipped: 0 };
  const recordedCombinations = new Set();
  const allBlocks = Array.from({ length: endBlock - startBlock + 1 }, (_, i) => startBlock + i);
  const batches = chunkArray(allBlocks, BATCH_SIZE);

  const startTime = Date.now();

  console.log('\n🚀 Starting scan...\n');

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    
    try {
      const hashes = await retry(
        blocks => Promise.all(blocks.map(n => api.rpc.chain.getBlockHash(n))),
        [batch]
      );
      const blocks = await retry(
        hs => Promise.all(hs.map(h => api.rpc.chain.getBlock(h))),
        [hashes]
      );

      // Process blocks
      for (let i = 0; i < blocks.length; i++) {
        const blockNumber = batch[i];
        const extrinsics = blocks[i].block.extrinsics;

        for (let idx = 0; idx < extrinsics.length; idx++) {
          const ex = extrinsics[idx];
          debugCounters.totalExtrinsics++;
          
          if (!ex.signer) continue;
          
          // Count extrinsics by section for debugging
          const section = ex.method.section.toString();
          if (!debugCounters.sectionCounts) debugCounters.sectionCounts = {};
          debugCounters.sectionCounts[section] = (debugCounters.sectionCounts[section] || 0) + 1;
          
          // Keep legacy utility counter for compatibility
          if (section === 'utility') {
            debugCounters.utilityExtrinsics++;
          }

          const writeDetail = detail => {
            const key = `${detail.block}-${detail.extrinsicIndex}-${detail.signer}-${detail.derivativeIndex}`;
            
            if (recordedCombinations.has(key)) {
              counters.duplicatesSkipped++;
              console.log(`   ⚠️  Skipping duplicate: Block ${detail.block}, Extrinsic ${detail.extrinsicIndex}, Index ${detail.derivativeIndex}`);
              return;
            }
            
            recordedCombinations.add(key);
            const successValue = detail.success === true ? 'true' : detail.success === false ? 'false' : '';
            const csvLine = `${detail.block},${detail.extrinsicIndex},${detail.signer},${detail.derivativeIndex},${detail.derivedAccount},${successValue}\n`;
            fs.appendFileSync(detailsPath, csvLine);
          };

          // Check ALL extrinsics, not just utility ones
          await checkAsDerivative(
            ex.method,
            ex.method.args || ex.args || [],
            api,
            blockNumber,
            idx,
            ex.signer.toString(),
            writeDetail,
            counters,
            hashes[i] // blockHash
          );
        }
      }

      // Update summary after each batch
      const currentEndBlock = batch[batch.length - 1];
      const elapsed = (Date.now() - startTime) / 1000;
      
      const intermediateSummary = {
        chain: chain.toString(),
        startBlock,
        endBlock: currentEndBlock,
        totalDerivatives: counters.total
      };
      
      fs.writeFileSync(summaryPath, JSON.stringify(intermediateSummary, null, 2));

      // Progress
      const progress = ((batchIdx + 1) / batches.length * 100).toFixed(1);
      const rate = (currentEndBlock - startBlock + 1) / elapsed;
      
      console.log(`✅ Batch ${batchIdx + 1}/${batches.length} (${progress}%) - ${rate.toFixed(1)} blocks/s`);
      
    } catch (error) {
      console.error(`❌ Error batch ${batch[0]}-${batch[batch.length - 1]}:`, error.message);
    }
  }


  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // Read the final summary for reporting
  const finalSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SCAN COMPLETED');
  console.log('='.repeat(60));
  console.log(`⏱️  Time: ${elapsed}s`);
  console.log(`🔗 Chain: ${finalSummary.chain}`);
  console.log(`📦 Block range: ${finalSummary.startBlock} → ${finalSummary.endBlock}`);
  console.log(`🎯 asDerivative found: ${finalSummary.totalDerivatives}`);
  console.log(`🔑 Unique derived accounts: ${counters.unique.size}`);
  console.log(`⚠️  Duplicates skipped: ${counters.duplicatesSkipped}`);
  

  console.log(`\n💾 Saved files:`);
  console.log(`   - Details: ${detailsPath}`);
  console.log(`   - Summary: ${summaryPath}`);

  if (finalSummary.totalDerivatives === 0) {
    console.log('\n⚠️  WARNING: No asDerivative found!');
  }

  await api.disconnect();
  console.log('\n✅ Disconnected.');
}

// ——————————————————————————————————
//  ENTRY POINT
// ——————————————————————————————————
if (require.main === module) {
  main().catch(console.error);
}