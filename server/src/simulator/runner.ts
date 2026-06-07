import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { zstdDecompressSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import type {
  EvaluatorAggregateAnalysis,
  EvaluatorProgress,
  GeneratorCompositionEvidence,
  GeneratorCountStratum,
  GeneratorEvidenceResponse,
  GeneratorInsuranceResult,
  GeneratorProgress,
  SimulatorArtifact,
  SimulatorEvent,
  SimulatorMachineInfo,
  SimulatorProgress,
  SimulatorReproducibility,
  SimulatorRunDetail,
  SimulatorRunListItem,
  SimulatorRunRequest,
  SimulatorServiceHealth,
  SimulatorValidationIssue,
  SimulatorValidationResponse,
  StrategyEvaluationRunConfig,
  StrategyEvaluationSummary,
  StrategySimulationConfig,
  StrategySimulationSummary
} from "@blackjack/shared";
import { ROOT } from "../config.js";
import {
  EVALUATOR_BINARY,
  EVALUATOR_RUNS_DIR,
  GENERATOR_BINARY,
  GENERATOR_RUNS_DIR,
  SIM_CONCURRENCY,
  SIM_JOB_DIR
} from "./config.js";
import { SimulatorStore } from "./store.js";

const CELL_COUNT = 370;

type Listener = (event: SimulatorEvent) => void;

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function bucketSlug(trueCount: number, decksRemaining: number): string {
  return `tc${trueCount >= 0 ? "+" : ""}${trueCount}-dr${decksRemaining.toFixed(2)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeGeneratorSummary(
  output: string,
  summary: StrategySimulationSummary | undefined
): StrategySimulationSummary | undefined {
  if (!summary) return undefined;
  const firstCell = summary.cells[0];
  const legacyChart = readJson<StrategySimulationSummary["charts"][string]>(
    path.join(output, "chart.json")
  );
  const charts =
    summary.charts && Object.keys(summary.charts).length
      ? summary.charts
      : firstCell && legacyChart
        ? { [bucketSlug(firstCell.trueCount, firstCell.decksRemaining)]: legacyChart }
        : {};
  return {
    ...summary,
    charts,
    cells: summary.cells.map(cell => {
      const winningAction = cell.actions.find(action => action.action === cell.bestAction);
      return {
        ...cell,
        meanExactTrueCount: cell.meanExactTrueCount ?? cell.trueCount,
        pairedStandardError: cell.pairedStandardError ?? winningAction?.standardError ?? 0,
        pairedConfidenceLow: cell.pairedConfidenceLow ?? cell.winnerMargin,
        pairedConfidenceHigh: cell.pairedConfidenceHigh ?? cell.winnerMargin,
        confidence: cell.confidence ?? (cell.converged ? "high" : "low"),
        stopReason: cell.stopReason ?? (cell.converged ? "paired-confidence" : "sample-cap")
      };
    })
  };
}

function readZstdJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(zstdDecompressSync(fs.readFileSync(file)).toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

function compactDate(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  }
  return value;
}

function mediaType(file: string): string {
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".jsonl") || file.endsWith(".log")) return "text/plain";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".csv")) return "text/csv";
  if (file.endsWith(".sqlite")) return "application/vnd.sqlite3";
  if (file.endsWith(".zst")) return "application/zstd";
  return "application/octet-stream";
}

function artifactFiles(root: string): SimulatorArtifact[] {
  if (!fs.existsSync(root)) return [];
  const results: SimulatorArtifact[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (results.length >= 1000) return;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const relativePath = path.relative(root, absolute);
        results.push({
          key: relativePath,
          label: relativePath,
          relativePath,
          mediaType: mediaType(entry.name),
          sizeBytes: fs.statSync(absolute).size,
          downloadable: true
        });
      }
    }
  };
  visit(root);
  return results;
}

function safeGit(command: string[]): string | undefined {
  try {
    return execFileSync("git", command, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function machineInfo(): SimulatorMachineInfo {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model,
    cpuCores: os.cpus().length,
    memoryBytes: os.totalmem()
  };
}

function reproducibility(workerThreads?: number): SimulatorReproducibility {
  return {
    gitCommit: safeGit(["rev-parse", "HEAD"]),
    gitDirty: Boolean(safeGit(["status", "--porcelain"])),
    workerThreads,
    machine: machineInfo()
  };
}

function validateGenerator(config: StrategySimulationConfig): SimulatorValidationIssue[] {
  const issues: SimulatorValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ path: field, severity: "error", message });
  if (!config.name?.trim()) error("name", "Name is required.");
  if (!config.seed?.trim()) error("seed", "Seed is required.");
  if (config.minSamplesPerAction <= 0 || config.maxSamplesPerAction < config.minSamplesPerAction)
    error("samples", "Sample limits must be positive and maximum must be at least minimum.");
  if (config.batchSize <= 0 || config.maxSamplesPerAction % config.batchSize !== 0)
    error("batchSize", "Batch size must be positive and divide the maximum sample count.");
  if (config.shoeSamplesPerBucket <= 0)
    error("shoeSamplesPerBucket", "Reachable shoe samples must be positive.");
  if (config.maxPolicyIterations <= 0)
    error("maxPolicyIterations", "Policy iterations must be positive.");
  if (config.minimumEvMargin < 0 || config.confidenceZ <= 0)
    error("convergence", "EV margin must be non-negative and confidence Z must be positive.");
  if (!config.trueCountBuckets.length)
    error("trueCountBuckets", "At least one true-count bucket is required.");
  if (!config.decksRemainingBuckets.length)
    error("decksRemainingBuckets", "At least one decks-remaining bucket is required.");
  if (!config.decksRemainingBuckets.every(value => value > 0 && value <= config.rules.decks))
    error(
      "decksRemainingBuckets",
      "Decks remaining must be positive and no greater than the shoe size."
    );
  if (!config.rules.dealerPeek || !config.rules.dealerHoleCard)
    error("rules", "Only American hole-card games with dealer peek are supported.");
  if (config.rules.decks < 1 || config.rules.decks > 8)
    error("rules.decks", "Deck count must be between 1 and 8.");
  if (config.rules.maxSplitHands < 1 || config.rules.maxSplitHands > 8)
    error("rules.maxSplitHands", "Maximum split hands must be between 1 and 8.");
  if (config.rules.hitSplitAces && config.rules.oneCardSplitAces)
    error("rules.hitSplitAces", "Hit split aces and one-card split aces cannot both be enabled.");
  if (Object.keys(config.rules.customRules || {}).length)
    error("rules.customRules", "Custom rules are not supported by the native simulator.");
  return issues;
}

function validateEvaluator(config: StrategyEvaluationRunConfig): SimulatorValidationIssue[] {
  const issues: SimulatorValidationIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ path: field, severity: "error", message });
  if (!config.name?.trim()) error("name", "Name is required.");
  if (!config.seed?.trim()) error("seed", "Seed is required.");
  if (!["fresh-round", "continuous-shoe"].includes(config.mode))
    error("mode", "Mode must be fresh-round or continuous-shoe.");
  if (config.rounds < 1 || config.paths < 1 || config.paths > config.rounds)
    error("rounds", "Rounds and paths must be positive, with paths no greater than rounds.");
  if (config.penetrationPercent <= 0 || config.penetrationPercent >= 100)
    error("penetrationPercent", "Penetration must be between 0 and 100 percent.");
  if (config.observerSeats < 0 || config.observerSeats > 7)
    error("observerSeats", "Observer seats must be between 0 and 7.");
  if (config.roundsPerHour <= 0 || config.confidenceZ <= 0)
    error("statistics", "Rounds per hour and confidence Z must be positive.");
  if (
    !config.riskBankrollUnits.length ||
    config.riskBankrollUnits.some(value => !Number.isFinite(value) || value <= 0)
  )
    error("riskBankrollUnits", "Risk bankroll thresholds must contain positive finite values.");
  if (config.retention.sampleEvery <= 0)
    error("retention.sampleEvery", "Raw-round sample interval must be positive.");
  if (
    config.retention.mode === "full" &&
    config.rounds > 10_000_000 &&
    !config.retention.acknowledgeLargeOutput
  )
    error(
      "retention.acknowledgeLargeOutput",
      "Full retention above ten million rounds requires acknowledgement."
    );
  return issues;
}

function validateNativeStrategy(request: SimulatorRunRequest): SimulatorValidationIssue[] {
  if (request.workflow !== "evaluator" || !request.strategyPackage) return [];
  if (!fs.existsSync(EVALUATOR_BINARY))
    return [
      {
        path: "strategyPackage",
        severity: "error",
        message: "Native evaluator binary is not built."
      }
    ];
  const directory = fs.mkdtempSync(path.join(SIM_JOB_DIR, "validate-"));
  const file = path.join(directory, "strategy.json");
  try {
    fs.writeFileSync(file, JSON.stringify(request.strategyPackage));
    execFileSync(EVALUATOR_BINARY, ["validate", "--strategy", file], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const ramp = request.strategyPackage.bettingRamp;
    const offTop =
      [...ramp]
        .filter(step => step.atOrAbove <= 0)
        .sort((left, right) => right.atOrAbove - left.atOrAbove)[0]?.units ?? 0;
    const issues: SimulatorValidationIssue[] = [];
    if (request.config.mode === "fresh-round" && offTop <= 0)
      issues.push({
        path: "strategyPackage.bettingRamp",
        severity: "error",
        message: "Fresh-round evaluation must wager above zero at the off-the-top count."
      });
    if (
      request.config.mode === "continuous-shoe" &&
      request.config.observerSeats === 0 &&
      ramp.some(step => step.units === 0)
    )
      issues.push({
        path: "observerSeats",
        severity: "error",
        message: "Continuous zero-bet ramps require at least one observer seat."
      });
    return issues;
  } catch (error) {
    const detail = error as { stderr?: Buffer | string; message?: string };
    const message = String(detail.stderr || detail.message || "Invalid strategy package").trim();
    return [{ path: "strategyPackage", severity: "error", message }];
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export class SimulatorRunner {
  readonly store: SimulatorStore;
  private listeners = new Set<Listener>();
  private children = new Map<string, ChildProcess>();
  private pumping = false;
  private shuttingDown = false;

  constructor(store = new SimulatorStore()) {
    this.store = store;
    fs.mkdirSync(SIM_JOB_DIR, { recursive: true });
    fs.mkdirSync(GENERATOR_RUNS_DIR, { recursive: true });
    fs.mkdirSync(EVALUATOR_RUNS_DIR, { recursive: true });
    this.indexLegacyRuns();
    this.store.markInterruptedForRestart();
    void this.pump();
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    const active = [...this.children.entries()];
    for (const [id] of active) this.store.requeue(id);
    for (const [, child] of active) child.kill("SIGTERM");
    await Promise.all(
      active.map(
        ([, child]) =>
          new Promise<void>(resolve => {
            if (child.exitCode !== null || child.signalCode !== null) return resolve();
            const timeout = setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 4500);
            child.once("close", () => {
              clearTimeout(timeout);
              resolve();
            });
          })
      )
    );
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SimulatorEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  health(): SimulatorServiceHealth {
    return {
      ok: true,
      version: "0.1.0",
      nativeBuildAvailable: fs.existsSync(GENERATOR_BINARY) && fs.existsSync(EVALUATOR_BINARY),
      activeRunId: this.children.keys().next().value,
      queuedRuns: this.store.queued().length,
      concurrency: SIM_CONCURRENCY,
      machine: machineInfo()
    };
  }

  list(includeTrashed = false): SimulatorRunListItem[] {
    return this.store.list(includeTrashed);
  }

  queue(): string[] {
    return this.store.queued().map(run => run.id);
  }

  detail(id: string): SimulatorRunDetail | null {
    const run = this.store.detail(id);
    if (!run) return null;
    const output = run.outputDirectory;
    run.artifacts = output ? artifactFiles(output) : [];
    if (output && run.workflow === "generator")
      run.generatorSummary = normalizeGeneratorSummary(
        output,
        readJson<StrategySimulationSummary>(path.join(output, "simulation-summary.json"))
      );
    if (output && run.workflow === "evaluator")
      run.evaluatorSummary = readJson<StrategyEvaluationSummary>(path.join(output, "summary.json"));
    return run;
  }

  generatorEvidence(id: string): GeneratorEvidenceResponse {
    const run = this.store.detail(id);
    if (!run?.outputDirectory || run.workflow !== "generator")
      throw new Error("Generator run artifacts are not available.");
    return {
      composition:
        readJson<GeneratorCompositionEvidence[]>(
          path.join(run.outputDirectory, "composition-evidence.json")
        ) || [],
      countStrata:
        readJson<GeneratorCountStratum[]>(
          path.join(run.outputDirectory, "count-strata-results.json")
        ) || [],
      insurance:
        readJson<GeneratorInsuranceResult[]>(
          path.join(run.outputDirectory, "insurance-results.json")
        ) || []
    };
  }

  evaluatorAnalysis(id: string): EvaluatorAggregateAnalysis {
    const run = this.store.detail(id);
    if (!run?.outputDirectory || run.workflow !== "evaluator")
      throw new Error("Evaluator aggregate analysis is not available.");
    const analysis = readZstdJson<EvaluatorAggregateAnalysis>(
      path.join(run.outputDirectory, "aggregate-data.json.zst")
    );
    if (!analysis) throw new Error("Evaluator aggregate analysis is not available.");
    return analysis;
  }

  validate(request: SimulatorRunRequest): SimulatorValidationResponse {
    const issues = [
      ...(request.workflow === "generator"
        ? validateGenerator(request.config)
        : validateEvaluator(request.config)),
      ...validateNativeStrategy(request)
    ];
    if (
      request.workerThreads !== undefined &&
      (request.workerThreads < 1 || request.workerThreads > 256)
    )
      issues.push({
        path: "workerThreads",
        severity: "error",
        message: "Worker threads must be between 1 and 256, or omitted to use all CPU cores."
      });
    const command = this.commandFor(request, "<config>", "<output>");
    const estimatedWorkUnits =
      request.workflow === "generator"
        ? request.config.trueCountBuckets.length *
          request.config.decksRemainingBuckets.length *
          CELL_COUNT *
          request.config.maxSamplesPerAction
        : request.config.rounds;
    const estimatedStorageBytes =
      request.workflow === "evaluator"
        ? request.config.retention.mode === "full"
          ? request.config.rounds * 180
          : request.config.retention.mode === "sampled"
            ? Math.ceil(request.config.rounds / request.config.retention.sampleEvery) * 180
            : request.config.paths * 20_000
        : request.config.trueCountBuckets.length *
          request.config.decksRemainingBuckets.length *
          2_000_000;
    return {
      valid: !issues.some(issue => issue.severity === "error"),
      issues,
      normalizedConfig: request.config,
      equivalentCommand: command,
      estimatedWorkUnits,
      estimatedStorageBytes
    };
  }

  submit(request: SimulatorRunRequest): SimulatorRunDetail {
    const validation = this.validate(request);
    if (!validation.valid) throw new Error(validation.issues.map(issue => issue.message).join(" "));
    const id = `sim-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const run = this.store.create(id, request, reproducibility(request.workerThreads));
    this.emit({ type: "run", run });
    this.emit({ type: "queue", queue: this.queue() });
    void this.pump();
    return run;
  }

  cancel(id: string): SimulatorRunDetail {
    const run = this.store.detail(id);
    if (!run) throw new Error("Run not found.");
    if (run.status === "queued") {
      this.store.update(id, {
        status: "cancelled",
        queuePosition: null,
        completedAt: new Date().toISOString()
      });
    } else if (run.status === "running") {
      this.store.update(id, { status: "cancelling" });
      this.children.get(id)?.kill("SIGTERM");
      setTimeout(() => this.children.get(id)?.kill("SIGKILL"), 5000).unref();
    }
    const updated = this.detail(id)!;
    this.emit({ type: "run", run: updated });
    return updated;
  }

  resume(id: string): SimulatorRunDetail {
    const run = this.store.detail(id);
    if (!run) throw new Error("Run not found.");
    if (!["cancelled", "failed", "interrupted"].includes(run.status))
      throw new Error("Only cancelled, failed, or interrupted runs can be resumed.");
    this.store.requeue(id);
    const updated = this.detail(id)!;
    this.emit({ type: "run", run: updated });
    void this.pump();
    return updated;
  }

  rerun(id: string): SimulatorRunDetail {
    const run = this.store.detail(id);
    if (!run) throw new Error("Run not found.");
    const request = {
      workflow: run.workflow,
      name: `${run.name} rerun`,
      config: { ...run.config, name: `${run.name} rerun` },
      strategyPackage: run.strategy,
      workerThreads: run.reproducibility.workerThreads,
      tags: run.tags
    } as SimulatorRunRequest;
    return this.submit(request);
  }

  rename(id: string, name: string): SimulatorRunDetail {
    if (!name.trim()) throw new Error("Name is required.");
    this.store.update(id, { name: name.trim() });
    return this.detail(id)!;
  }

  trash(id: string): SimulatorRunDetail {
    const run = this.store.detail(id);
    if (!run) throw new Error("Run not found.");
    if (["running", "cancelling"].includes(run.status))
      throw new Error("Cancel the run before trashing it.");
    this.store.update(id, {
      status: "trashed",
      trashedAt: new Date().toISOString(),
      queuePosition: null
    });
    return this.detail(id)!;
  }

  restore(id: string): SimulatorRunDetail {
    const run = this.store.detail(id);
    if (!run || run.status !== "trashed") throw new Error("Trashed run not found.");
    const restoredStatus = run.completedAt ? "completed" : "cancelled";
    this.store.update(id, { status: restoredStatus, trashedAt: null });
    return this.detail(id)!;
  }

  purge(id: string): void {
    const run = this.store.detail(id);
    if (!run || run.status !== "trashed")
      throw new Error("Run must be trashed before permanent deletion.");
    if (run.outputDirectory && fs.existsSync(run.outputDirectory))
      fs.rmSync(run.outputDirectory, { recursive: true, force: true });
    const job = path.join(SIM_JOB_DIR, id);
    if (fs.existsSync(job)) fs.rmSync(job, { recursive: true, force: true });
    this.store.remove(id);
  }

  artifactPath(id: string, relativePath: string): string {
    const run = this.store.detail(id);
    if (!run?.outputDirectory) throw new Error("Run has no artifact directory.");
    const root = path.resolve(run.outputDirectory);
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(`${root}${path.sep}`))
      throw new Error("Invalid artifact path.");
    if (!fs.existsSync(target) || !fs.statSync(target).isFile())
      throw new Error("Artifact not found.");
    return target;
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.shuttingDown) return;
    this.pumping = true;
    try {
      while (!this.shuttingDown && this.children.size < SIM_CONCURRENCY) {
        const next = this.store.queued()[0];
        if (!next) break;
        void this.execute(next);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    } finally {
      this.pumping = false;
    }
  }

  private commandFor(
    request: SimulatorRunRequest,
    configPath: string,
    outputPath: string
  ): string[] {
    return request.workflow === "generator"
      ? [GENERATOR_BINARY, "run", "--config", configPath, "--output", outputPath]
      : [EVALUATOR_BINARY, "run", "--config", configPath, "--output", outputPath];
  }

  private async execute(run: SimulatorRunDetail): Promise<void> {
    const started = Date.now();
    const jobDirectory = path.join(SIM_JOB_DIR, run.id);
    const outputBase = path.join(
      run.workflow === "generator" ? GENERATOR_RUNS_DIR : EVALUATOR_RUNS_DIR,
      ".ui",
      run.id
    );
    fs.mkdirSync(jobDirectory, { recursive: true });
    fs.mkdirSync(outputBase, { recursive: true });
    const configPath = path.join(jobDirectory, "config.json");
    const config = structuredClone(run.config) as unknown as Record<string, unknown>;
    if (run.workflow === "evaluator" && run.strategy) {
      const strategyPath = path.join(jobDirectory, "strategy.json");
      fs.writeFileSync(strategyPath, `${JSON.stringify(run.strategy, null, 2)}\n`);
      config.strategy = strategyPath;
    }
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    let command = this.commandFor(
      { workflow: run.workflow, name: run.name, config: run.config } as SimulatorRunRequest,
      configPath,
      outputBase
    );
    if (run.workflow === "evaluator" && run.outputDirectory && fs.existsSync(run.outputDirectory))
      command = [EVALUATOR_BINARY, "run", "--config", configPath, "--resume", run.outputDirectory];
    this.store.update(run.id, {
      status: "running",
      startedAt: new Date().toISOString(),
      queuePosition: null,
      error: null,
      reproducibility: { ...run.reproducibility, command }
    });
    this.emit({ type: "run", run: this.detail(run.id)! });
    const [binary, ...args] = command;
    const child = spawn(binary, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        OMP_NUM_THREADS: String(run.reproducibility.workerThreads || os.cpus().length)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.children.set(run.id, child);
    const poll = setInterval(() => this.pollProgress(run.id, outputBase), 750);
    const consume = (stream: NodeJS.ReadableStream, source: string) => {
      const lines = readline.createInterface({ input: stream });
      lines.on("line", line => this.onProcessLine(run.id, outputBase, source, line));
    };
    if (child.stdout) consume(child.stdout, "stdout");
    if (child.stderr) consume(child.stderr, "stderr");
    child.on("error", error => this.store.appendLog(run.id, `process: ${error.message}`));
    child.on("close", code => {
      clearInterval(poll);
      this.children.delete(run.id);
      this.pollProgress(run.id, outputBase);
      if (this.shuttingDown) return;
      const current = this.store.detail(run.id)!;
      const cancelled = current.status === "cancelling";
      const completedAt = new Date().toISOString();
      this.store.update(run.id, {
        status: cancelled ? "cancelled" : code === 0 ? "completed" : "failed",
        completedAt,
        elapsedMs: Date.now() - started,
        error:
          cancelled || code === 0 ? null : `Native process exited with code ${code ?? "unknown"}.`
      });
      this.emit({ type: "run", run: this.detail(run.id)! });
      this.emit({ type: "queue", queue: this.queue() });
      void this.pump();
    });
  }

  private onProcessLine(id: string, outputBase: string, source: string, line: string): void {
    const logLine = `${source}: ${line}`;
    this.store.appendLog(id, logLine);
    this.emit({ type: "log", runId: id, line: logLine });
    if (line.startsWith("SIM_PROGRESS ")) {
      try {
        const progress = JSON.parse(line.slice("SIM_PROGRESS ".length)) as SimulatorProgress;
        this.store.update(id, { progress });
        this.emit({ type: "progress", runId: id, progress });
      } catch {
        // Keep malformed native diagnostic output in the log without failing the run.
      }
    }
    if (path.isAbsolute(line.trim()) && fs.existsSync(line.trim()))
      this.store.update(id, { outputDirectory: line.trim() });
    else this.discoverOutput(id, outputBase);
  }

  private discoverOutput(id: string, outputBase: string): string | undefined {
    if (!fs.existsSync(outputBase)) return undefined;
    const directories = fs
      .readdirSync(outputBase, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(outputBase, entry.name));
    const output = directories.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (output) this.store.update(id, { outputDirectory: output });
    return output;
  }

  private pollProgress(id: string, outputBase: string): void {
    const run = this.store.detail(id);
    if (!run) return;
    const output = run.outputDirectory || this.discoverOutput(id, outputBase);
    if (run.workflow === "evaluator") {
      const config = run.config as StrategyEvaluationRunConfig;
      const completedPaths =
        output && fs.existsSync(path.join(output, "checkpoints"))
          ? fs
              .readdirSync(path.join(output, "checkpoints"))
              .filter(file => file.endsWith(".json.zst")).length
          : 0;
      const progress: EvaluatorProgress = {
        workflow: "evaluator",
        completedPaths,
        totalPaths: config.paths,
        completedRounds: Math.floor((completedPaths / config.paths) * config.rounds),
        totalRounds: config.rounds
      };
      this.store.update(id, { progress });
      this.emit({ type: "progress", runId: id, progress });
    } else if (!run.progress) {
      const config = run.config as StrategySimulationConfig;
      const progress: GeneratorProgress = {
        workflow: "generator",
        bucketIndex: 0,
        bucketCount: config.trueCountBuckets.length * config.decksRemainingBuckets.length,
        completedCells: 0,
        totalCells: CELL_COUNT
      };
      this.store.update(id, { progress });
    }
  }

  private indexLegacyRuns(): void {
    const indexDirectory = (base: string, workflow: "generator" | "evaluator") => {
      if (!fs.existsSync(base)) return;
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const directory = path.join(base, entry.name);
        const manifest = readJson<Record<string, any>>(path.join(directory, "manifest.json"));
        if (!manifest) continue;
        const summaryExists = fs.existsSync(
          path.join(
            directory,
            workflow === "generator" ? "simulation-summary.json" : "summary.json"
          )
        );
        this.store.importLegacy({
          id: String(manifest.id || entry.name),
          name: String(manifest.config?.name || manifest.id || entry.name),
          workflow,
          status: summaryExists || manifest.status === "completed" ? "completed" : "interrupted",
          createdAt: compactDate(manifest.createdAt),
          completedAt: manifest.completedAt ? compactDate(manifest.completedAt) : undefined,
          elapsedMs: Number(manifest.elapsedMs) || undefined,
          config: manifest.config || {},
          strategy: manifest.strategy,
          outputDirectory: directory,
          reproducibility: {
            gitCommit: manifest.gitCommit,
            simulatorVersion: manifest.simulatorVersion || manifest.evaluatorVersion,
            workerThreads: manifest.workerThreads || manifest.hardware?.workerThreads,
            machine: manifest.hardware
          }
        });
      }
    };
    indexDirectory(GENERATOR_RUNS_DIR, "generator");
    indexDirectory(EVALUATOR_RUNS_DIR, "evaluator");
  }
}
