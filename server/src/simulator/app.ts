import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import Database from "better-sqlite3";
import type {
  EvaluatorAggregateAnalysis,
  EvaluatorComparison,
  GeneratorComparison,
  SimulatorComparisonRequest,
  SimulatorEvent,
  SimulatorRunRequest,
  SimulatorStrategySource,
  StrategyChartImportPackage,
  StrategyEvaluationPackage,
  StrategyEvaluationSummary,
  StrategySimulationCellResult,
  StrategySimulationSummary
} from "@blackjack/shared";
import { DB_PATH } from "../config.js";
import { makeStrategyEvaluationPackage } from "../domain/evaluationPackage.js";
import { EVALUATOR_PRESETS, GENERATOR_PRESETS } from "./presets.js";
import { SimulatorRunner } from "./runner.js";
import { STRATEGIES_DIR } from "./config.js";

function jsonFile<T>(file: string): T | undefined {
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

function generatorComparison(
  leftRunId: string,
  rightRunId: string,
  left: StrategySimulationSummary,
  right: StrategySimulationSummary,
  leftBucket?: string,
  rightBucket?: string
): GeneratorComparison {
  const firstLeft = Object.keys(left.charts)[0] || "";
  const firstRight = Object.keys(right.charts)[0] || "";
  const selectedLeft = leftBucket || firstLeft;
  const selectedRight = rightBucket || firstRight;
  const leftCells = new Map<string, StrategySimulationCellResult>();
  const rightCells = new Map<string, StrategySimulationCellResult>();
  const add = (
    target: Map<string, StrategySimulationCellResult>,
    cells: StrategySimulationCellResult[],
    bucket: string
  ) => {
    for (const cell of cells) {
      if (bucketSlug(cell.trueCount, cell.decksRemaining) !== bucket) continue;
      target.set(`${cell.category}:${cell.rowKey}:${cell.dealerUpcard}`, cell);
    }
  };
  add(leftCells, left.cells, selectedLeft);
  add(rightCells, right.cells, selectedRight);
  const keys = [...new Set([...leftCells.keys(), ...rightCells.keys()])].sort();
  const compatible =
    JSON.stringify(left.manifest.config.rules) === JSON.stringify(right.manifest.config.rules);
  return {
    workflow: "generator",
    compatible,
    warnings: compatible
      ? []
      : ["Rule profiles differ; action and EV deltas are descriptive only."],
    leftRunId,
    rightRunId,
    leftBucket: selectedLeft,
    rightBucket: selectedRight,
    cells: keys.map(key => {
      const leftCell = leftCells.get(key);
      const rightCell = rightCells.get(key);
      const leftEv = leftCell?.actions.find(action => action.action === leftCell.bestAction)?.ev;
      const rightEv = rightCell?.actions.find(action => action.action === rightCell.bestAction)?.ev;
      return {
        key,
        left: leftCell,
        right: rightCell,
        actionChanged: leftCell?.bestAction !== rightCell?.bestAction,
        evDelta: leftEv === undefined || rightEv === undefined ? undefined : rightEv - leftEv,
        sampleDelta:
          leftCell === undefined || rightCell === undefined
            ? undefined
            : rightCell.samples - leftCell.samples
      };
    })
  };
}

function evaluatorComparison(
  leftRunId: string,
  rightRunId: string,
  left: StrategyEvaluationSummary,
  right: StrategyEvaluationSummary,
  leftConfig: Record<string, unknown>,
  rightConfig: Record<string, unknown>,
  leftAnalysis?: EvaluatorAggregateAnalysis,
  rightAnalysis?: EvaluatorAggregateAnalysis,
  rulesCompatible = true
): EvaluatorComparison {
  const metricKeys = [
    "playerEv",
    "houseEdge",
    "netProfitUnits",
    "profitPerTableRound",
    "profitPerUnitExposed",
    "variancePerWageredRound",
    "standardDeviationPerWageredRound",
    "standardError",
    "confidenceLow",
    "confidenceHigh",
    "unitsPerHour",
    "maxDrawdownUnits"
  ] as const;
  const metrics: EvaluatorComparison["metrics"] = {};
  for (const key of metricKeys) {
    const leftValue = Number(left[key]);
    const rightValue = Number(right[key]);
    metrics[key] = { left: leftValue, right: rightValue, delta: rightValue - leftValue };
  }
  const paired =
    leftConfig.seed === rightConfig.seed &&
    leftConfig.paths === rightConfig.paths &&
    leftConfig.rounds === rightConfig.rounds &&
    leftConfig.mode === rightConfig.mode;
  const compatible =
    left.mode === right.mode &&
    leftConfig.rounds === rightConfig.rounds &&
    leftConfig.paths === rightConfig.paths &&
    leftConfig.penetrationPercent === rightConfig.penetrationPercent &&
    leftConfig.observerSeats === rightConfig.observerSeats &&
    rulesCompatible;
  let pairedDifference: EvaluatorComparison["pairedDifference"];
  if (
    paired &&
    leftAnalysis &&
    rightAnalysis &&
    leftAnalysis.pathEvs.length === rightAnalysis.pathEvs.length &&
    leftAnalysis.pathEvs.length > 0
  ) {
    const deltas = rightAnalysis.pathEvs.map((value, index) => value - leftAnalysis.pathEvs[index]);
    const meanDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
    const variance =
      deltas.length > 1
        ? deltas.reduce((sum, value) => sum + (value - meanDelta) ** 2, 0) / (deltas.length - 1)
        : 0;
    const standardError = Math.sqrt(variance / deltas.length);
    const z = leftAnalysis.confidenceZ || 1.96;
    pairedDifference = {
      paths: deltas.length,
      meanDelta,
      standardError,
      confidenceLow: meanDelta - z * standardError,
      confidenceHigh: meanDelta + z * standardError,
      minimum: Math.min(...deltas),
      maximum: Math.max(...deltas),
      positivePaths: deltas.filter(value => value > 0).length
    };
  }
  return {
    workflow: "evaluator",
    compatible,
    paired,
    warnings: [
      ...(compatible ? [] : ["Evaluation modes differ."]),
      ...(paired ? [] : ["Seeds or path structures differ; this is an unpaired comparison."])
    ],
    leftRunId,
    rightRunId,
    metrics,
    pairedDifference
  };
}

function savedChartSources(): SimulatorStrategySource[] {
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    const rows = db
      .prepare(
        `
        SELECT c.id, c.name, c.chart_json, p.rules_json
        FROM strategy_charts c
        JOIN strategy_rule_profiles p ON p.id = c.rule_profile_id
        ORDER BY c.name
      `
      )
      .all() as Array<{ id: number; name: string; chart_json: string; rules_json: string }>;
    db.close();
    return rows.map(row => ({
      id: `saved-chart:${row.id}`,
      kind: "saved-chart",
      name: row.name,
      description: "Chart saved in Basic Strategy.",
      package: makeStrategyEvaluationPackage({
        chartId: row.id,
        name: row.name,
        chart: JSON.parse(row.chart_json),
        rules: JSON.parse(row.rules_json)
      })
    }));
  } catch {
    return [];
  }
}

export function createSimulatorApp(runner = new SimulatorRunner()) {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "8mb" }));

  app.get("/sim-api/health", (_req, res) => res.json(runner.health()));
  app.get("/sim-api/presets", (_req, res) =>
    res.json({ generator: GENERATOR_PRESETS, evaluator: EVALUATOR_PRESETS })
  );
  app.get("/sim-api/runs", (req, res) =>
    res.json({ runs: runner.list(req.query.trashed === "true"), queue: runner.queue() })
  );
  app.post("/sim-api/validate", (req, res) =>
    res.json(runner.validate(req.body as SimulatorRunRequest))
  );
  app.post("/sim-api/runs", (req, res) =>
    res.status(201).json(runner.submit(req.body as SimulatorRunRequest))
  );
  app.get("/sim-api/runs/:id", (req, res) => {
    const run = runner.detail(req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found." });
    res.json(run);
  });
  app.patch("/sim-api/runs/:id", (req, res) =>
    res.json(runner.rename(req.params.id, String(req.body?.name || "")))
  );
  app.post("/sim-api/runs/:id/cancel", (req, res) => res.json(runner.cancel(req.params.id)));
  app.post("/sim-api/runs/:id/resume", (req, res) => res.json(runner.resume(req.params.id)));
  app.post("/sim-api/runs/:id/rerun", (req, res) =>
    res.status(201).json(runner.rerun(req.params.id))
  );
  app.post("/sim-api/runs/:id/trash", (req, res) => res.json(runner.trash(req.params.id)));
  app.post("/sim-api/runs/:id/restore", (req, res) => res.json(runner.restore(req.params.id)));
  app.delete("/sim-api/runs/:id", (req, res) => {
    runner.purge(req.params.id);
    res.status(204).end();
  });
  app.get("/sim-api/runs/:id/generator-evidence", (req, res) =>
    res.json(runner.generatorEvidence(req.params.id))
  );
  app.get("/sim-api/runs/:id/evaluator-analysis", (req, res) =>
    res.json(runner.evaluatorAnalysis(req.params.id))
  );
  app.get("/sim-api/runs/:id/evaluator-raw", async (req, res, next) => {
    try {
      res.json(
        await runner.evaluatorRawRecords(
          req.params.id,
          typeof req.query.file === "string" ? req.query.file : undefined,
          Number(req.query.offset || 0),
          Number(req.query.limit || 100)
        )
      );
    } catch (error) {
      next(error);
    }
  });
  app.post("/sim-api/runs/:id/summarize", (req, res) =>
    res.json(runner.regenerateEvaluatorSummary(req.params.id))
  );
  app.get("/sim-api/runs/:id/artifacts/*", (req, res) => {
    const relativePath = (req.params as Record<string, string>)[0];
    const file = runner.artifactPath(req.params.id, relativePath);
    res.download(file, path.basename(file));
  });

  app.get("/sim-api/strategy-sources", (_req, res) => {
    const sources: SimulatorStrategySource[] = [];
    if (fs.existsSync(STRATEGIES_DIR)) {
      for (const file of fs.readdirSync(STRATEGIES_DIR).filter(name => name.endsWith(".json"))) {
        const packageBody = jsonFile<StrategyEvaluationPackage>(path.join(STRATEGIES_DIR, file));
        if (!packageBody) continue;
        sources.push({
          id: `builtin:${file.slice(0, -5)}`,
          kind: "builtin",
          name: packageBody.name,
          description: "Built-in strict evaluation package.",
          package: packageBody
        });
      }
    }
    sources.push(...savedChartSources());
    for (const run of runner.list()) {
      if (run.workflow !== "generator" || run.status !== "completed") continue;
      const detail = runner.detail(run.id);
      if (!detail?.outputDirectory) continue;
      for (const artifact of detail.artifacts.filter(item =>
        item.relativePath.endsWith(".import-package.json")
      )) {
        const generated = jsonFile<StrategyChartImportPackage>(
          path.join(detail.outputDirectory, artifact.relativePath)
        );
        if (!generated) continue;
        const packageBody = makeStrategyEvaluationPackage({
          chartId: 0,
          name: generated.name,
          rules: generated.rules,
          chart: generated.chart
        });
        packageBody.id = `generated-${run.id}-${path.basename(
          artifact.relativePath,
          ".import-package.json"
        )}`;
        sources.push({
          id: `generated:${run.id}:${artifact.relativePath}`,
          kind: "generated-bucket",
          name: packageBody.name,
          description: `Generated by ${run.name}.`,
          package: packageBody,
          generatorRunId: run.id,
          bucketKey: path.basename(artifact.relativePath, ".import-package.json")
        });
      }
    }
    res.json({ sources });
  });

  app.post("/sim-api/compare", (req, res) => {
    const body = req.body as SimulatorComparisonRequest;
    const left = runner.detail(body.leftRunId);
    const right = runner.detail(body.rightRunId);
    if (!left || !right) return res.status(404).json({ error: "Comparison run not found." });
    if (left.workflow !== right.workflow)
      return res.status(400).json({ error: "Runs from different workflows cannot be compared." });
    if (left.workflow === "generator" && left.generatorSummary && right.generatorSummary)
      return res.json(
        generatorComparison(
          left.id,
          right.id,
          left.generatorSummary,
          right.generatorSummary,
          body.leftBucket,
          body.rightBucket
        )
      );
    if (left.workflow === "evaluator" && left.evaluatorSummary && right.evaluatorSummary)
      return res.json(
        evaluatorComparison(
          left.id,
          right.id,
          left.evaluatorSummary,
          right.evaluatorSummary,
          left.config as unknown as Record<string, unknown>,
          right.config as unknown as Record<string, unknown>,
          (() => {
            try {
              return runner.evaluatorAnalysis(left.id);
            } catch {
              return undefined;
            }
          })(),
          (() => {
            try {
              return runner.evaluatorAnalysis(right.id);
            } catch {
              return undefined;
            }
          })(),
          JSON.stringify(left.strategy?.rules) === JSON.stringify(right.strategy?.rules)
        )
      );
    res.status(400).json({ error: "Both runs need completed summaries before comparison." });
  });

  app.get("/sim-api/events", (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (event: SimulatorEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: "snapshot", runs: runner.list(), queue: runner.queue() });
    const unsubscribe = runner.subscribe(send);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : "Simulator request failed." });
  };
  app.use(errorHandler);
  return app;
}
