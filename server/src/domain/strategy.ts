import { insert, queryAll, sqlValue, update } from "../db/client.js";
import { parseSettingsJson } from "../util.js";

export interface StrategyRulesShape {
  decks: number;
  dealerHitsSoft17: boolean;
  dealerPeek: boolean;
  dealerHoleCard: boolean;
  blackjackPayout: string;
  doubleRule: string;
  doubleAfterSplit: boolean;
  surrender: string;
  maxSplitHands: number;
  resplitAces: boolean;
  hitSplitAces: boolean;
  oneCardSplitAces: boolean;
  insurance: boolean;
  splitTensByValue: boolean;
  customRules: Record<string, unknown>;
  [key: string]: unknown;
}

export function defaultStrategyRules(overrides: Record<string, unknown> = {}): StrategyRulesShape {
  return {
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
    customRules: {},
    ...overrides
  };
}

export function strategyDealerColumns(): string[] {
  return ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
}

export function defaultStrategySubsets() {
  const allCategories = ["hard", "soft", "pair"];
  const allDealers = strategyDealerColumns();
  return [
    {
      name: "All cells",
      criteria: { categories: allCategories, dealerUpcards: allDealers, cells: [] }
    },
    {
      name: "Pairs only",
      criteria: { categories: ["pair"], dealerUpcards: allDealers, cells: [] }
    },
    {
      name: "Softs only",
      criteria: { categories: ["soft"], dealerUpcards: allDealers, cells: [] }
    },
    {
      name: "Hards only",
      criteria: { categories: ["hard"], dealerUpcards: allDealers, cells: [] }
    },
    {
      name: "Dealer 2-6",
      criteria: { categories: allCategories, dealerUpcards: ["2", "3", "4", "5", "6"], cells: [] }
    },
    {
      name: "Dealer 7-A",
      criteria: { categories: allCategories, dealerUpcards: ["7", "8", "9", "10", "A"], cells: [] }
    }
  ];
}

function dealerNumber(dealer: string): number {
  if (dealer === "A") return 11;
  return Number(dealer);
}

type StrategyCategoryKey = "hard" | "soft" | "pair";

const STRATEGY_CATEGORIES: StrategyCategoryKey[] = ["hard", "soft", "pair"];

function fallbackActionRequired(category: StrategyCategoryKey, action: unknown): boolean {
  if (category === "pair") return action === "double";
  return action === "double" || action === "surrender";
}

function defaultFallbackAction(
  category: StrategyCategoryKey,
  rowKey: string,
  action: unknown
): string | null {
  if (!fallbackActionRequired(category, action)) return null;
  if (action === "surrender") return "hit";
  if (category === "soft" && Number(rowKey.slice(1)) >= 18) return "stand";
  return "hit";
}

export function backfillStrategyFallbacks(chart: any): any {
  const normalized = {
    ...(chart || {}),
    hard: chart?.hard || {},
    soft: chart?.soft || {},
    pair: chart?.pair || {},
    fallbacks: { ...(chart?.fallbacks || {}) }
  };

  for (const category of STRATEGY_CATEGORIES) {
    const rows = normalized[category] || {};
    const fallbackRows = { ...(normalized.fallbacks[category] || {}) };
    for (const [rowKey, dealerActions] of Object.entries(rows)) {
      const fallbackDealers = { ...(fallbackRows[rowKey] || {}) };
      for (const [dealer, action] of Object.entries(dealerActions as Record<string, unknown>)) {
        const fallback = defaultFallbackAction(category, rowKey, action);
        if (fallback && !fallbackDealers[dealer]) fallbackDealers[dealer] = fallback;
      }
      if (Object.keys(fallbackDealers).length) fallbackRows[rowKey] = fallbackDealers;
    }
    if (Object.keys(fallbackRows).length) normalized.fallbacks[category] = fallbackRows;
  }

  return normalized;
}

function defaultHardAction(total: number, dealer: string): string {
  const up = dealerNumber(dealer);
  if (total <= 8) return "hit";
  if (total === 9) return up >= 3 && up <= 6 ? "double" : "hit";
  if (total === 10) return up >= 2 && up <= 9 ? "double" : "hit";
  if (total === 11) return dealer === "A" ? "hit" : "double";
  if (total === 12) return up >= 4 && up <= 6 ? "stand" : "hit";
  if (total >= 13 && total <= 16) return up >= 2 && up <= 6 ? "stand" : "hit";
  return "stand";
}

function defaultSoftAction(total: number, dealer: string): string {
  const up = dealerNumber(dealer);
  if (total <= 17) {
    if (total <= 15) return up >= 4 && up <= 6 ? "double" : "hit";
    return up >= 3 && up <= 6 ? "double" : "hit";
  }
  if (total === 18) {
    if (up >= 3 && up <= 6) return "double";
    if ([2, 7, 8].includes(up)) return "stand";
    return "hit";
  }
  return "stand";
}

function defaultPairAction(rank: string, dealer: string): string {
  const up = dealerNumber(dealer);
  if (rank === "A" || rank === "8") return "split";
  if (rank === "10") return "stand";
  if (rank === "9") return [2, 3, 4, 5, 6, 8, 9].includes(up) ? "split" : "stand";
  if (rank === "7") return up >= 2 && up <= 7 ? "split" : "hit";
  if (rank === "6") return up >= 2 && up <= 6 ? "split" : "hit";
  if (rank === "5") return up >= 2 && up <= 9 ? "double" : "hit";
  if (rank === "4") return up === 5 || up === 6 ? "split" : "hit";
  if (rank === "3" || rank === "2") return up >= 2 && up <= 7 ? "split" : "hit";
  return "hit";
}

function applyCommonStrategyAdjustments(chart: any, rules: StrategyRulesShape): any {
  const dealerHitsSoft17 = rules.dealerHitsSoft17 !== false;
  const surrender = rules.surrender || "none";

  chart.hard.h11.A = dealerHitsSoft17 ? "double" : "hit";
  chart.soft.s18["2"] = dealerHitsSoft17 ? "double" : "stand";
  chart.soft.s19["6"] = dealerHitsSoft17 ? "double" : "stand";

  if (surrender !== "none") {
    chart.hard.h15["10"] = "surrender";
    if (dealerHitsSoft17) chart.hard.h15.A = "surrender";
    chart.hard.h16["9"] = "surrender";
    chart.hard.h16["10"] = "surrender";
    chart.hard.h16.A = "surrender";
  }

  if (rules.doubleAfterSplit === false) {
    chart.pair.p4["5"] = "hit";
    chart.pair.p4["6"] = "hit";
  }

  return chart;
}

export function defaultStrategyChart(rules: StrategyRulesShape = defaultStrategyRules()): any {
  const dealers = strategyDealerColumns();
  const hard: Record<string, any> = {};
  for (let total = 4; total <= 21; total += 1) {
    hard[`h${total}`] = Object.fromEntries(
      dealers.map(dealer => [dealer, defaultHardAction(total, dealer)])
    );
  }
  const soft: Record<string, any> = {};
  for (let total = 13; total <= 21; total += 1) {
    soft[`s${total}`] = Object.fromEntries(
      dealers.map(dealer => [dealer, defaultSoftAction(total, dealer)])
    );
  }
  const pair: Record<string, any> = {};
  for (const rank of ["A", "10", "9", "8", "7", "6", "5", "4", "3", "2"]) {
    pair[`p${rank}`] = Object.fromEntries(
      dealers.map(dealer => [dealer, defaultPairAction(rank, dealer)])
    );
  }
  return backfillStrategyFallbacks(applyCommonStrategyAdjustments({ hard, soft, pair }, rules));
}

function commonStrategyPresets() {
  const presets = [
    {
      profileName: "6 decks, dealer hits soft 17, double after split, late surrender",
      chartName: "Basic strategy - 6 decks, hit soft 17, double after split, late surrender",
      rules: defaultStrategyRules({
        decks: 6,
        dealerHitsSoft17: true,
        doubleAfterSplit: true,
        surrender: "late"
      })
    },
    {
      profileName: "6 decks, dealer stands soft 17, double after split, late surrender",
      chartName: "Basic strategy - 6 decks, stand soft 17, double after split, late surrender",
      rules: defaultStrategyRules({
        decks: 6,
        dealerHitsSoft17: false,
        doubleAfterSplit: true,
        surrender: "late"
      })
    },
    {
      profileName: "6 decks, dealer hits soft 17, double after split, no surrender",
      chartName: "Basic strategy - 6 decks, hit soft 17, double after split, no surrender",
      rules: defaultStrategyRules({
        decks: 6,
        dealerHitsSoft17: true,
        doubleAfterSplit: true,
        surrender: "none"
      })
    },
    {
      profileName: "2 decks, dealer hits soft 17, double after split, no surrender",
      chartName: "Basic strategy - 2 decks, hit soft 17, double after split, no surrender",
      rules: defaultStrategyRules({
        decks: 2,
        dealerHitsSoft17: true,
        doubleAfterSplit: true,
        surrender: "none"
      })
    },
    {
      profileName: "1 deck, dealer hits soft 17, no double after split, no surrender",
      chartName: "Basic strategy - 1 deck, hit soft 17, no double after split, no surrender",
      rules: defaultStrategyRules({
        decks: 1,
        dealerHitsSoft17: true,
        doubleAfterSplit: false,
        surrender: "none",
        maxSplitHands: 3
      })
    }
  ];
  return presets.map(preset => ({
    ...preset,
    chart: defaultStrategyChart(preset.rules)
  }));
}

function seedDefaultStrategySubsets(chartId: number): void {
  for (const subset of defaultStrategySubsets()) {
    const existing = queryAll(
      `SELECT id FROM strategy_subsets WHERE is_default = 1 AND name = ${sqlValue(subset.name)} LIMIT 1`
    )[0];
    if (existing) continue;
    insert("strategy_subsets", {
      chart_id: chartId,
      name: subset.name,
      criteria_json: JSON.stringify(subset.criteria),
      is_default: 1
    });
  }
}

export function seedStrategyData(): void {
  const presets = commonStrategyPresets();
  let firstChartId = queryAll("SELECT id FROM strategy_charts ORDER BY id LIMIT 1")[0]?.id;

  for (const preset of presets) {
    let profile = queryAll(
      `SELECT id FROM strategy_rule_profiles WHERE name = ${sqlValue(preset.profileName)} LIMIT 1`
    )[0];
    if (!profile) {
      profile = insert("strategy_rule_profiles", {
        name: preset.profileName,
        rules_json: JSON.stringify(preset.rules)
      });
    }

    let chart = queryAll(`
      SELECT id FROM strategy_charts
      WHERE rule_profile_id = ${Number(profile.id)} AND name = ${sqlValue(preset.chartName)}
      LIMIT 1
    `)[0];
    if (!chart) {
      chart = insert("strategy_charts", {
        rule_profile_id: profile.id,
        name: preset.chartName,
        chart_json: JSON.stringify(preset.chart)
      });
    }
    firstChartId ||= chart.id;
  }

  const fallbackChartId =
    firstChartId || queryAll("SELECT id FROM strategy_charts ORDER BY id LIMIT 1")[0]?.id;
  if (fallbackChartId) seedDefaultStrategySubsets(fallbackChartId);
}

function backfillPersistedStrategyChart(id: number, chart: any): any {
  const normalized = backfillStrategyFallbacks(chart);
  if (JSON.stringify(normalized) !== JSON.stringify(chart)) {
    update("strategy_charts", id, { chart_json: JSON.stringify(normalized) });
  }
  return normalized;
}

export function strategyData() {
  return {
    profiles: queryAll("SELECT * FROM strategy_rule_profiles ORDER BY id ASC").map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rules: parseSettingsJson(row.rules_json)
    })),
    charts: queryAll("SELECT * FROM strategy_charts ORDER BY id ASC").map(row => ({
      id: row.id,
      ruleProfileId: row.rule_profile_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      chart: backfillPersistedStrategyChart(row.id, parseSettingsJson(row.chart_json))
    })),
    subsets: queryAll("SELECT * FROM strategy_subsets ORDER BY is_default DESC, id ASC").map(
      row => ({
        id: row.id,
        chartId: row.chart_id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        criteria: parseSettingsJson(row.criteria_json),
        isDefault: row.is_default === 1
      })
    )
  };
}
