// Basic-strategy rule / chart / subset types. These mirror the JSON persisted in
// the strategy_rule_profiles, strategy_charts and strategy_subsets tables.

export type StrategyAction = "hit" | "stand" | "double" | "split" | "surrender" | "insurance";

export type StrategyCategory = "hard" | "soft" | "pair";

export const STRATEGY_ACTIONS: readonly StrategyAction[] = [
  "hit",
  "stand",
  "double",
  "split",
  "surrender",
  "insurance"
];

export const STRATEGY_DEALER_UPCARDS: readonly string[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "A"
];

export interface StrategyRules {
  decks: number;
  dealerHitsSoft17: boolean;
  dealerPeek: boolean;
  dealerHoleCard: boolean;
  blackjackPayout: string;
  doubleRule: string;
  doubleAfterSplit: boolean;
  surrender: "none" | "late" | "early";
  maxSplitHands: number;
  resplitAces: boolean;
  hitSplitAces: boolean;
  oneCardSplitAces: boolean;
  insurance: boolean;
  splitTensByValue: boolean;
  customRules: Record<string, unknown>;
}

/** A category map: row key (e.g. "h16", "s18", "pA") -> dealer column -> action. */
export type StrategyCellMap = Record<string, Record<string, StrategyAction>>;

export type StrategyFallbackMap = Partial<Record<StrategyCategory, StrategyCellMap>>;

export interface StrategyChart {
  hard: StrategyCellMap;
  soft: StrategyCellMap;
  pair: StrategyCellMap;
  fallbacks?: StrategyFallbackMap;
}

export interface StrategySubsetCriteria {
  categories: StrategyCategory[];
  dealerUpcards: string[];
  cells: string[];
}

export interface StrategyProfile {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  rules: StrategyRules;
}

export interface StrategyChartRecord {
  id: number;
  ruleProfileId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  chart: StrategyChart;
}

export interface StrategySubset {
  id: number;
  chartId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  criteria: StrategySubsetCriteria;
  isDefault: boolean;
}

export interface StrategyData {
  profiles: StrategyProfile[];
  charts: StrategyChartRecord[];
  subsets: StrategySubset[];
}
