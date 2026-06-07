import type { StrategyAction, StrategyCategory, StrategyChart, StrategyRules } from "./strategy.js";

export type EvaluationAction = Exclude<StrategyAction, "insurance">;
export type ThresholdComparison = "atOrAbove" | "atOrBelow";
export type SideDecision = "take" | "decline";

export interface StrategyCountDeviation {
  category: StrategyCategory;
  rowKey: string;
  dealerUpcard: string;
  comparison: ThresholdComparison;
  trueCount: number;
  action: EvaluationAction;
  fallback?: "hit" | "stand";
}

export interface StrategySideDecisionPolicy {
  base: SideDecision;
  deviations: Array<{
    comparison: ThresholdComparison;
    trueCount: number;
    decision: SideDecision;
  }>;
}

export interface StrategyBetStep {
  atOrAbove: number;
  units: number;
}

export interface StrategyEvaluationPackage {
  schemaVersion: 1;
  id: string;
  name: string;
  rules: StrategyRules;
  trueCountRounding: "nearest" | "truncate" | "floor";
  chart: Omit<StrategyChart, "fallbacks">;
  fallbacks: NonNullable<StrategyChart["fallbacks"]>;
  deviations: StrategyCountDeviation[];
  insurance: StrategySideDecisionPolicy;
  evenMoney: StrategySideDecisionPolicy;
  bettingRamp: StrategyBetStep[];
}

export interface StrategyEvaluationRunConfig {
  name: string;
  seed: string;
  strategy: string;
  mode: "fresh-round" | "continuous-shoe";
  rounds: number;
  paths: number;
  penetrationPercent: number;
  observerSeats: number;
  roundsPerHour: number;
  confidenceZ: number;
  riskBankrollUnits: number[];
  retention: {
    mode: "aggregate" | "sampled" | "full";
    sampleEvery: number;
    acknowledgeLargeOutput: boolean;
  };
}

export interface StrategyEvaluationSummary {
  strategyId: string;
  mode: StrategyEvaluationRunConfig["mode"];
  tableRounds: number;
  wageredRounds: number;
  initialWagers: number;
  totalExposure: number;
  netProfitUnits: number;
  playerEv: number;
  houseEdge: number;
  profitPerTableRound: number;
  profitPerUnitExposed: number;
  variancePerWageredRound: number;
  standardDeviationPerWageredRound: number;
  standardError: number;
  confidenceLow: number;
  confidenceHigh: number;
  unitsPerHour: number;
  outcomeRates: Record<string, number>;
  riskOfRuin: Array<{
    bankrollUnits: number;
    ruinProbability: number;
    horizonRoundsPerPath: number;
  }>;
  maxDrawdownUnits: number;
  artifactVersion: number;
}
