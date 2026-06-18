import type {
  EvaluationAction,
  StrategyChart,
  StrategyEvaluationPackage,
  StrategyRules
} from "@blackjack/shared";

const DEALERS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

function evaluationAction(value: string, location: string): EvaluationAction {
  if (
    value === "hit" ||
    value === "stand" ||
    value === "double" ||
    value === "split" ||
    value === "surrender"
  ) {
    return value;
  }
  throw new Error("Chart cell " + location + " has unsupported evaluation action: " + value);
}

function fallbackFor(
  chart: StrategyChart,
  category: "hard" | "soft" | "pair",
  rowKey: string,
  dealer: string,
  action: EvaluationAction
): "hit" | "stand" {
  const existing = chart.fallbacks?.[category]?.[rowKey]?.[dealer];
  if (existing === "hit" || existing === "stand") return existing;
  if (action === "surrender") return "hit";
  if (category === "soft") return Number(rowKey.slice(1)) >= 18 ? "stand" : "hit";
  if (category === "pair") {
    if (rowKey === "pA") return "stand";
    const value = Number(rowKey.slice(1));
    const total = value * 2;
    const underlying = chart.hard?.[`h${total}`]?.[dealer];
    return underlying === "stand" ? "stand" : "hit";
  }
  return "hit";
}

function packageFallbacks(chart: StrategyChart): StrategyEvaluationPackage["fallbacks"] {
  const fallbacks: StrategyEvaluationPackage["fallbacks"] = {};
  for (const category of ["hard", "soft", "pair"] as const) {
    for (const [rowKey, cells] of Object.entries(chart[category])) {
      for (const dealer of DEALERS) {
        const action = evaluationAction(cells[dealer], category + ":" + rowKey + ":" + dealer);
        if (!(["double", "surrender", "split"] as EvaluationAction[]).includes(action)) continue;
        fallbacks[category] ||= {};
        fallbacks[category]![rowKey] ||= {};
        fallbacks[category]![rowKey][dealer] = fallbackFor(chart, category, rowKey, dealer, action);
      }
    }
  }
  return fallbacks;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "strategy"
  );
}

export function makeStrategyEvaluationPackage(input: {
  chartId: number;
  name: string;
  rules: StrategyRules;
  chart: StrategyChart;
}): StrategyEvaluationPackage {
  return {
    schemaVersion: 1,
    id: `${slug(input.name)}-${input.chartId}`,
    name: input.name,
    rules: input.rules,
    trueCountRounding: "truncate",
    chart: {
      hard: input.chart.hard,
      soft: input.chart.soft,
      pair: input.chart.pair
    },
    fallbacks: packageFallbacks(input.chart),
    deviations: [],
    insurance: { base: "decline", deviations: [] },
    evenMoney: { base: "decline", deviations: [] },
    bettingRamp: [{ atOrAbove: -100, units: 1 }]
  };
}
