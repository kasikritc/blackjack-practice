import { Router } from "express";
import type { StrategyChartImportRequest } from "@blackjack/shared";
import { insert, queryAll, sqlValue, update } from "../db/client.js";
import {
  defaultStrategyChart,
  defaultStrategyRules,
  defaultStrategySubsets,
  backfillStrategyFallbacks,
  strategyData
} from "../domain/strategy.js";
import { nowIso, parseSettingsJson } from "../util.js";

export const strategyRouter = Router();

strategyRouter.get("/strategy", (_req, res) => {
  res.status(200).json(strategyData());
});

strategyRouter.post("/strategy/rule-profiles", (req, res) => {
  const body = req.body || {};
  const row = insert("strategy_rule_profiles", {
    name: body.name || "Custom rules",
    rules_json: JSON.stringify(body.rules || defaultStrategyRules())
  });
  res.status(201).json({ id: row.id, ...strategyData() });
});

strategyRouter.patch("/strategy/rule-profiles/:id", (req, res) => {
  const body = req.body || {};
  update("strategy_rule_profiles", Number(req.params.id), {
    name: body.name,
    rules_json: body.rules ? JSON.stringify(body.rules) : undefined,
    updated_at: nowIso()
  });
  res.status(200).json({ ok: true, ...strategyData() });
});

strategyRouter.post("/strategy/charts", (req, res) => {
  const body = req.body || {};
  const clone = body.cloneFromChartId
    ? queryAll(
        `SELECT chart_json FROM strategy_charts WHERE id = ${Number(body.cloneFromChartId)} LIMIT 1`
      )[0]
    : null;
  const chartJson = body.chart
    ? backfillStrategyFallbacks(body.chart)
    : clone?.chart_json
      ? backfillStrategyFallbacks(parseSettingsJson(clone.chart_json))
      : defaultStrategyChart();
  const row = insert("strategy_charts", {
    rule_profile_id: body.ruleProfileId,
    name: body.name || "Custom strategy",
    chart_json: JSON.stringify(chartJson)
  });
  res.status(201).json({ id: row.id, ...strategyData() });
});

function createChartSubsets(chartId: number): void {
  for (const subset of defaultStrategySubsets()) {
    insert("strategy_subsets", {
      chart_id: chartId,
      name: subset.name,
      criteria_json: JSON.stringify(subset.criteria),
      is_default: 0
    });
  }
}

function validateChartPayload(chart: unknown): boolean {
  if (!chart || typeof chart !== "object") return false;
  const candidate = chart as Record<string, unknown>;
  return ["hard", "soft", "pair"].every(section => {
    const value = candidate[section];
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  });
}

strategyRouter.patch("/strategy/charts/:id", (req, res) => {
  const body = req.body || {};
  update("strategy_charts", Number(req.params.id), {
    rule_profile_id: body.ruleProfileId,
    name: body.name,
    chart_json: body.chart ? JSON.stringify(backfillStrategyFallbacks(body.chart)) : undefined,
    updated_at: nowIso()
  });
  res.status(200).json({ ok: true, ...strategyData() });
});

strategyRouter.post("/strategy/charts/import", (req, res) => {
  const body = (req.body || {}) as Partial<StrategyChartImportRequest>;
  if (!body.name || !body.rules || !validateChartPayload(body.chart)) {
    res.status(400).json({ error: "name, rules, and a valid chart are required" });
    return;
  }

  const rulesJson = JSON.stringify(body.rules);
  let profile = queryAll(
    `SELECT id FROM strategy_rule_profiles WHERE rules_json = ${sqlValue(rulesJson)} LIMIT 1`
  )[0];
  if (!profile) {
    profile = insert("strategy_rule_profiles", {
      name: `Generated rules - ${body.name}`,
      rules_json: rulesJson
    });
  }

  const chart = insert("strategy_charts", {
    rule_profile_id: profile.id,
    name: body.name,
    chart_json: JSON.stringify(body.chart)
  });
  createChartSubsets(chart.id);

  insert("strategy_chart_imports", {
    chart_id: chart.id,
    simulator_run_id: body.source?.simulatorRunId,
    seed: body.source?.seed,
    true_count: body.source?.trueCount,
    artifact_path: body.source?.artifactPath,
    source_json: body.source ? JSON.stringify(body.source) : undefined
  });

  res.status(201).json({
    ok: true,
    id: chart.id,
    ruleProfileId: Number(profile.id),
    chartId: chart.id,
    ...strategyData()
  });
});

strategyRouter.post("/strategy/subsets", (req, res) => {
  const body = req.body || {};
  const row = insert("strategy_subsets", {
    chart_id: body.chartId,
    name: body.name || "Custom subset",
    criteria_json: JSON.stringify(body.criteria || defaultStrategySubsets()[0].criteria),
    is_default: body.isDefault ? 1 : 0
  });
  res.status(201).json({ id: row.id, ...strategyData() });
});

strategyRouter.patch("/strategy/subsets/:id", (req, res) => {
  const body = req.body || {};
  update("strategy_subsets", Number(req.params.id), {
    chart_id: body.chartId,
    name: body.name,
    criteria_json: body.criteria ? JSON.stringify(body.criteria) : undefined,
    is_default: typeof body.isDefault === "boolean" ? (body.isDefault ? 1 : 0) : undefined,
    updated_at: nowIso()
  });
  res.status(200).json({ ok: true, ...strategyData() });
});
