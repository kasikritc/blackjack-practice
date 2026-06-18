import type {
  SimulatorPreset,
  StrategyEvaluationRunConfig,
  StrategySimulationConfig,
  StrategyRules
} from "@blackjack/shared";

export const DEFAULT_SIM_RULES: StrategyRules = {
  decks: 6,
  dealerHitsSoft17: true,
  dealerPeek: true,
  dealerHoleCard: true,
  blackjackPayout: "3:2",
  doubleRule: "anyTwo",
  doubleAfterSplit: true,
  surrender: "late",
  maxSplitHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  oneCardSplitAces: true,
  insurance: true,
  splitTensByValue: false,
  customRules: {}
};

const generatorBase = (name: string): StrategySimulationConfig => ({
  name,
  seed: `${name}-v1`,
  rules: { ...DEFAULT_SIM_RULES },
  minSamplesPerAction: 10_000,
  maxSamplesPerAction: 100_000,
  batchSize: 1_000,
  shoeSamplesPerBucket: 500,
  maxPolicyIterations: 4,
  minimumEvMargin: 0.0001,
  confidenceZ: 1.96,
  trueCountBuckets: [0],
  decksRemainingBuckets: [5.5],
  trueCountRounding: "nearest"
});

const evaluatorBase = (name: string): StrategyEvaluationRunConfig => ({
  name,
  seed: `${name}-v1`,
  strategy: "builtin:basic-6d-h17-das-ls",
  mode: "continuous-shoe",
  rounds: 1_000_000,
  paths: 200,
  penetrationPercent: 75,
  observerSeats: 1,
  roundsPerHour: 100,
  confidenceZ: 1.96,
  riskBankrollUnits: [50, 100, 200, 500, 1000],
  retention: { mode: "aggregate", sampleEvery: 1000, acknowledgeLargeOutput: false }
});

export const GENERATOR_PRESETS: SimulatorPreset<StrategySimulationConfig>[] = [
  {
    id: "quick",
    name: "Quick Test",
    description: "Fast validation run for configuration and workflow checks.",
    config: {
      ...generatorBase("quick-test"),
      minSamplesPerAction: 20,
      maxSamplesPerAction: 100,
      batchSize: 20,
      shoeSamplesPerBucket: 5,
      maxPolicyIterations: 2,
      minimumEvMargin: 0.001
    }
  },
  {
    id: "standard",
    name: "Standard",
    description: "Balanced exploratory run for reviewing likely strategy decisions.",
    config: generatorBase("standard")
  },
  {
    id: "high-confidence",
    name: "High Confidence",
    description: "Production-quality evidence with the established baseline limits.",
    config: {
      ...generatorBase("high-confidence"),
      minSamplesPerAction: 100_000,
      maxSamplesPerAction: 1_000_000,
      batchSize: 10_000,
      shoeSamplesPerBucket: 1_000,
      maxPolicyIterations: 8
    }
  },
  {
    id: "production",
    name: "Production",
    description: "Maximum-confidence run intended for durable chart generation.",
    config: {
      ...generatorBase("production"),
      minSamplesPerAction: 500_000,
      maxSamplesPerAction: 5_000_000,
      batchSize: 25_000,
      shoeSamplesPerBucket: 5_000,
      maxPolicyIterations: 12,
      minimumEvMargin: 0.00005
    }
  }
];

export const EVALUATOR_PRESETS: SimulatorPreset<StrategyEvaluationRunConfig>[] = [
  {
    id: "quick",
    name: "Quick Test",
    description: "Short sampled run for validating a strategy package and result flow.",
    config: {
      ...evaluatorBase("quick-test"),
      rounds: 10_000,
      paths: 20,
      retention: { mode: "sampled", sampleEvery: 1000, acknowledgeLargeOutput: false }
    }
  },
  {
    id: "standard",
    name: "Standard",
    description: "One million rounds for routine EV and risk inspection.",
    config: evaluatorBase("standard")
  },
  {
    id: "high-confidence",
    name: "High Confidence",
    description: "One hundred million rounds with granular independent paths.",
    config: { ...evaluatorBase("high-confidence"), rounds: 100_000_000, paths: 1000 }
  },
  {
    id: "production",
    name: "Production",
    description: "One billion rounds for final strategy performance evidence.",
    config: { ...evaluatorBase("production"), rounds: 1_000_000_000, paths: 2000 }
  }
];
