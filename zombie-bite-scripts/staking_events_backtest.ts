import "@polkadot/api-augment";
import { ApiPromise, WsProvider } from "@polkadot/api";
import fs from "fs";
import { logger } from "../shared/logger.js";
import * as path from "path";

type Network = "kusama" | "polkadot";

type Phase = "Snapshot" | "Signed" | "SignedValidation" | "Unsigned" | "Done" | "Export" | "Off" | "Waiting";

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

interface AHEventTracker {
  phase: Phase;
  activeEra: number | null;
  plannedEra: number | null;
  sessionRotatedCount: number;
  signedRegisteredCount: number;
  signedStoredPages: number[];
  signedRewarded: boolean;
  verifierVerifiedCount: number;
  verifierQueued: boolean;
  pagedElectionProceededCount: number;
  lastExportBlock: number;
  eraPaid: boolean;
  eraPaidData: any;
  sessionReportReceived: boolean;
  rewardData: any;
  lastBlockNumber: number;
  phaseTransitions: PhaseTransitionRecord[];
}

interface RCEventTracker {
  validatorSetReceived: boolean;
  sessionNewSessionCount: number;
  lastValidatorSetBlock: number | null;
  lastBlockNumber: number;
}

interface EventProcessorState {
  ah: AHEventTracker;
  rc: RCEventTracker;
  eraStartBlock: number | null;
  started: boolean;
  completed: boolean;
}

async function main() {
  const runtime = process.argv[2].toLowerCase();

  if (runtime !== "kusama" && runtime !== "polkadot") {
    logger.error(`⚠️ Runtime must be either 'kusama' or 'polkadot', not '${runtime}'`);
    process.exit(1);
  }
  
  const rc_endpoint = 'wss://kusama-rpc-tn.dwellir.com';
  const ah_endpoint = 'wss://kusama-asset-hub-rpc.polkadot.io';

  // const rc_endpoint = `ws://localhost:63168`;
  // const ah_endpoint = `ws://localhost:63170`;

  logger.info(`Starting real-time era event validation for ${runtime}...`, {
    runtime,
  });

  try {
    await iterateFromMigrationEnd(rc_endpoint, ah_endpoint, runtime.toLowerCase() as Network);
    logger.info("✅ Real-time era event validation completed successfully");
    process.exit(0);
  } catch (error) {
    const errorInfo =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : {
            error: String(error),
          };

    logger.error("Real-time era event validation error", {
      service: "ahm",
      error: errorInfo,
    });
    process.exit(1);
  }
}

async function runValidation(
    rcEndpoint: string,
    ahEndpoint: string,
    network: Network
  ): Promise<void> {
    const processor = new EraEventProcessor(network);
    try {
      await processor.connect(rcEndpoint, ahEndpoint);
      processor.start();
      logger.info("🎯 Waiting for era validation to complete...");
      await processor.waitForCompletion();
    } finally {
      await processor.disconnect();
    }
  }

async function iterateFromMigrationEnd(
    rcEndpoint: string,
    ahEndpoint: string,
    network: Network,
  ): Promise<void> {
    const processor = new EraEventProcessor(network);
    await processor.iterateFromMigrationEnd(rcEndpoint, ahEndpoint);
  }

class EraEventProcessor {
  private state: EventProcessorState;
  private network: Network;
  private completionResolve!: () => void;
  private completionReject!: (error: Error) => void;
  private completionPromise: Promise<void>;
  private ahApi: ApiPromise | null = null;
  private rcApi: ApiPromise | null = null;
  private ahUnsub: (() => Promise<void>) | null = null;
  private rcUnsub: (() => Promise<void>) | null = null;
  private ahLastBlockNumber = 0;
  private rcLastBlockNumber = 0;

  constructor(network: Network) {
    this.network = network;
    this.state = createInitialState();
    this.completionPromise = new Promise((resolve, reject) => {
      this.completionResolve = resolve;
      this.completionReject = reject;
    });
  }

  async connect(rcEndpoint: string, ahEndpoint: string): Promise<void> {
    logger.info("Connecting to endpoints...");

    const ahProvider = new WsProvider(ahEndpoint);
    const rcProvider = new WsProvider(rcEndpoint);

    this.ahApi = await ApiPromise.create({ provider: ahProvider });
    this.rcApi = await ApiPromise.create({ provider: rcProvider });

    logger.info("✅ Connected to both chains");
  }

  async disconnect(): Promise<void> {
    logger.info("Disconnecting from chains...");

    if (this.ahUnsub) await this.ahUnsub();
    if (this.rcUnsub) await this.rcUnsub();

    if (this.ahApi) await this.ahApi.disconnect();
    if (this.rcApi) await this.rcApi.disconnect();

    logger.info("✅ Disconnected from both chains");
  }

  start(): void {
    if (!this.ahApi || !this.rcApi) {
      throw new Error("APIs not connected. Call connect() first.");
    }

    this.subscribeToRC(this.rcApi);
    this.subscribeToAH(this.ahApi);
  }

  private subscribeToRC(api: ApiPromise): void {
    const unsubPromise = api.rpc.chain.subscribeFinalizedHeads(async (header) => {
      const blockNumber = header.number.toNumber();

      if (blockNumber <= this.rcLastBlockNumber) return;
      this.rcLastBlockNumber = blockNumber;

      await this.processRCBlock(api, header.hash, blockNumber);
    });

    unsubPromise.then((unsub) => {
      this.rcUnsub = async () => unsub();
    });
  }

  private subscribeToAH(api: ApiPromise): void {
    const unsubPromise = api.rpc.chain.subscribeFinalizedHeads(async (header) => {
      const blockNumber = header.number.toNumber();

      if (blockNumber <= this.ahLastBlockNumber) return;
      this.ahLastBlockNumber = blockNumber;

      await this.processAHBlock(api, header.hash, blockNumber);
    });

    unsubPromise.then((unsub) => {
      this.ahUnsub = async () => unsub();
    });
  }

  private async checkCompletion(): Promise<void> {
    await validateAndReport(this.state, this.network);
    
    if (this.state.completed) {
      this.completionResolve();
    }
  }

  async waitForCompletion(): Promise<void> {
    await Promise.race([this.completionPromise]);
  }

  async iterateFromMigrationEnd(
    rcEndpoint: string,
    ahEndpoint: string,
  ): Promise<void> {
    logger.info(`rcEndPoint: ${rcEndpoint}, ahEndPoint: ${ahEndpoint}`);

    await this.connect(rcEndpoint, ahEndpoint);
      
    if (!this.ahApi || !this.rcApi) {
      throw new Error("Failed to connect to APIs");
    }

    const rcStartBlock = await this.rcApi?.query.rcMigrator.migrationEndBlock();
    const ahStartBlock = await this.ahApi?.query.ahMigrator.migrationEndBlock();
    if (rcStartBlock.isEmpty) {
        throw new Error('Migration end block not found in rcMigrator storage');
    }
    if (ahStartBlock.isEmpty) {
        throw new Error('Migration end block not found in ahMigrator storage');
    }

    const rc_iteration_start_block = Number(rcStartBlock.toPrimitive());
    const ah_iteration_start_block = Number(ahStartBlock.toPrimitive());
    
    const archive_size = 2 * 14400; // 2 days in blocks
    const maxBlocks = 24 * 60 * 60 / 6 // 24 hours in blocks (6 seconds per block) -- should be enough for Kusama
    const rc_iteration_end_block = rc_iteration_start_block + maxBlocks;
    const ah_iteration_end_block = ah_iteration_start_block + maxBlocks;
      

    let i = rc_iteration_start_block;
    let j = ah_iteration_start_block;
    logger.info(`Iterating from ${rc_iteration_start_block} to ${rc_iteration_end_block} and ${ah_iteration_start_block} to ${ah_iteration_end_block}`);
    while (i <= rc_iteration_end_block && j <= ah_iteration_end_block) {         
      const rcHash = await this.rcApi?.rpc.chain.getBlockHash(i) ?? '';
      const ahHash = await this.ahApi?.rpc.chain.getBlockHash(j) ?? '';
      await this.processRCBlock(this.rcApi, rcHash, i);
      await this.processAHBlock(this.ahApi, ahHash, j);
      if (i % 200 === 0) {
        // logger.info(`Processed ${i} blocks`);
      }
      i++;
      j++;
    }
  }

  private async processAHBlock(api: ApiPromise, blockHash: any, blockNumber: number): Promise<void> {
    try {
      const apiAt = await api.at(blockHash);
      const events = await apiAt.query.system.events();

      for (const record of events) {
        const event: EventRecord = {
          blockNumber,
          section: record.event.section,
          method: record.event.method,
          data: record.event.data.toJSON(),
        };

        processAHEvent(this.state, event, this.network);
      }

      await this.checkCompletion();
    } catch (error) {
      logger.error(`Error processing AH block ${blockNumber}:`, error);
    }
  }

  private async processRCBlock(api: ApiPromise, blockHash: any, blockNumber: number): Promise<void> {
    try {
      const apiAt = await api.at(blockHash);
      const events = await apiAt.query.system.events();

      for (const record of events) {
        const event: EventRecord = {
          blockNumber,
          section: record.event.section,
          method: record.event.method,
          data: record.event.data.toJSON(),
        };

        processRCEvent(this.state, event);
      }

      await this.checkCompletion();
    } catch (error) {
      logger.error(`Error processing RC block ${blockNumber}:`, error);
    }
  }

}

const EVENT_LOG_FILE = path.resolve(process.cwd(), "event_log.json");

function writeEventToFile(event: EventRecord, network?: Network) {
  // Attach network name if provided
  const outEvent = { ...event, network };
  fs.appendFileSync(EVENT_LOG_FILE, JSON.stringify(outEvent) + "\n");
}

function processAHEvent(state: EventProcessorState, event: EventRecord, network: Network): void {
  // Write every event seen here to the log file
  writeEventToFile(event, network);

  const ah = state.ah;

  // SessionRotated - marks era start
  if (event.section === "staking" && event.method === "SessionRotated") {
    const activeEra = event.data.activeEra;
    const plannedEra = event.data.plannedEra;

    logger.info(`[AH] SessionRotated event: active_era=${activeEra}, planned_era=${plannedEra} at block ${event.blockNumber}`);
    if (!state.started && activeEra !== undefined && plannedEra === activeEra + 1) {
      state.started = true;
      state.eraStartBlock = event.blockNumber;
      ah.activeEra = activeEra;
      ah.plannedEra = plannedEra;
      logger.info(`[AH] 🎯 Era start detected: active_era=${activeEra}, planned_era=${plannedEra} at block ${event.blockNumber}`);
    }
  }

  if (event.section === "multiBlockElection" && event.method === "PhaseTransitioned") {
    const newPhase = extractPhaseName(event.data.to);
    const fromPhase = extractPhaseName(event.data.from);
    
    const expectedPhaseOrder = ["Snapshot", "Signed", "SignedValidation", "Unsigned", "Done", "Export", "Off"];
    const currentIndex = expectedPhaseOrder.indexOf(ah.phase);
    const newIndex = expectedPhaseOrder.indexOf(newPhase);

    if (newIndex > currentIndex) {
      ah.phase = newPhase as Phase;
      ah.phaseTransitions.push({
        phase: newPhase,
        blockNumber: event.blockNumber,
        fromPhase: fromPhase,
      });
      logger.info(`[AH] 📊 Phase transition: ${fromPhase} → ${ah.phase} at block ${event.blockNumber}`);
    }
  }

  if (event.section === "multiBlockElectionSigned" && event.method === "Registered") {
    ah.signedRegisteredCount++;
    logger.debug(`✓ Score registered (${ah.signedRegisteredCount}) at block ${event.blockNumber}`);
  }

  if (event.section === "multiBlockElectionSigned" && event.method === "Stored") {
    const pageIndex = event.data.field_2;
    if (!ah.signedStoredPages.includes(pageIndex)) {
      ah.signedStoredPages.push(pageIndex);
      ah.signedStoredPages.sort((a, b) => a - b);
    }
    logger.debug(`[AH] ✓ Page ${pageIndex} stored at block ${event.blockNumber}`);
  }

  if (event.section === "multiBlockElectionSigned" && event.method === "Rewarded") {
    ah.signedRewarded = true;
    ah.rewardData = event.data;
    logger.info(`[AH] 💰 Miner rewarded at block ${event.blockNumber}: ${event.data.field_2}`);
  }

  if (event.section === "multiBlockElectionVerifier" && event.method === "Verified") {
    ah.verifierVerifiedCount++;
    logger.debug(`[AH] ✓ Page verified (${ah.verifierVerifiedCount}/${ah.signedStoredPages.length}) at block ${event.blockNumber}`);
  }

  if (event.section === "multiBlockElectionVerifier" && event.method === "Queued") {
    ah.verifierQueued = true;
    logger.info(`[AH] ✓ Solution queued at block ${event.blockNumber}`);
  }

  if (event.section === "staking" && event.method === "PagedElectionProceeded") {
    ah.pagedElectionProceededCount++;
    ah.lastExportBlock = event.blockNumber;
    logger.debug(`[AH] ✓ Page exported (${ah.pagedElectionProceededCount}) at block ${event.blockNumber}`);
  }

  if (event.section === "staking" && event.method === "EraPaid") {
    ah.eraPaid = true;
    ah.eraPaidData = event.data;
    logger.info(`[AH] 💰 Era paid: era data: ${JSON.stringify(event.data)}, at block ${event.blockNumber}`);
  }

  if (event.section === "stakingRcClient" && event.method === "SessionReportReceived") {
    if (event.data.activationTimestamp) {
      ah.sessionReportReceived = true;
      logger.info(`[AH] ✓ Session report with activation timestamp received at block ${event.blockNumber}`);
    }
  }

  ah.lastBlockNumber = event.blockNumber;
}

function processRCEvent(state: EventProcessorState, event: EventRecord): void {
  // Write every event seen here to the log file
  writeEventToFile(event);

  const rc = state.rc;

  if (event.section === "stakingAhClient" && event.method === "ValidatorSetReceived") {
    rc.validatorSetReceived = true;
    rc.lastValidatorSetBlock = event.blockNumber;
    logger.info(`[RC] ✓ Validator set received on RC at block ${event.blockNumber}`);
  }

  if (event.section === "session" && event.method === "NewSession") {
    rc.sessionNewSessionCount++;
    
    if (rc.validatorSetReceived) {
      logger.debug(`[RC] ✓ New session on RC (${rc.sessionNewSessionCount}) at block ${event.blockNumber}`);
    }
  }

  rc.lastBlockNumber = event.blockNumber;
}
  
  function createInitialState(): EventProcessorState {
    return {
      ah: {
        phase: "Waiting",
        activeEra: null,
        plannedEra: null,
        sessionRotatedCount: 0,
        signedRegisteredCount: 0,
        signedStoredPages: [],
        signedRewarded: false,
        rewardData: undefined,
        verifierVerifiedCount: 0,
        verifierQueued: false,
        pagedElectionProceededCount: 0,
        lastExportBlock: 0,
        eraPaid: false,
        eraPaidData: undefined,
        sessionReportReceived: false,
        lastBlockNumber: 0,
        phaseTransitions: [],
      },
      rc: {
        validatorSetReceived: false,
        sessionNewSessionCount: 0,
        lastValidatorSetBlock: null,
        lastBlockNumber: 0,
      },
      eraStartBlock: null,
      started: false,
      completed: false,
    };
  }
  
  function extractPhaseName(phaseData: any): string {
    if (typeof phaseData === "string") return phaseData;
    if (typeof phaseData === "object" && phaseData !== null) {
      const keys = Object.keys(phaseData);
      return keys.length > 0 ? keys[0] : "Unknown";
    }
    return "Unknown";
  }

  function validatePhaseOrdering(transitions: PhaseTransitionRecord[]): void {
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

      if (currentIndex <= lastIndex) {
        throw new Error(
          `Phase '${transition.phase}' appears out of order. ` +
            `Expected index ${currentIndex} to be > ${lastIndex}`
        );
      }

      lastIndex = currentIndex;
    }
  }

  function validatePhaseTransitions(
    transitions: PhaseTransitionRecord[],
    startBlock: number,
  ): void {
    const expectedPhases = [
      "Snapshot",
      "Signed",
      "SignedValidation",
      "Unsigned",
      "Done",
      "Export",
      "Off",
    ];

    let lastBlockNumber = startBlock;

    for (const transition of transitions) {
      if (expectedPhases.includes(transition.phase)) {
        if (transition.blockNumber <= lastBlockNumber) {
          throw new Error(
            `Phase transition to ${transition.phase} at block ${transition.blockNumber} ` +
              `must be > previous phase at block ${lastBlockNumber}`
          );
        }
      }
      lastBlockNumber = transition.blockNumber;
    }

    // Validate all required phases are present
    for (const required of expectedPhases) {
      if (!transitions.some((t) => t.phase === required)) {
        throw new Error(`Required phase '${required}' not found in transitions`);
      }
    }

    validatePhaseOrdering(transitions);
  }

  function validateSignedPhase(
    signedRegisteredCount: number,
    signedStoredPages: number[],
    signedRewarded: boolean,
    rewardData: any,
  ): void {
    if (signedRegisteredCount === 0) {
      throw new Error("Must have at least one score registered in Signed phase");
    }

    if (signedStoredPages.length === 0) {
      throw new Error("Must have pages stored in Signed phase");
    }

    if (!signedRewarded) {
      throw new Error(
        "Miner must be rewarded for successful solution submission. " +
          "Expected MultiBlockElectionSigned.Rewarded event."
      );
    }

    if (rewardData !== undefined && rewardData.field_2 !== undefined) {
      const rewardAmount = BigInt(rewardData.field_2);
      if (rewardAmount <= 0n) {
        throw new Error(
          `Reward amount must be > 0, got ${rewardData.field_2}`
        );
      }
    }

    // Validate pages are stored sequentially starting from 0
    const sortedPages = [...signedStoredPages].sort((a, b) => a - b);
    for (let i = 0; i < sortedPages.length; i++) {
      if (sortedPages[i] !== i) {
        throw new Error(
          `Expected page index ${i} but got ${sortedPages[i]}. ` +
            `Pages must be stored sequentially starting from 0.`
        );
      }
    }
  }

  function validateSignedValidationPhase(
    verifierVerifiedCount: number,
    verifierQueued: boolean,
    storedPageCount: number,
  ): void {
    if (verifierVerifiedCount === 0) {
      throw new Error("Pages must be verified in SignedValidation phase");
    }

    if (verifierVerifiedCount !== storedPageCount) {
      throw new Error(
        `Number of verified pages (${verifierVerifiedCount}) must match ` +
          `number of stored pages (${storedPageCount})`
      );
    }

    if (!verifierQueued) {
      throw new Error("Solution must be queued after verification");
    }
  }

  function validateValidatorSetPropagation(
    validatorSetReceived: boolean,
    validatorSetBlock: number | null,
    lastExportBlock: number,
  ): void {
    if (!validatorSetReceived) {
      throw new Error("RC must receive validator set from AH");
    }

    if (validatorSetBlock === null || validatorSetBlock === 0) {
      throw new Error("Validator set reception block must be set");
    }

    if (lastExportBlock > 0 && validatorSetBlock <= lastExportBlock) {
      throw new Error(
        `Validator set should be received (block ${validatorSetBlock}) ` +
          `after export completes (block ${lastExportBlock})`
      );
    }
  }

  function validateSessionQueuing(
    sessionNewSessionCount: number,
    validatorSetReceived: boolean,
  ): void {
    if (!validatorSetReceived) {
      return; // Can't validate sessions if validator set not received
    }

    if (sessionNewSessionCount === 0) {
      throw new Error("Should see NewSession on RC after ValidatorSetReceived");
    }
  }

  function validateActivationTimestamp(sessionReportReceived: boolean): void {
    if (!sessionReportReceived) {
      throw new Error(
        "Must receive SessionReportReceived with activation_timestamp set"
      );
    }
  }

  function validateEraPaid(eraPaid: boolean, eraPaidData: any): void {
    if (!eraPaid) {
      throw new Error("Must have EraPaid event for era rotation");
    }

    if (eraPaidData !== undefined) {
      if (eraPaidData.eraIndex === undefined) {
        throw new Error("EraPaid must include era index");
      }

      const validatorPayout = BigInt(eraPaidData.validatorPayout || 0);
      if (validatorPayout <= 0n) {
        throw new Error(
          `EraPaid validator payout must be > 0, got ${validatorPayout}`
        );
      }
    }
  }

  async function validateAndReport(state: EventProcessorState, network: Network): Promise<void> {
    const ah = state.ah;
    const rc = state.rc;
  
    if (!state.started) {
      return;
    }
    logger.info("state has started 🚀");
  
    const expectedPageCount = network === "kusama" ? 4 : 8;
  
    const shouldLog = ah.lastBlockNumber % 100 === 0;
    if (shouldLog) {
      logger.info("📈 Current validation state:", {
        phase: ah.phase,
        signedScores: ah.signedRegisteredCount,
        storedPages: ah.signedStoredPages.length,
        verifiedPages: ah.verifierVerifiedCount,
        exportedPages: ah.pagedElectionProceededCount,
        validatorSetReceived: rc.validatorSetReceived,
        newSessions: rc.sessionNewSessionCount,
      });
    }
  
    logger.info("ah.phase: ", ah.phase);
    // Only run full validation when we've reached final phase
    if (ah.phase !== "Off") {
      return;
    }

    logger.info("🔍 Starting validation...");
    logger.info(`state.eraStartBlock: ${state.eraStartBlock}\n ah.phaseTransitions: ${JSON.stringify(ah.phaseTransitions)}`);
    try {
      // Validate phase transitions
      if (state.eraStartBlock !== null) {
        validatePhaseTransitions(ah.phaseTransitions, state.eraStartBlock);
        logger.info("✅ Phase transitions validated");
      }

      // Validate Signed phase
      validateSignedPhase(
        ah.signedRegisteredCount,
        ah.signedStoredPages,
        ah.signedRewarded,
        ah.rewardData,
      );
      logger.info("✅ Signed phase validated");

      // Validate SignedValidation phase
      validateSignedValidationPhase(
        ah.verifierVerifiedCount,
        ah.verifierQueued,
        ah.signedStoredPages.length,
      );
      logger.info("✅ SignedValidation phase validated");

      // Validate Export phase - check page count
      if (ah.pagedElectionProceededCount !== expectedPageCount) {
        throw new Error(
          `Export phase must produce exactly ${expectedPageCount} PagedElectionProceeded events ` +
            `(${network} config), but got ${ah.pagedElectionProceededCount}`
        );
      }
      logger.info("✅ Export phase validated");

      // Validate validator set propagation
      validateValidatorSetPropagation(
        rc.validatorSetReceived,
        rc.lastValidatorSetBlock,
        ah.lastExportBlock,
      );
      logger.info("✅ Validator set propagation validated");

      // Validate session queuing
      validateSessionQueuing(rc.sessionNewSessionCount, rc.validatorSetReceived);
      logger.info("✅ Session queuing validated");

      // Validate activation timestamp
      validateActivationTimestamp(ah.sessionReportReceived);
      logger.info("✅ Activation timestamp validated");

      // Validate EraPaid
      validateEraPaid(ah.eraPaid, ah.eraPaidData);
      logger.info("✅ EraPaid validated");

      state.completed = true;
      logger.info("✅ Era validation completed successfully!");
      logger.info("Final summary:", {
        activeEra: ah.activeEra,
        plannedEra: ah.plannedEra,
        phase: ah.phase,
        phaseTransitions: ah.phaseTransitions.map((t) => ({
          phase: t.phase,
          block: t.blockNumber,
        })),
        signedScores: ah.signedRegisteredCount,
        storedPages: ah.signedStoredPages,
        verifiedPages: ah.verifierVerifiedCount,
        exportedPages: ah.pagedElectionProceededCount,
        validatorSetReceived: rc.validatorSetReceived,
        newSessions: rc.sessionNewSessionCount,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Validation failed: ${errorMessage}`);
      throw error;
    }
  }

main();
