import { Router } from "express";
import {
  STRATEGY_ACTIONS,
  STRATEGY_DEALER_UPCARDS,
  type StrategyChartImportRequest,
  type StrategyCategory
} from "@blackjack/shared";
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

const IMPORT_ACTIONS: ReadonlySet<string> = new Set(
  STRATEGY_ACTIONS.filter(action => action !== "insurance")
);

function expectedRows(category: StrategyCategory): string[] {
  if (category === "hard") return Array.from({ length: 18 }, (_, index) => `h${index + 4}`);
  if (category === "soft") return Array.from({ length: 9 }, (_, index) => `s${index + 13}`);
  return ["pA", "p10", "p9", "p8", "p7", "p6", "p5", "p4", "p3", "p2"];
}

function validateChartPayload(chart: unknown): chart is StrategyChartImportRequest["chart"] {
  if (!chart || typeof chart !== "object" || Array.isArray(chart)) return false;
  const candidate = chart as Record<string, any>;
  for (const category of ["hard", "soft", "pair"] as const) {
    if (!candidate[category] || typeof candidate[category] !== "object") return false;
    for (const row of expectedRows(category)) {
      const cells = candidate[category][row];
      if (!cells || typeof cells !== "object") return false;
      for (const dealer of STRATEGY_DEALER_UPCARDS) {
        if (!IMPORT_ACTIONS.has(cells[dealer])) return false;
      }
    }
  }
  const fallbacks = candidate.fallbacks || {};
  for (const category of Object.keys(fallbacks)) {
    if (!["hard", "soft", "pair"].includes(category)) return false;
    for (const cells of Object.values(fallbacks[category] || {}) as any[])
      for (const action of Object.values(cells || {}))
        if (!IMPORT_ACTIONS.has(action as never)) return false;
  }
  return true;
}

function validateImportPackage(body: Partial<StrategyChartImportRequest>): string | null {
  if (body.schemaVersion !== 1) return "unsupported import package schema";
  if (!body.name || !body.rules || !body.source || !body.validation || !Array.isArray(body.cells))
    return "incomplete import package";
  if (!validateChartPayload(body.chart)) return "invalid or incomplete strategy chart";
  if (body.validation.gameFamily !== "american-peek" || !body.validation.totalDependent)
    return "only total-dependent American peek charts can be imported";
  if (!body.validation.fullySupported) return "simulator did not validate this rule profile";
  if (!body.validation.allCellsConverged) return "all strategy cells must be converged";
  if (!body.rules.dealerPeek || !body.rules.dealerHoleCard)
    return "American peek rules are required";
  if (body.rules.hitSplitAces && body.rules.oneCardSplitAces)
    return "contradictory split-ace rules";
  if (Object.keys(body.rules.customRules || {}).length) return "custom rules are not supported";

  const expected = new Set<string>();
  for (const category of ["hard", "soft", "pair"] as const)
    for (const row of expectedRows(category))
      for (const dealer of STRATEGY_DEALER_UPCARDS) expected.add(`${category}:${row}:${dealer}`);
  const seen = new Set<string>();
  for (const cell of body.cells) {
    const key = `${cell.category}:${cell.rowKey}:${cell.dealerUpcard}`;
    if (!expected.has(key) || seen.has(key)) return "unexpected or duplicate simulation cell";
    seen.add(key);
    if (
      cell.trueCount !== body.source.trueCount ||
      cell.decksRemaining !== body.source.decksRemaining
    )
      return "simulation cell bucket metadata does not match package source";
    if (!cell.converged || cell.confidence !== "high") return `unconverged cell: ${key}`;
    if (
      !IMPORT_ACTIONS.has(cell.bestAction) ||
      !cell.actions.some(action => action.action === cell.bestAction)
    )
      return `invalid winning action evidence: ${key}`;
    if ((body.chart as any)[cell.category]?.[cell.rowKey]?.[cell.dealerUpcard] !== cell.bestAction)
      return `chart action does not match evidence: ${key}`;
  }
  if (seen.size !== expected.size) return "simulation evidence is missing required cells";
  return null;
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
  const validationError = validateImportPackage(body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const packageBody = body as StrategyChartImportRequest;
  const rulesJson = JSON.stringify(packageBody.rules);
  let profile = queryAll(
    `SELECT id FROM strategy_rule_profiles WHERE rules_json = ${sqlValue(rulesJson)} LIMIT 1`
  )[0];
  if (!profile) {
    profile = insert("strategy_rule_profiles", {
      name: `Generated rules - ${packageBody.name}`,
      rules_json: rulesJson
    });
  }
  const chart = insert("strategy_charts", {
    rule_profile_id: profile.id,
    name: packageBody.name,
    chart_json: JSON.stringify(packageBody.chart)
  });
  createChartSubsets(chart.id);
  insert("strategy_chart_imports", {
    chart_id: chart.id,
    simulator_run_id: packageBody.source.simulatorRunId,
    seed: packageBody.source.seed,
    true_count: packageBody.source.trueCount,
    artifact_path: packageBody.source.artifactPath,
    source_json: JSON.stringify(packageBody.source)
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
