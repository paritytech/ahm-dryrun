import "@polkadot/api-augment";
import { ApiPromise, WsProvider } from "@polkadot/api";
import fs from "fs";
import { logger } from "../shared/logger.js";

type Network = "kusama" | "polkadot";

type Phase = "Snapshot" | "Signed" | "SignedValidation" | "Unsigned" | "Done" | "Export" | "Off" | "Waiting";

interface EventRecord {
  blockNumber: number;
  section: string;
  method: string;
  data: any;
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
  eraPaid: boolean;
  sessionReportReceived: boolean;
  lastBlockNumber: number;
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
  const base_path = process.argv[2];
  const runtime = process.argv[3];

  if (!base_path) {
    logger.error("⚠️ No base_path provided. Usage: staking-event-checker <base_path> <runtime>");
    process.exit(1);
  }

  if (!runtime) {
    logger.error("⚠️ No runtime provided. Runtime must be either 'Kusama' or 'Polkadot'. Usage: staking-event-checker <base_path> <runtime>");
    process.exit(1);
  }

  if (runtime !== "Kusama" && runtime !== "Polkadot") {
    logger.error("⚠️ Runtime must be either 'Kusama' or 'Polkadot'");
    process.exit(1);
  }

  logger.info(`Starting real-time era event validation for ${runtime}...`, {
    base_path,
    runtime,
  });

  const { rc_endpoint, ah_endpoint } = getEndpoints(base_path);

  logger.info(`Using endpoints:`, {
    rc_endpoint,
    ah_endpoint,
  });

  try {
    await runValidation(
      rc_endpoint,
      ah_endpoint,
      runtime.toLowerCase() as Network
    );
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

  start(): void {
    if (!this.ahApi || !this.rcApi) {
      throw new Error("APIs not connected. Call connect() first.");
    }

    this.subscribeToAH(this.ahApi);
    this.subscribeToRC(this.rcApi);
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

        this.handleAHEvent(event);
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

        this.handleRCEvent(event);
      }

      await this.checkCompletion();
    } catch (error) {
      logger.error(`Error processing RC block ${blockNumber}:`, error);
    }
  }

  private handleAHEvent(event: EventRecord): void {
    processAHEvent(this.state, event, this.network);
  }

  private handleRCEvent(event: EventRecord): void {
    processRCEvent(this.state, event);
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

  async disconnect(): Promise<void> {
    logger.info("Disconnecting from chains...");

    if (this.ahUnsub) await this.ahUnsub();
    if (this.rcUnsub) await this.rcUnsub();

    if (this.ahApi) await this.ahApi.disconnect();
    if (this.rcApi) await this.rcApi.disconnect();

    logger.info("✅ Disconnected from both chains");
  }
}

function processAHEvent(state: EventProcessorState, event: EventRecord, network: Network): void {
    const ah = state.ah;
  
    // SessionRotated - marks era start
    if (event.section === "staking" && event.method === "SessionRotated") {
      ah.sessionRotatedCount++;
      const activeEra = event.data.activeEra;
      const plannedEra = event.data.plannedEra;
  
      if (!state.started && activeEra !== undefined && plannedEra === activeEra + 1) {
        state.started = true;
        state.eraStartBlock = event.blockNumber;
        ah.activeEra = activeEra;
        ah.plannedEra = plannedEra;
        logger.info(`🎯 Era start detected: active_era=${activeEra}, planned_era=${plannedEra} at block ${event.blockNumber}`);
      }
    }
  
    if (event.section === "multiBlockElection" && event.method === "PhaseTransitioned") {
      const newPhase = extractPhaseName(event.data.to);
      
      const expectedPhaseOrder = ["Snapshot", "Signed", "SignedValidation", "Unsigned", "Done", "Export", "Off"];
      const currentIndex = expectedPhaseOrder.indexOf(ah.phase);
      const newIndex = expectedPhaseOrder.indexOf(newPhase);
  
      if (newIndex > currentIndex) {
        ah.phase = newPhase as Phase;
        logger.info(`📊 Phase transition: ${ah.phase} at block ${event.blockNumber}`);
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
      logger.debug(`✓ Page ${pageIndex} stored at block ${event.blockNumber}`);
    }
  
    if (event.section === "multiBlockElectionSigned" && event.method === "Rewarded") {
      ah.signedRewarded = true;
      logger.info(`💰 Miner rewarded at block ${event.blockNumber}: ${event.data.field_2}`);
    }
  
    if (event.section === "multiBlockElectionVerifier" && event.method === "Verified") {
      ah.verifierVerifiedCount++;
      logger.debug(`✓ Page verified (${ah.verifierVerifiedCount}/${ah.signedStoredPages.length}) at block ${event.blockNumber}`);
    }
  
    if (event.section === "multiBlockElectionVerifier" && event.method === "Queued") {
      ah.verifierQueued = true;
      logger.info(`✓ Solution queued at block ${event.blockNumber}`);
    }
  
    if (event.section === "staking" && event.method === "PagedElectionProceeded") {
      ah.pagedElectionProceededCount++;
      logger.debug(`✓ Page exported (${ah.pagedElectionProceededCount}) at block ${event.blockNumber}`);
    }
  
    if (event.section === "staking" && event.method === "EraPaid") {
      ah.eraPaid = true;
      logger.info(`💰 Era paid: era ${event.data.eraIndex}, payout ${event.data.validatorPayout} at block ${event.blockNumber}`);
    }
  
    if (event.section === "stakingRcClient" && event.method === "SessionReportReceived") {
      if (event.data.activationTimestamp) {
        ah.sessionReportReceived = true;
        logger.info(`✓ Session report with activation timestamp received at block ${event.blockNumber}`);
      }
    }
  
    ah.lastBlockNumber = event.blockNumber;
  }

function processRCEvent(state: EventProcessorState, event: EventRecord): void {
    const rc = state.rc;
  
    if (event.section === "stakingAhClient" && event.method === "ValidatorSetReceived") {
      rc.validatorSetReceived = true;
      rc.lastValidatorSetBlock = event.blockNumber;
      logger.info(`✓ Validator set received on RC at block ${event.blockNumber}`);
    }
  
    if (event.section === "session" && event.method === "NewSession") {
      rc.sessionNewSessionCount++;
      
      if (rc.validatorSetReceived) {
        logger.debug(`✓ New session on RC (${rc.sessionNewSessionCount}) at block ${event.blockNumber}`);
      }
    }
  
    rc.lastBlockNumber = event.blockNumber;
  }

const getEndpoints = (base_path: string) => {
    let ports = JSON.parse(fs.readFileSync(`${base_path}/ports.json`, "utf-8"));
  
    let alice_port = parseInt(ports.alice_port, 10);
    const rc_endpoint = `ws://localhost:${alice_port}`;
  
    let collator_port = parseInt(ports.collator_port, 10);
    const ah_endpoint = `ws://localhost:${collator_port}`;
  
    return {
      rc_endpoint,
      ah_endpoint,
    };
  };
  
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
        verifierVerifiedCount: 0,
        verifierQueued: false,
        pagedElectionProceededCount: 0,
        eraPaid: false,
        sessionReportReceived: false,
        lastBlockNumber: 0,
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

  async function validateAndReport(state: EventProcessorState, network: Network): Promise<void> {
    const ah = state.ah;
    const rc = state.rc;
  
    if (!state.started) {
      return;
    }
  
    // TODO: Validate phase progression
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
  
    // Check for completion - all phases reached and EraPaid
    if (ah.phase === "Off" && ah.eraPaid && rc.validatorSetReceived) {
      state.completed = true;
      logger.info("✅ Era validation completed successfully!");
      logger.info("Final summary:", {
        activeEra: ah.activeEra,
        plannedEra: ah.plannedEra,
        phase: ah.phase,
        signedScores: ah.signedRegisteredCount,
        storedPages: ah.signedStoredPages,
        verifiedPages: ah.verifierVerifiedCount,
        exportedPages: ah.pagedElectionProceededCount,
        validatorSetReceived: rc.validatorSetReceived,
        newSessions: rc.sessionNewSessionCount,
      });
    }
  }

main();
