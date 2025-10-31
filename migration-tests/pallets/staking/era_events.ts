import "@polkadot/api-augment";
import {
  MigrationTest,
  PostCheckContext,
  PreCheckContext,
  PreCheckResult,
} from "../../types.js";
import assert from "assert";
import { logger } from "../../../shared/logger.js";

/**
 * Era Events Validation Test
 *
 * This test operates ENTIRELY in post-migration state. Unlike other MigrationTest
 * implementations where "before" = pre-migration and "after" = post-migration,
 * here both "before" and "after" are post-migration:
 *
 * - pre_check (rc_api_before, ah_api_before):
 *   APIs loaded from archive snapshots at era end
 *   Finds the start of era X by searching backwards through the archive
 *
 * - post_check (rc_api_after, ah_api_after):
 *   Same APIs (still era end snapshots)
 *   Validates events from era start to era end
 */
interface EventRecord {
  blockNumber: number;
  section: string;
  method: string;
  data: any;
}

interface PhaseTransitionRecord {
  phase: string;
  blockNumber: number;
  fromPhase: string;
}

interface FilteredRCEvents {
  sessionNewSession: EventRecord[];
  validatorSetReceived: EventRecord[];
}

interface FilteredAHEvents {
  sessionRotated: EventRecord[];
  sessionReportReceived: EventRecord[];
  phaseTransitioned: EventRecord[];
  signedRegistered: EventRecord[];
  signedStored: EventRecord[];
  verifierVerified: EventRecord[];
  verifierQueued: EventRecord[];
  signedRewarded: EventRecord[];
  pagedElectionProceeded: EventRecord[];
  eraPaid: EventRecord[];
}

type Network = "kusama" | "polkadot";

async function getBlockNumber(api: any): Promise<number> {
  const header = await api.rpc.chain.getHeader();
  return header.number.toNumber();
}

async function getCurrentEra(api: any): Promise<number | undefined> {
  const currentEraOpt = await api.query.staking.currentEra();
  return currentEraOpt.isSome ? currentEraOpt.unwrap().toNumber() : undefined;
}

async function collectEventsBetween(
  api: any,
  startBlock: number,
  endBlock: number,
): Promise<EventRecord[]> {
  const allEvents: EventRecord[] = [];

  logger.info(`Collecting events from block ${startBlock} to ${endBlock}...`);

  // Query events for each block in range
  for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
    try {
      const blockHash = await api.rpc.chain.getBlockHash(blockNum);
      const apiAt = await api.at(blockHash);
      const events = await apiAt.query.system.events();

      for (const record of events) {
        allEvents.push({
          blockNumber: blockNum,
          section: record.event.section,
          method: record.event.method,
          data: record.event.data.toJSON(),
        });
      }
    } catch (error) {
      logger.warn(`Failed to collect events at block ${blockNum}: ${error}`);
    }
  }

  logger.info(
    `Collected ${allEvents.length} events from ${endBlock - startBlock + 1} blocks`,
  );

  return allEvents;
}

async function detectNetwork(api: any): Promise<Network> {
  const chainName = (await api.rpc.system.chain()).toString().toLowerCase();

  if (chainName.includes("kusama")) return "kusama";
  if (chainName.includes("polkadot")) return "polkadot";

  // For Asset Hub chains
  if (chainName.includes("asset-hub-kusama") || chainName.includes("statemine"))
    return "kusama";
  if (
    chainName.includes("asset-hub-polkadot") ||
    chainName.includes("statemint")
  )
    return "polkadot";

  throw new Error(
    `Unsupported network: ${chainName}. Only kusama and polkadot are supported.`,
  );
}

async function getRuntimePageCount(
  api: any,
  network: Network,
): Promise<number> {
  // Try to query from runtime constants
  try {
    const pages = api.consts.multiBlockElection?.pages;
    if (pages) {
      return pages.toNumber();
    }
  } catch (e) {
    throw new Error(
      `Failed to query runtime constant multiBlockElection.pages for ${network}: ${e}`,
    );
  }

  throw new Error(
    `Runtime constant multiBlockElection.pages not found for ${network}`,
  );
}

/**
 * Find era start block by searching backwards through archive
 *
 * Searches for SessionRotated event where:
 * - active_era = currentEra - 1
 * - planned_era = currentEra
 *
 * This marks the beginning of era preparation for currentEra.
 */
async function findEraStartBlock(api: any, chainName: string): Promise<number> {
  const endBlock = await getBlockNumber(api);
  const currentEra = await getCurrentEra(api);

  if (!currentEra) {
    throw new Error("Could not determine current era");
  }

  logger.info(
    `${chainName}: Searching backwards from block ${endBlock} for era ${currentEra} start...`,
  );

  const archiveSize = 2 * 14400;
  const startSearchBlock = Math.max(1, endBlock - archiveSize);

  // Search backwards through archive
  for (let blockNum = endBlock; blockNum >= startSearchBlock; blockNum--) {
    try {
      const blockHash = await api.rpc.chain.getBlockHash(blockNum);
      const apiAt = await api.at(blockHash);
      const events = await apiAt.query.system.events();

      // Find SessionRotated that marks era start
      for (const record of events) {
        if (
          record.event.section === "staking" &&
          record.event.method === "SessionRotated"
        ) {
          const data = record.event.data.toJSON() as any;
          const activeEra = data.activeEra;
          const plannedEra = data.plannedEra;

          // Found era start: previous era was active, current era is planned
          if (activeEra === currentEra - 1 && plannedEra === currentEra) {
            logger.info(
              `${chainName}: ✅ Found era ${currentEra} start at block ${blockNum} ` +
                `(SessionRotated: active_era=${activeEra}, planned_era=${plannedEra})`,
            );
            return blockNum;
          }
        }
      }
    } catch (error) {
      // Continue searching if block query fails
    }
  }

  throw new Error(
    `${chainName}: Could not find era ${currentEra} start in archive window ` +
      `(searched blocks ${startSearchBlock} to ${endBlock})`,
  );
}

function filterRCEvents(events: EventRecord[]): FilteredRCEvents {
  return {
    sessionNewSession: events.filter(
      (e) => e.section === "session" && e.method === "NewSession",
    ),
    validatorSetReceived: events.filter(
      (e) =>
        e.section === "stakingAhClient" && e.method === "ValidatorSetReceived",
    ),
  };
}

function filterAHEvents(events: EventRecord[]): FilteredAHEvents {
  return {
    sessionRotated: events.filter(
      (e) => e.section === "staking" && e.method === "SessionRotated",
    ),
    sessionReportReceived: events.filter(
      (e) =>
        e.section === "stakingRcClient" && e.method === "SessionReportReceived",
    ),
    phaseTransitioned: events.filter(
      (e) =>
        e.section === "multiBlockElection" && e.method === "PhaseTransitioned",
    ),
    signedRegistered: events.filter(
      (e) =>
        e.section === "multiBlockElectionSigned" && e.method === "Registered",
    ),
    signedStored: events.filter(
      (e) => e.section === "multiBlockElectionSigned" && e.method === "Stored",
    ),
    verifierVerified: events.filter(
      (e) =>
        e.section === "multiBlockElectionVerifier" && e.method === "Verified",
    ),
    verifierQueued: events.filter(
      (e) =>
        e.section === "multiBlockElectionVerifier" && e.method === "Queued",
    ),
    signedRewarded: events.filter(
      (e) =>
        e.section === "multiBlockElectionSigned" && e.method === "Rewarded",
    ),
    pagedElectionProceeded: events.filter(
      (e) => e.section === "staking" && e.method === "PagedElectionProceeded",
    ),
    eraPaid: events.filter(
      (e) => e.section === "staking" && e.method === "EraPaid",
    ),
  };
}

function extractPhaseName(phaseData: any): string {
  // Handle phase data like: { Snapshot: 4 } or { Signed: 0 } or "Off"
  if (typeof phaseData === "string") return phaseData;
  if (typeof phaseData === "object" && phaseData !== null) {
    const keys = Object.keys(phaseData);
    return keys.length > 0 ? keys[0] : "Unknown";
  }
  return "Unknown";
}

function findSessionRotatedWithPlannedEra(
  events: EventRecord[],
): EventRecord | undefined {
  return events.find((e) => {
    const activeEra = e.data.activeEra;
    const plannedEra = e.data.plannedEra;
    return activeEra !== undefined && plannedEra === activeEra + 1;
  });
}

function validatePhaseOrdering(transitions: PhaseTransitionRecord[]): void {
  // Expected order
  const expectedOrder = [
    "Snapshot",
    "Signed",
    "SignedValidation",
    "Unsigned",
    "Done",
    "Export",
    "Off",
  ];

  let lastIndex = -1;
  for (const transition of transitions) {
    const currentIndex = expectedOrder.indexOf(transition.phase);

    assert(
      currentIndex > lastIndex,
      `Phase '${transition.phase}' appears out of order. ` +
        `Expected index ${currentIndex} to be > ${lastIndex}`,
    );

    lastIndex = currentIndex;
  }
}

function validatePhaseTransitions(
  events: EventRecord[],
  afterBlock: number,
): PhaseTransitionRecord[] {
  const relevantEvents = events.filter((e) => e.blockNumber > afterBlock);

  const expectedPhases = [
    "Snapshot",
    "Signed",
    "SignedValidation",
    "Unsigned",
    "Done",
    "Export",
    "Off",
  ];

  const transitions: PhaseTransitionRecord[] = [];
  let lastBlockNumber = afterBlock;
  let lastPhase: string | null = null;

  for (const event of relevantEvents) {
    const toPhase = extractPhaseName(event.data.to);
    const fromPhase = extractPhaseName(event.data.from);

    if (expectedPhases.includes(toPhase)) {
      assert(
        event.blockNumber > lastBlockNumber,
        `Phase transition to ${toPhase} at block ${event.blockNumber} ` +
          `must be > previous phase at block ${lastBlockNumber}`,
      );
    }

    transitions.push({
      phase: toPhase,
      blockNumber: event.blockNumber,
      fromPhase: fromPhase,
    });

    lastBlockNumber = event.blockNumber;
    lastPhase = toPhase;
  }

  for (const required of expectedPhases) {
    assert(
      transitions.some((t) => t.phase === required),
      `Required phase '${required}' not found in transitions`,
    );
  }

  validatePhaseOrdering(transitions);

  return transitions;
}

function validateSignedPhase(
  registered: EventRecord[],
  stored: EventRecord[],
  rewarded: EventRecord[],
): void {
  // Must have at least one score registered
  assert(
    registered.length > 0,
    "Must have at least one score registered in Signed phase",
  );

  // Must have pages stored
  assert(stored.length > 0, "Must have pages stored in Signed phase");

  assert(
    rewarded.length > 0,
    "Miner must be rewarded for successful solution submission. " +
      "Expected MultiBlockElectionSigned.Rewarded event.",
  );

  const rewardEvent = rewarded[0];
  assert(
    rewardEvent.data.field_2 !== undefined &&
      BigInt(rewardEvent.data.field_2) > 0n,
    `Reward amount must be > 0, got ${rewardEvent.data.field_2}`,
  );

  const pageIndices = stored
    .map((e) => e.data.field_2)
    .sort((a: number, b: number) => a - b);

  for (let i = 0; i < pageIndices.length; i++) {
    assert(
      pageIndices[i] === i,
      `Expected page index ${i} but got ${pageIndices[i]}. ` +
        `Pages must be stored sequentially starting from 0.`,
    );
  }
}

function validateSignedValidationPhase(
  verified: EventRecord[],
  queued: EventRecord[],
  storedPageCount: number,
): void {
  // Each page should be verified
  assert(
    verified.length > 0,
    "Pages must be verified in SignedValidation phase",
  );

  assert(
    verified.length === storedPageCount,
    `Number of verified pages (${verified.length}) must match ` +
      `number of stored pages (${storedPageCount})`,
  );

  assert(queued.length > 0, "Solution must be queued after verification");
}

async function validateExportPhase(
  pagedElectionProceeded: EventRecord[],
  ahApi: any,
  network: Network,
): Promise<void> {
  const expectedPageCount = await getRuntimePageCount(ahApi, network);

  assert(
    pagedElectionProceeded.length > 0,
    "Must have PagedElectionProceeded events in Export phase",
  );

  assert(
    pagedElectionProceeded.length === expectedPageCount,
    `Export phase must produce exactly ${expectedPageCount} PagedElectionProceeded events ` +
      `(${network} config), but got ${pagedElectionProceeded.length}`,
  );

  // Validate eras_elected decrements correctly
  const erasElected = pagedElectionProceeded.map((e) => e.data.eras_elected);

  for (let i = 1; i < erasElected.length; i++) {
    const prev = erasElected[i - 1];
    const curr = erasElected[i];

    // Each should be less than or equal to previous
    assert(
      curr <= prev,
      `eras_elected should not increase: at index ${i - 1} was ${prev}, at ${i} is ${curr}`,
    );
  }
}

function validateValidatorSetPropagation(
  validatorSetReceived: EventRecord[],
  pagedElectionProceeded: EventRecord[],
): void {
  assert(
    validatorSetReceived.length > 0,
    "RC must receive validator set from AH",
  );

  const lastExport = Math.max(
    ...pagedElectionProceeded.map((e) => e.blockNumber),
  );
  const firstReceived = Math.min(
    ...validatorSetReceived.map((e) => e.blockNumber),
  );

  assert(
    lastExport > 0 && firstReceived > 0,
    "Both validator set export and reception must occur",
  );
}

function validateSessionQueuing(
  sessionNewSession: EventRecord[],
  validatorSetReceived: EventRecord[],
): void {
  const lastValidatorSet = Math.max(
    ...validatorSetReceived.map((e) => e.blockNumber),
  );
  const sessionsAfter = sessionNewSession.filter(
    (e) => e.blockNumber >= lastValidatorSet,
  );

  assert(
    sessionsAfter.length > 0,
    "Should see NewSession on RC after ValidatorSetReceived",
  );
}

function validateActivationTimestamp(
  sessionReportReceived: EventRecord[],
): void {
  // Find a SessionReportReceived with activation_timestamp set
  const withActivation = sessionReportReceived.find((e) => {
    const timestamp = e.data.activationTimestamp;
    return (
      timestamp !== null && timestamp !== undefined && timestamp !== "None"
    );
  });

  assert(
    withActivation !== undefined,
    "Must receive SessionReportReceived with activation_timestamp set",
  );
}

function validateEraPaid(eraPaid: EventRecord[], expectedEra: number): void {
  // Must have EraPaid event
  assert(eraPaid.length > 0, "Must have EraPaid event for era rotation");

  // Validate era index
  const eraPaidEvent = eraPaid[0];
  assert(
    eraPaidEvent.data.eraIndex !== undefined,
    "EraPaid must include era index",
  );

  // TODO: Validate payout amounts are reasonable
  const validatorPayout = BigInt(eraPaidEvent.data.validatorPayout || 0);
  assert(
    validatorPayout > 0n,
    `EraPaid validator payout must be > 0, got ${validatorPayout}`,
  );
}

function validateFinalSessionRotated(
  sessionRotated: EventRecord[],
  expectedActiveEra: number,
): void {
  // Find final SessionRotated with active_era = expected
  const finalRotation = sessionRotated.find(
    (e) => e.data.activeEra === expectedActiveEra,
  );

  assert(
    finalRotation !== undefined,
    `Must find final SessionRotated with active_era=${expectedActiveEra}`,
  );
}

function logValidationSummary(
  phaseTransitions: PhaseTransitionRecord[],
  ahFiltered: FilteredAHEvents,
  network: Network,
  storedPageCount: number,
): void {
  logger.info("✅ Era events validation summary:", {
    network,
    phaseTransitions: phaseTransitions.map((t) => ({
      phase: t.phase,
      block: t.blockNumber,
    })),
    signedScores: ahFiltered.signedRegistered.length,
    signedPages: storedPageCount,
    verifiedPages: ahFiltered.verifierVerified.length,
    exportedPages: ahFiltered.pagedElectionProceeded.length,
    rewardEvents: ahFiltered.signedRewarded.length,
    queuedEvents: ahFiltered.verifierQueued.length,
  });
}

async function validateEraEventSequence(
  rcEvents: EventRecord[],
  ahEvents: EventRecord[],
  prePayload: PreCheckResult,
  ahApi: any,
  network: Network,
): Promise<void> {
  const rcFiltered = filterRCEvents(rcEvents);
  const ahFiltered = filterAHEvents(ahEvents);

  logger.info("Starting era event sequence validation...");

  // Step 1: Find SessionRotated with active_era=x and planned_era=x+1
  const startingSessionRotated = findSessionRotatedWithPlannedEra(
    ahFiltered.sessionRotated,
  );
  assert(
    startingSessionRotated !== undefined,
    "Must find SessionRotated with active_era=x and planned_era=x+1",
  );

  const activeEra = startingSessionRotated.data.activeEra;
  const plannedEra = startingSessionRotated.data.plannedEra;
  assert(
    plannedEra === activeEra + 1,
    `Planned era ${plannedEra} should be active era ${activeEra} + 1`,
  );

  logger.info(
    `✅ Found SessionRotated with active_era=${activeEra}, planned_era=${plannedEra}`,
  );

  // Step 2: Validate phase transitions
  const phaseTransitions = validatePhaseTransitions(
    ahFiltered.phaseTransitioned,
    startingSessionRotated.blockNumber,
  );

  logger.info(
    `✅ Phase transitions validated: ${phaseTransitions.map((t) => t.phase).join(" → ")}`,
  );

  // Step 3: Validate Signed phase (score + pages + reward)
  validateSignedPhase(
    ahFiltered.signedRegistered,
    ahFiltered.signedStored,
    ahFiltered.signedRewarded,
  );

  const storedPageCount = ahFiltered.signedStored.length;
  logger.info(
    `✅ Signed phase: ${ahFiltered.signedRegistered.length} scores, ${storedPageCount} pages, ${ahFiltered.signedRewarded.length} rewards`,
  );

  // Step 4: Validate SignedValidation phase
  validateSignedValidationPhase(
    ahFiltered.verifierVerified,
    ahFiltered.verifierQueued,
    storedPageCount,
  );

  logger.info(
    `✅ Validation phase: ${ahFiltered.verifierVerified.length} pages verified, solution queued`,
  );

  // Step 5: Validate Export phase
  await validateExportPhase(ahFiltered.pagedElectionProceeded, ahApi, network);

  logger.info(
    `✅ Export phase: ${ahFiltered.pagedElectionProceeded.length} PagedElectionProceeded events`,
  );

  // Step 6: Validate validator set propagation
  validateValidatorSetPropagation(
    rcFiltered.validatorSetReceived,
    ahFiltered.pagedElectionProceeded,
  );

  logger.info(`✅ Validator set propagation: AH exported, RC received`);

  // Step 7: Validate session queuing on RC
  validateSessionQueuing(
    rcFiltered.sessionNewSession,
    rcFiltered.validatorSetReceived,
  );

  logger.info(`✅ Session queuing: NewSession on RC`);

  // Step 8: Validate activation timestamp on AH
  validateActivationTimestamp(ahFiltered.sessionReportReceived);

  logger.info(`✅ Activation timestamp received on AH`);

  // Step 9: Validate EraPaid
  validateEraPaid(ahFiltered.eraPaid, activeEra);

  const eraPaidEvent = ahFiltered.eraPaid[0];
  logger.info(
    `✅ EraPaid: era ${eraPaidEvent.data.eraIndex}, payout ${eraPaidEvent.data.validatorPayout}`,
  );

  // Step 10: Validate final SessionRotated
  validateFinalSessionRotated(ahFiltered.sessionRotated, plannedEra);

  logger.info(`✅ Final SessionRotated: active_era=${plannedEra}`);

  logValidationSummary(phaseTransitions, ahFiltered, network, storedPageCount);
}

export const eraEventsTest: MigrationTest = {
  name: "era_events_validation",

  pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
    const { rc_api_before, ah_api_before } = context;

    logger.info(
      "Era events test: Loading archive mode snapshots and finding era start...",
    );

    // Find era start by searching backwards through archive
    const rc_start_block = await findEraStartBlock(rc_api_before, "RC");
    const ah_start_block = await findEraStartBlock(ah_api_before, "AH");

    // Get end blocks (current position in archive snapshots)
    const rc_end_block = await getBlockNumber(rc_api_before);
    const ah_end_block = await getBlockNumber(ah_api_before);

    const rc_current_era = await getCurrentEra(rc_api_before);
    const ah_current_era = await getCurrentEra(ah_api_before);

    logger.info(
      `RC: era ${rc_current_era}, blocks ${rc_start_block} → ${rc_end_block}`,
    );
    logger.info(
      `AH: era ${ah_current_era}, blocks ${ah_start_block} → ${ah_end_block}`,
    );

    return {
      rc_pre_payload: {
        start_block: rc_start_block,
        end_block: rc_end_block,
        current_era: rc_current_era,
      },
      ah_pre_payload: {
        start_block: ah_start_block,
        end_block: ah_end_block,
        current_era: ah_current_era,
      },
    };
  },

  post_check: async (
    context: PostCheckContext,
    pre_payload: PreCheckResult,
  ): Promise<void> => {
    const { rc_api_after, ah_api_after } = context;

    logger.info("Era events test: collecting era END state...");

    // Collect all events from ERA START to ERA END
    const rc_end_block = await getBlockNumber(rc_api_after);
    const ah_end_block = await getBlockNumber(ah_api_after);

    logger.info(`RC era end: block ${rc_end_block}`);
    logger.info(`AH era end: block ${ah_end_block}`);

    const rc_events = await collectEventsBetween(
      rc_api_after,
      pre_payload.rc_pre_payload.start_block,
      pre_payload.rc_pre_payload.end_block,
    );

    const ah_events = await collectEventsBetween(
      ah_api_after,
      pre_payload.ah_pre_payload.start_block,
      pre_payload.ah_pre_payload.end_block,
    );

    // Determine network from runtime
    const network = await detectNetwork(ah_api_after);
    logger.info(`Detected network: ${network}`);

    // Run enhanced validation with runtime config queries
    await validateEraEventSequence(
      rc_events,
      ah_events,
      pre_payload,
      ah_api_after,
      network,
    );

    logger.info("✅ Era events test completed successfully");
  },
};
