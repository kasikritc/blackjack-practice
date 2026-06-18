import type { StrategyAnalyticsMetric } from "@blackjack/shared";
import { queryAll } from "../db/client.js";
import { percent, percentile } from "../util.js";

const CATEGORY_LABELS: Record<string, string> = {
  hard: "Hard totals",
  soft: "Soft totals",
  pair: "Pairs"
};

function rowLabel(category: string, rowKey: string): string {
  if (category === "hard") return `Hard ${rowKey.slice(1)}`;
  if (category === "soft") return `Soft ${rowKey.slice(1)}`;
  if (category === "pair") {
    const rank = rowKey.slice(1);
    return `${rank},${rank}`;
  }
  return rowKey;
}

function cellLabel(row: any): string {
  return `${rowLabel(String(row.category || ""), String(row.row_key || ""))} vs ${row.dealer_upcard}`;
}

function metricFromRows(
  key: string,
  label: string,
  rows: any[],
  dimensions: Partial<StrategyAnalyticsMetric> = {}
): StrategyAnalyticsMetric {
  const correct = rows.filter(row => row.correct === 1).length;
  return {
    key,
    label,
    attempts: rows.length,
    correct,
    accuracy: percent(correct, rows.length),
    medianResponse: percentile(
      rows.map(row => row.response_time_ms),
      0.5
    ),
    ...dimensions
  };
}

function groupMetric(
  rows: any[],
  getKey: (row: any) => string,
  getLabel: (row: any) => string,
  getDimensions: (row: any) => Partial<StrategyAnalyticsMetric> = () => ({})
): StrategyAnalyticsMetric[] {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([, group]) => {
    const first = group[0];
    return metricFromRows(getKey(first), getLabel(first), group, getDimensions(first));
  });
}

function topStrengths(metrics: StrategyAnalyticsMetric[]): StrategyAnalyticsMetric[] {
  return [...metrics]
    .sort(
      (a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts || a.label.localeCompare(b.label)
    )
    .slice(0, 3);
}

function topWeaknesses(metrics: StrategyAnalyticsMetric[]): StrategyAnalyticsMetric[] {
  return [...metrics]
    .sort(
      (a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts || a.label.localeCompare(b.label)
    )
    .slice(0, 3);
}

export function buildStrategySummary() {
  const rows = queryAll(`
    SELECT *
    FROM strategy_attempts
    WHERE category IS NOT NULL
      AND row_key IS NOT NULL
      AND dealer_upcard IS NOT NULL
      AND session_id IS NOT NULL
    ORDER BY created_at ASC, id ASC
  `);
  const correct = rows.filter(row => row.correct === 1).length;
  const cells = groupMetric(
    rows,
    row => `${row.category}:${row.row_key}:${row.dealer_upcard}`,
    cellLabel,
    row => ({
      category: row.category,
      rowKey: row.row_key,
      dealerUpcard: row.dealer_upcard
    })
  ).sort(
    (a, b) =>
      String(a.category).localeCompare(String(b.category)) ||
      String(a.rowKey).localeCompare(String(b.rowKey), undefined, { numeric: true }) ||
      String(a.dealerUpcard).localeCompare(String(b.dealerUpcard), undefined, { numeric: true })
  );
  const categories = groupMetric(
    rows,
    row => String(row.category),
    row => CATEGORY_LABELS[row.category as string] || row.category,
    row => ({ category: row.category })
  );
  const rowMetrics = groupMetric(
    rows,
    row => `${row.category}:${row.row_key}`,
    row => rowLabel(row.category, row.row_key),
    row => ({ category: row.category, rowKey: row.row_key })
  );
  const dealerUpcards = groupMetric(
    rows,
    row => String(row.dealer_upcard),
    row => `Dealer ${row.dealer_upcard}`,
    row => ({ dealerUpcard: row.dealer_upcard })
  );

  return {
    totals: {
      attempts: rows.length,
      correct,
      accuracy: percent(correct, rows.length),
      medianResponse: percentile(
        rows.map(row => row.response_time_ms),
        0.5
      )
    },
    cells,
    categories,
    rows: rowMetrics,
    dealerUpcards,
    strengths: {
      cells: topStrengths(cells),
      categories: topStrengths(categories),
      rows: topStrengths(rowMetrics),
      dealerUpcards: topStrengths(dealerUpcards)
    },
    weaknesses: {
      cells: topWeaknesses(cells),
      categories: topWeaknesses(categories),
      rows: topWeaknesses(rowMetrics),
      dealerUpcards: topWeaknesses(dealerUpcards)
    }
  };
}
