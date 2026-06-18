import path from "node:path";
import { DATA_DIR, ROOT } from "../config.js";

export const SIM_PORT = Number(process.env.SIM_PORT || 5175);
export const SIM_DATA_DIR = path.join(DATA_DIR, "simulator");
export const SIM_DB_PATH = process.env.SIM_DB_PATH
  ? path.resolve(process.env.SIM_DB_PATH)
  : path.join(DATA_DIR, "simulations.sqlite");
export const SIM_JOB_DIR = path.join(SIM_DATA_DIR, "jobs");
export const SIM_TRASH_DIR = path.join(SIM_DATA_DIR, "trash");
export const GENERATOR_RUNS_DIR = path.join(ROOT, "sim", "runs");
export const EVALUATOR_RUNS_DIR = path.join(ROOT, "sim", "evaluation-runs");
export const GENERATOR_BINARY = path.join(ROOT, "sim", "build", "simulate-strategy");
export const EVALUATOR_BINARY = path.join(ROOT, "sim", "build", "evaluate-strategy");
export const STRATEGIES_DIR = path.join(ROOT, "sim", "strategies");
export const SIM_CONCURRENCY = Math.max(1, Number(process.env.SIM_CONCURRENCY || 1));
