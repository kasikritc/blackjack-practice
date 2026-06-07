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

export interface SimulatorRunDetail extends SimulatorRunListItem {
  config: StrategySimulationConfig | StrategyEvaluationRunConfig;
  strategy?: StrategyEvaluationPackage;
  outputDirectory?: string;
  logs: string[];
  artifacts: SimulatorArtifact[];
  reproducibility: SimulatorReproducibility;
  generatorSummary?: StrategySimulationSummary;
  evaluatorSummary?: StrategyEvaluationSummary;
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
