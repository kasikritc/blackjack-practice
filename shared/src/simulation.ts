import type { StrategyAction, StrategyChart, StrategyRules } from "./strategy.js";

export interface StrategySimulationConfig {
  name: string;
  seed: string;
  rules: StrategyRules;
  samplesPerAction: number;
  policySamplesPerDecision?: number;
  trueCountBuckets: number[];
  decksRemainingBuckets: number[];
  maxPolicyIterations: number;
  convergenceEpsilon: number;
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
  simulatorVersion: string;
  gitCommit?: string;
  config: StrategySimulationConfig;
  hardware?: StrategySimulationHardware;
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
  decksRemaining: number;
  bestAction: StrategyAction;
  winnerMargin: number;
  samples: number;
  converged: boolean;
  policyIteration: number;
  actions: StrategySimulationActionStats[];
}

export interface StrategySimulationSummary {
  manifest: StrategySimulationManifest;
  chart: StrategyChart;
  cells: StrategySimulationCellResult[];
}

export interface StrategyChartImportRequest {
  name: string;
  rules: StrategyRules;
  chart: StrategyChart;
  source?: {
    simulatorRunId?: string;
    seed?: string;
    trueCount?: number;
    artifactPath?: string;
  };
}

export interface StrategyChartImportResponse {
  id: number;
  ruleProfileId: number;
  chartId: number;
}
