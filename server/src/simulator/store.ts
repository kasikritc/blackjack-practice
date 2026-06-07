import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  SimulatorProgress,
  SimulatorReproducibility,
  SimulatorRunDetail,
  SimulatorRunListItem,
  SimulatorRunRequest,
  SimulatorRunStatus,
  SimulatorWorkflow,
  StrategyEvaluationPackage
} from "@blackjack/shared";
import { SIM_DB_PATH } from "./config.js";

interface RunRow {
  id: string;
  name: string;
  workflow: SimulatorWorkflow;
  status: SimulatorRunStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  elapsed_ms: number | null;
  queue_position: number | null;
  config_json: string;
  strategy_json: string | null;
  output_directory: string | null;
  progress_json: string | null;
  tags_json: string;
  logs_json: string;
  reproducibility_json: string;
  error: string | null;
  trashed_at: string | null;
}

function parse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function listItem(row: RunRow): SimulatorRunListItem {
  return {
    id: row.id,
    name: row.name,
    workflow: row.workflow,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    elapsedMs: row.elapsed_ms ?? undefined,
    queuePosition: row.queue_position ?? undefined,
    progress: parse<SimulatorProgress | undefined>(row.progress_json, undefined),
    tags: parse<string[]>(row.tags_json, []),
    error: row.error || undefined,
    trashedAt: row.trashed_at || undefined
  };
}

export class SimulatorStore {
  readonly db: Database.Database;

  constructor(dbPath = SIM_DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS simulator_runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        workflow TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        elapsed_ms INTEGER,
        queue_position INTEGER,
        config_json TEXT NOT NULL,
        strategy_json TEXT,
        output_directory TEXT,
        progress_json TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        logs_json TEXT NOT NULL DEFAULT '[]',
        reproducibility_json TEXT NOT NULL DEFAULT '{}',
        error TEXT,
        trashed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS simulator_runs_status_idx
        ON simulator_runs(status, queue_position, created_at);
      CREATE TABLE IF NOT EXISTS simulator_run_logs (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        line TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS simulator_run_logs_run_idx
        ON simulator_run_logs(run_id, sequence);
    `);
  }

  has(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM simulator_runs WHERE id = ?").get(id));
  }

  create(
    id: string,
    request: SimulatorRunRequest,
    reproducibility: SimulatorReproducibility,
    status: SimulatorRunStatus = "queued"
  ): SimulatorRunDetail {
    const queuePosition = status === "queued" ? this.nextQueuePosition() : null;
    this.db
      .prepare(
        `
        INSERT INTO simulator_runs (
          id, name, workflow, status, created_at, queue_position, config_json, strategy_json,
          tags_json, reproducibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        request.name,
        request.workflow,
        status,
        new Date().toISOString(),
        queuePosition,
        JSON.stringify(request.config),
        request.workflow === "evaluator" && request.strategyPackage
          ? JSON.stringify(request.strategyPackage)
          : null,
        JSON.stringify(request.tags || []),
        JSON.stringify(reproducibility)
      );
    return this.detail(id)!;
  }

  importLegacy(input: {
    id: string;
    name: string;
    workflow: SimulatorWorkflow;
    status: SimulatorRunStatus;
    createdAt: string;
    completedAt?: string;
    elapsedMs?: number;
    config: unknown;
    strategy?: StrategyEvaluationPackage;
    outputDirectory: string;
    reproducibility: SimulatorReproducibility;
  }): void {
    if (this.has(input.id)) return;
    this.db
      .prepare(
        `
        INSERT INTO simulator_runs (
          id, name, workflow, status, created_at, completed_at, elapsed_ms, config_json,
          strategy_json, output_directory, tags_json, logs_json, reproducibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?)
      `
      )
      .run(
        input.id,
        input.name,
        input.workflow,
        input.status,
        input.createdAt,
        input.completedAt || null,
        input.elapsedMs ?? null,
        JSON.stringify(input.config),
        input.strategy ? JSON.stringify(input.strategy) : null,
        input.outputDirectory,
        JSON.stringify(input.reproducibility)
      );
  }

  list(includeTrashed = false): SimulatorRunListItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM simulator_runs ${includeTrashed ? "" : "WHERE status != 'trashed'"}
         ORDER BY CASE WHEN status = 'running' THEN 0 WHEN status = 'queued' THEN 1 ELSE 2 END,
         queue_position, created_at DESC`
      )
      .all() as RunRow[];
    return rows.map(listItem);
  }

  detail(id: string): SimulatorRunDetail | null {
    const row = this.db.prepare("SELECT * FROM simulator_runs WHERE id = ?").get(id) as
      | RunRow
      | undefined;
    if (!row) return null;
    return {
      ...listItem(row),
      config: parse(row.config_json, {} as SimulatorRunDetail["config"]),
      strategy: parse<StrategyEvaluationPackage | undefined>(row.strategy_json, undefined),
      outputDirectory: row.output_directory || undefined,
      logs: [
        ...parse<string[]>(row.logs_json, []),
        ...(
          this.db
            .prepare("SELECT line FROM simulator_run_logs WHERE run_id = ? ORDER BY sequence")
            .all(id) as Array<{ line: string }>
        ).map(entry => entry.line)
      ],
      artifacts: [],
      reproducibility: parse<SimulatorReproducibility>(row.reproducibility_json, {})
    };
  }

  queued(): SimulatorRunDetail[] {
    const rows = this.db
      .prepare(
        "SELECT id FROM simulator_runs WHERE status = 'queued' ORDER BY queue_position, created_at"
      )
      .all() as Array<{ id: string }>;
    return rows
      .map(row => this.detail(row.id))
      .filter((run): run is SimulatorRunDetail => Boolean(run));
  }

  update(id: string, values: Record<string, unknown>): void {
    const entries = Object.entries(values).filter(([, value]) => value !== undefined);
    if (!entries.length) return;
    const columns: Record<string, string> = {
      name: "name",
      status: "status",
      startedAt: "started_at",
      completedAt: "completed_at",
      elapsedMs: "elapsed_ms",
      queuePosition: "queue_position",
      outputDirectory: "output_directory",
      progress: "progress_json",
      tags: "tags_json",
      logs: "logs_json",
      reproducibility: "reproducibility_json",
      error: "error",
      trashedAt: "trashed_at"
    };
    const assignments: string[] = [];
    const parameters: unknown[] = [];
    for (const [key, value] of entries) {
      const column = columns[key];
      if (!column) continue;
      assignments.push(`${column} = ?`);
      parameters.push(
        ["progress", "tags", "logs", "reproducibility"].includes(key)
          ? JSON.stringify(value)
          : value
      );
    }
    if (!assignments.length) return;
    this.db
      .prepare(`UPDATE simulator_runs SET ${assignments.join(", ")} WHERE id = ?`)
      .run(...parameters, id);
  }

  appendLog(id: string, line: string): void {
    if (!this.has(id)) return;
    this.db
      .prepare("INSERT INTO simulator_run_logs (run_id, created_at, line) VALUES (?, ?, ?)")
      .run(id, new Date().toISOString(), line);
  }

  nextQueuePosition(): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(queue_position), 0) + 1 AS value FROM simulator_runs")
      .get() as { value: number };
    return Number(row.value);
  }

  requeue(id: string): void {
    this.update(id, {
      status: "queued",
      queuePosition: this.nextQueuePosition(),
      startedAt: null,
      completedAt: null,
      elapsedMs: null,
      error: null,
      trashedAt: null
    });
  }

  markInterruptedForRestart(): void {
    const rows = this.db
      .prepare(
        "SELECT id FROM simulator_runs WHERE status IN ('running', 'cancelling') ORDER BY started_at, created_at"
      )
      .all() as Array<{ id: string }>;
    let queuePosition = this.nextQueuePosition();
    const requeue = this.db.prepare(
      "UPDATE simulator_runs SET status = 'queued', queue_position = ?, error = NULL WHERE id = ?"
    );
    this.db.transaction(() => {
      for (const row of rows) requeue.run(queuePosition++, row.id);
    })();
  }

  remove(id: string): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM simulator_run_logs WHERE run_id = ?").run(id);
      this.db.prepare("DELETE FROM simulator_runs WHERE id = ?").run(id);
    })();
  }
}
