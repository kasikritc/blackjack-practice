import type { StrategyAction, StrategyChart, StrategyRules } from "./strategy.js";

export type StrategySimulationConfidence = "high" | "low";
export type StrategySimulationStopReason =
  | "paired-confidence"
  | "sample-cap"
  | "single-legal-action"
  | "policy-iteration-cap";

export interface StrategySimulationConfig {
  name: string;
  seed: string;
  rules: StrategyRules;
  minSamplesPerAction: number;
  maxSamplesPerAction: number;
  batchSize: number;
  shoeSamplesPerBucket: number;
  maxPolicyIterations: number;
  minimumEvMargin: number;
  confidenceZ: number;
  trueCountBuckets: number[];
  decksRemainingBuckets: number[];
  trueCountRounding: "nearest" | "truncate";
}

export interface StrategySimulationHardware {
  cpu?: string;
  gpu?: string;
  cuda?: string;
  workerThreads?: number;
}

export interface StrategySimulationManifest {
  id: string;
  createdAt: string;
  elapsedMs?: number;
  simulatorVersion: string;
  gitCommit?: string;
  config: StrategySimulationConfig;
  hardware?: StrategySimulationHardware;
  capabilities?: {
    gameFamily: "american-peek";
    totalDependent: boolean;
    compositionEvidence: boolean;
    insuranceSideDecision: boolean;
  };
}

export interface StrategySimulationActionStats {
  action: StrategyAction;
  legal: boolean;
  samples: number;
  ev: number;
  standardError: number;
  confidenceLow: number;
  confidenceHigh: number;
  winRate: number;
  lossRate: number;
  pushRate: number;
  blackjackRate: number;
  bustRate: number;
  surrenderRate: number;
  doubleRate: number;
  splitRate: number;
  averageSplitHands: number;
}

export interface StrategySimulationCellResult {
  category: "hard" | "soft" | "pair";
  rowKey: string;
  dealerUpcard: string;
  trueCount: number;
  meanExactTrueCount: number;
  decksRemaining: number;
  bestAction: StrategyAction;
  winnerMargin: number;
  pairedStandardError: number;
  pairedConfidenceLow: number;
  pairedConfidenceHigh: number;
  samples: number;
  converged: boolean;
  confidence: StrategySimulationConfidence;
  stopReason: StrategySimulationStopReason;
  policyIteration: number;
  actions: StrategySimulationActionStats[];
}

export interface StrategySimulationSummary {
  manifest: StrategySimulationManifest;
  charts: Record<string, StrategyChart>;
  cells: StrategySimulationCellResult[];
}

export interface StrategyChartImportPackage {
  schemaVersion: 1;
  name: string;
  rules: StrategyRules;
  chart: StrategyChart;
  cells: StrategySimulationCellResult[];
  source: {
    simulatorRunId: string;
    seed: string;
    trueCount: number;
    decksRemaining: number;
    artifactPath?: string;
  };
  validation: {
    gameFamily: "american-peek";
    fullySupported: boolean;
    allCellsConverged: boolean;
    totalDependent: boolean;
  };
}

export interface StrategyChartImportRequest extends StrategyChartImportPackage {
  baseChartId?: number;
  selectedCellKeys?: string[];
}

export interface StrategyChartImportResponse {
  id: number;
  ruleProfileId: number;
  chartId: number;
}
