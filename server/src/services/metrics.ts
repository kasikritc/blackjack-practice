import { queryAll } from "../db/client.js";
import { average, firstPresent, parseSettingsJson, percent, percentile, round } from "../util.js";

export function cardGroup(hiLoValue: unknown, dealerHoleReveal: unknown): string {
  if (dealerHoleReveal) return "dealerHole";
  const value = Number(hiLoValue) || 0;
  if (value > 0) return "low";
  if (value < 0) return "high";
  return "neutral";
}

export function speedLabel(dealerSpeed: unknown, dealDelayMs: unknown): string {
  const label = (dealerSpeed as string) || "custom";
  if (dealDelayMs === null || dealDelayMs === undefined || dealDelayMs === "") return label;
  const delay = Number(dealDelayMs);
  if (!Number.isFinite(delay)) return label;
  return `${label} · ${delay} ms`;
}

export function otherPlayersLabel(value: unknown): string {
  const count = Number(value);
  if (!Number.isFinite(count)) return "Unknown other players";
  return `${count} other players`;
}

export function shoeDisplayLabel(mode: unknown): string {
  const labels: Record<string, string> = {
    decks: "Decks left",
    numbers: "Card numbers",
    graphic: "Tray graphic",
    hidden: "Hidden"
  };
  return labels[mode as string] || (mode as string) || "Unknown display";
}

export function quizSpacingLabel(value: unknown): string {
  const cards = Number(value);
  if (!Number.isFinite(cards)) return "Unknown gap";
  if (cards <= 5) return "1-5 cards";
  if (cards <= 10) return "6-10 cards";
  if (cards <= 15) return "11-15 cards";
  return "16+ cards";
}

export function groupedMetric(rows: any[], getKey: (row: any) => string) {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([label, group]) => ({
    label,
    checks: group.length,
    accuracy: percent(group.filter(row => row.correct === 1).length, group.length),
    avgError: average(group.map(row => row.absolute_error)),
    medianResponse: percentile(
      group.map(row => row.response_time_ms),
      0.5
    )
  }));
}

export function calculateMasteryScore(rows: any[]): number {
  if (!rows.length) return 0;
  const accuracyScore = percent(rows.filter(row => row.correct === 1).length, rows.length);
  const errorScore = Math.max(0, 100 - average(rows.map(row => row.absolute_error)) * 24);
  const speed = percentile(
    rows.map(row => row.response_time_ms),
    0.5
  );
  const speedScore = Math.max(0, Math.min(100, 100 - (speed - 2500) / 70));
  const majorPenalty = Math.min(35, rows.filter(row => row.absolute_error >= 3).length * 7);
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(accuracyScore * 0.52 + errorScore * 0.33 + speedScore * 0.15 - majorPenalty)
    )
  );
}

export function masteryLevel(score: number, checks: number): string {
  if (!checks) return "No data yet";
  if (score >= 92) return "Expert target";
  if (score >= 82) return "Advanced";
  if (score >= 65) return "Developing";
  return "Beginner";
}

export function trailingStreak(rows: any[]): number {
  let count = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].correct !== 1) break;
    count += 1;
  }
  return count;
}

export function bestCorrectStreak(rows: any[]): number {
  let best = 0;
  let current = 0;
  for (const row of rows) {
    current = row.correct === 1 ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

export function trailingNoMajorErrorStreak(rows: any[]): number {
  let count = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].absolute_error >= 3) break;
    count += 1;
  }
  return count;
}

export function enrichCheckSettings(row: any): any {
  const shoeSettings = parseSettingsJson(row.shoe_settings_json);
  const sessionSettings = parseSettingsJson(row.session_settings_json);
  return {
    ...row,
    number_of_other_players: firstPresent(
      row.number_of_other_players,
      shoeSettings.numberOfOtherPlayers,
      sessionSettings.numberOfOtherPlayers
    ),
    shoe_display_mode: firstPresent(
      row.shoe_display_mode,
      shoeSettings.shoeDisplayMode,
      sessionSettings.shoeDisplayMode
    ),
    dealer_speed: firstPresent(
      row.dealer_speed,
      shoeSettings.dealerSpeed,
      sessionSettings.dealerSpeed
    ),
    deal_delay_ms: firstPresent(
      row.deal_delay_ms,
      shoeSettings.dealDelayMs,
      sessionSettings.dealDelayMs
    )
  };
}

export function buildErrorDrivers() {
  const rows = queryAll(`
    SELECT
      c.id AS check_id,
      c.correct,
      c.signed_error,
      c.absolute_error,
      cc.card_group,
      COUNT(*) AS card_count
    FROM count_checks c
    JOIN count_check_cards cc ON cc.count_check_id = c.id
    GROUP BY c.id, cc.card_group
    ORDER BY c.created_at ASC
  `);
  const labels: Record<string, string> = {
    low: "Low cards",
    high: "High cards",
    neutral: "Neutral cards",
    dealerHole: "Dealer hole reveals"
  };
  return Object.entries(labels).map(([key, label]) => {
    const groupRows = rows.filter(row => row.card_group === key);
    const missedRows = groupRows.filter(row => row.correct !== 1);
    return {
      label,
      checks: groupRows.length,
      missedChecks: missedRows.length,
      accuracy: percent(groupRows.length - missedRows.length, groupRows.length),
      avgError: average(groupRows.map(row => row.absolute_error)),
      avgSignedError: average(groupRows.map(row => row.signed_error)),
      cardsOnMisses: missedRows.reduce((sum, row) => sum + (Number(row.card_count) || 0), 0)
    };
  });
}

export function buildSpeedBreakdown(checks: any[]) {
  const rows = queryAll(`
    SELECT
      c.id AS check_id,
      c.correct,
      c.absolute_error,
      c.response_time_ms,
      cc.dealer_speed,
      cc.deal_delay_ms,
      AVG(cc.ms_since_previous_visible_card) AS avg_visible_gap_ms
    FROM count_checks c
    JOIN count_check_cards cc ON cc.count_check_id = c.id
    GROUP BY c.id, cc.dealer_speed, cc.deal_delay_ms
    ORDER BY c.created_at ASC
  `);
  const sourceRows = rows.length
    ? rows
    : checks.map(row => ({
        check_id: row.id,
        correct: row.correct,
        absolute_error: row.absolute_error,
        response_time_ms: row.response_time_ms,
        dealer_speed: row.dealer_speed,
        deal_delay_ms: row.deal_delay_ms,
        avg_visible_gap_ms: null
      }));
  return groupedMetric(sourceRows, row => speedLabel(row.dealer_speed, row.deal_delay_ms)).map(
    group => {
      const matching = sourceRows.filter(
        row => speedLabel(row.dealer_speed, row.deal_delay_ms) === group.label
      );
      return {
        ...group,
        avgVisibleGapMs: Math.round(average(matching.map(row => row.avg_visible_gap_ms)))
      };
    }
  );
}

export function buildQuizSpacingMetrics(checks: any[], cards: number) {
  const gaps = checks.map(row => Number(row.cards_since_previous_check)).filter(Number.isFinite);
  const avgCardsPerCheck = average(gaps);
  const medianCardsPerCheck = percentile(gaps, 0.5);
  const p90CardsPerCheck = percentile(gaps, 0.9);
  const maxRecentGap = gaps.slice(-50).reduce((max, value) => Math.max(max, value), 0);
  const checksPer100Cards = cards ? round((checks.length / cards) * 100, 1) : 0;
  const baselineAccuracy = percent(checks.filter(row => row.correct === 1).length, checks.length);
  const baselineAvgError = average(checks.map(row => row.absolute_error));
  const groups = groupedMetric(checks, row => quizSpacingLabel(row.cards_since_previous_check)).map(
    group => ({
      ...group,
      atRisk:
        group.checks >= 3 &&
        (group.avgError >= baselineAvgError + 0.5 || group.accuracy <= baselineAccuracy - 10)
    })
  );
  const bucketOrder = ["1-5 cards", "6-10 cards", "11-15 cards", "16+ cards", "Unknown gap"];
  const buckets = bucketOrder
    .map(label => groups.find(group => group.label === label))
    .filter(Boolean);

  return {
    avgCardsPerCheck,
    medianCardsPerCheck,
    p90CardsPerCheck,
    maxRecentGap,
    checksPer100Cards,
    buckets
  };
}
