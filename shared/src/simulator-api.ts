import type {
  StrategyEvaluationPackage,
  StrategyEvaluationRunConfig,
  StrategyEvaluationSummary
} from "./evaluation.js";
import type {
  StrategyChartImportPackage,
  StrategySimulationCellResult,
  StrategySimulationConfig,
  StrategySimulationSummary
} from "./simulation.js";

export type SimulatorWorkflow = "generator" | "evaluator";
export type SimulatorRunStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed"
  | "interrupted"
  | "trashed";
export type SimulatorPresetId = "quick" | "standard" | "high-confidence" | "production";

export interface SimulatorPreset<TConfig> {
  id: SimulatorPresetId;
  name: string;
  description: string;
  config: TConfig;
}

export interface SimulatorPresetsResponse {
  generator: SimulatorPreset<StrategySimulationConfig>[];
  evaluator: SimulatorPreset<StrategyEvaluationRunConfig>[];
}

export interface SimulatorMachineInfo {
  hostname?: string;
  platform?: string;
  release?: string;
  architecture?: string;
  cpu?: string;
  cpuCores?: number;
  memoryBytes?: number;
  gpu?: string;
  cuda?: string;
}

export interface SimulatorReproducibility {
  gitCommit?: string;
  gitDirty?: boolean;
  simulatorVersion?: string;
  command?: string[];
  workerThreads?: number;
  machine?: SimulatorMachineInfo;
}

export interface SimulatorArtifact {
  key: string;
  label: string;
  relativePath: string;
  mediaType: string;
  sizeBytes: number;
  downloadable: boolean;
}

export interface GeneratorProgress {
  workflow: "generator";
  trueCount?: number;
  decksRemaining?: number;
  bucketIndex: number;
  bucketCount: number;
  policyIteration?: number;
  maxPolicyIterations?: number;
  completedCells: number;
  totalCells: number;
  currentCell?: Pick<
    StrategySimulationCellResult,
    | "category"
    | "rowKey"
    | "dealerUpcard"
    | "samples"
    | "bestAction"
    | "winnerMargin"
    | "pairedConfidenceLow"
    | "pairedConfidenceHigh"
    | "converged"
    | "stopReason"
  >;
  convergedCells?: number;
}

export interface EvaluatorProgress {
  workflow: "evaluator";
  completedPaths: number;
  totalPaths: number;
  completedRounds: number;
  totalRounds: number;
  roundsPerSecond?: number;
  playerEv?: number;
  confidenceLow?: number;
  confidenceHigh?: number;
}

export type SimulatorProgress = GeneratorProgress | EvaluatorProgress;

export interface SimulatorRunListItem {
  id: string;
  name: string;
  workflow: SimulatorWorkflow;
  status: SimulatorRunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  queuePosition?: number;
  progress?: SimulatorProgress;
  tags: string[];
  error?: string;
  trashedAt?: string;
}

export interface GeneratorCompositionEvidence {
  kind: "counterfactual-start" | "continuation-observation";
  category?: string;
  sourceCategory?: string;
  rowKey?: string;
  sourceRowKey?: string;
  dealerUpcard: string;
  trueCount: number;
  decksRemaining: number;
  composition?: string;
  state?: string;
  action?: string;
  selectedAction?: string;
  samples?: number;
  observations?: number;
  ev?: number;
  standardError?: number;
}

export interface GeneratorCountStratum {
  category: string;
  rowKey: string;
  dealerUpcard: string;
  trueCount?: number;
  decksRemaining: number;
  runningCount: number;
  exactTrueCount: number;
  action: string;
  samples: number;
  ev: number;
  standardError: number;
}

export interface GeneratorInsuranceResult {
  trueCount: number;
  decksRemaining: number;
  dealerBlackjackProbability: number;
  takeEv: number;
  declineEv: number;
  bestDecision: "take" | "decline";
  samples: number;
}

export interface GeneratorEvidenceResponse {
  composition: GeneratorCompositionEvidence[];
  countStrata: GeneratorCountStratum[];
  insurance: GeneratorInsuranceResult[];
}

export interface EvaluatorAggregateStats {
  rounds: number;
  wageredRounds: number;
  profit: number;
  profitSquared: number;
  initialWagers: number;
  exposure: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  dealerBlackjacks: number;
  busts: number;
  surrenders: number;
  doubles: number;
  splits: number;
  insuranceTaken: number;
  evenMoneyTaken: number;
}

export interface EvaluatorAggregateAnalysis {
  artifactVersion: number;
  evaluatorVersion: string;
  strategyId: string;
  mode: StrategyEvaluationRunConfig["mode"];
  confidenceZ: number;
  roundsPerHour: number;
  totals: EvaluatorAggregateStats;
  pathEvs: number[];
  paths: Array<{ path: number; stats: EvaluatorAggregateStats; maxDrawdown: number }>;
  cubes: Array<{ key: string; stats: EvaluatorAggregateStats }>;
  risk: StrategyEvaluationSummary["riskOfRuin"];
  maxDrawdownUnits: number;
}

export interface EvaluatorRawRecord {
  recordVersion: number;
  path: number;
  round: number;
  shoe: number;
  trueCount: number;
  depthPercent: number;
  runningCountBefore: number;
  runningCountAfter: number;
  cardsRemainingBefore: number;
  cardsRemainingAfter: number;
  cardsConsumed: number;
  wager: number;
  initialWager?: number;
  exposure?: number;
  profit: number;
  hands?: number;
  wins?: number;
  losses?: number;
  pushes?: number;
  busts?: number;
  doubles?: number;
  surrenders?: number;
  splits?: number;
  playerBlackjack?: boolean;
  dealerBlackjack?: boolean;
  insuranceTaken?: boolean;
  insuranceProfit?: number;
  evenMoneyTaken?: boolean;
  observed: boolean;
}

export interface EvaluatorRawRecordsResponse {
  files: string[];
  selectedFile?: string;
  offset: number;
  limit: number;
  hasMore: boolean;
  records: EvaluatorRawRecord[];
}

export interface SimulatorRunDetail extends SimulatorRunListItem {
  config: StrategySimulationConfig | StrategyEvaluationRunConfig;
  strategy?: StrategyEvaluationPackage;
  outputDirectory?: string;
  logs: string[];
  artifacts: SimulatorArtifact[];
  reproducibility: SimulatorReproducibility;
  generatorSummary?: StrategySimulationSummary;
  generatorCompositionEvidence?: GeneratorCompositionEvidence[];
  generatorCountStrata?: GeneratorCountStratum[];
  generatorInsuranceResults?: GeneratorInsuranceResult[];
  evaluatorSummary?: StrategyEvaluationSummary;
  evaluatorAnalysis?: EvaluatorAggregateAnalysis;
}

export interface SimulatorRunsResponse {
  runs: SimulatorRunListItem[];
  queue: string[];
}

export interface GeneratorRunRequest {
  workflow: "generator";
  name: string;
  presetId?: SimulatorPresetId;
  config: StrategySimulationConfig;
  workerThreads?: number;
  tags?: string[];
}

export interface EvaluatorRunRequest {
  workflow: "evaluator";
  name: string;
  presetId?: SimulatorPresetId;
  config: StrategyEvaluationRunConfig;
  strategyPackage?: StrategyEvaluationPackage;
  workerThreads?: number;
  tags?: string[];
}

export type SimulatorRunRequest = GeneratorRunRequest | EvaluatorRunRequest;

export interface SimulatorValidationIssue {
  path: string;
  severity: "error" | "warning";
  message: string;
}

export interface SimulatorValidationResponse {
  valid: boolean;
  issues: SimulatorValidationIssue[];
  normalizedConfig?: StrategySimulationConfig | StrategyEvaluationRunConfig;
  equivalentCommand?: string[];
  estimatedWorkUnits?: number;
  estimatedStorageBytes?: number;
}

export interface SimulatorServiceHealth {
  ok: boolean;
  version: string;
  nativeBuildAvailable: boolean;
  cudaDevices?: number;
  activeRunId?: string;
  queuedRuns: number;
  concurrency: number;
  machine: SimulatorMachineInfo;
}

export interface SimulatorStrategySource {
  id: string;
  kind: "builtin" | "saved-chart" | "generated-bucket" | "uploaded";
  name: string;
  description: string;
  package?: StrategyEvaluationPackage;
  generatorRunId?: string;
  bucketKey?: string;
}

export interface SimulatorStrategySourcesResponse {
  sources: SimulatorStrategySource[];
}

export interface GeneratorCellComparison {
  key: string;
  left?: StrategySimulationCellResult;
  right?: StrategySimulationCellResult;
  actionChanged: boolean;
  evDelta?: number;
  sampleDelta?: number;
}

export interface GeneratorComparison {
  workflow: "generator";
  compatible: boolean;
  warnings: string[];
  leftRunId: string;
  rightRunId: string;
  leftBucket: string;
  rightBucket: string;
  cells: GeneratorCellComparison[];
}

export interface EvaluatorComparison {
  workflow: "evaluator";
  compatible: boolean;
  paired: boolean;
  warnings: string[];
  leftRunId: string;
  rightRunId: string;
  metrics: Record<string, { left: number; right: number; delta: number }>;
  pairedDifference?: {
    paths: number;
    meanDelta: number;
    standardError: number;
    confidenceLow: number;
    confidenceHigh: number;
    minimum: number;
    maximum: number;
    positivePaths: number;
  };
}

export type SimulatorComparison = GeneratorComparison | EvaluatorComparison;

export interface SimulatorComparisonRequest {
  leftRunId: string;
  rightRunId: string;
  leftBucket?: string;
  rightBucket?: string;
}

export interface StrategyImportReview {
  package: StrategyChartImportPackage;
  currentChartId?: number;
  minimumWinnerMargin?: number;
  acknowledgedCellKeys: string[];
  confirmed: boolean;
}

export type SimulatorEvent =
  | { type: "snapshot"; runs: SimulatorRunListItem[]; queue: string[] }
  | { type: "run"; run: SimulatorRunListItem }
  | { type: "progress"; runId: string; progress: SimulatorProgress }
  | { type: "log"; runId: string; line: string }
  | { type: "queue"; queue: string[] };
