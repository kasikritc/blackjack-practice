import { firstValue, queryAll } from "../db/client.js";
import { average, percent, percentile } from "../util.js";
import {
  bestCorrectStreak,
  groupedMetric,
  masteryLevel,
  trailingNoMajorErrorStreak,
  trailingStreak
} from "./metrics.js";

function deckCountdownMasteryScore(rows: any[]): number {
  if (!rows.length) return 0;
  const accuracyScore = percent(rows.filter(row => row.correct === 1).length, rows.length);
  const errorScore = Math.max(0, 100 - average(rows.map(row => row.absolute_error)) * 24);
  const paceRows = rows
    .map(row => {
      const decks = Math.max(1, Number(row.deck_count) || 1);
      const ms = Number(row.response_time_ms) || 0;
      return ms / decks;
    })
    .filter(Number.isFinite);
  const medianPace = percentile(paceRows, 0.5);
  const speedScore = Math.max(0, Math.min(100, 100 - Math.max(0, medianPace - 30000) / 450));
  const majorPenalty = Math.min(35, rows.filter(row => row.absolute_error >= 3).length * 7);
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(accuracyScore * 0.6 + errorScore * 0.25 + speedScore * 0.15 - majorPenalty)
    )
  );
}

export function buildDeckCountdownSummary() {
  const rounds = queryAll("SELECT * FROM deck_countdown_rounds ORDER BY created_at ASC");
  const recent = rounds.slice(-50);
  const correct = rounds.filter(row => row.correct === 1).length;
  const recentCorrect = recent.filter(row => row.correct === 1).length;
  const sessions = firstValue(
    "SELECT COUNT(DISTINCT session_id) AS value FROM deck_countdown_rounds"
  );
  const cards = firstValue(
    "SELECT COALESCE(SUM(total_cards), 0) AS value FROM deck_countdown_rounds"
  );
  const masteryScore = deckCountdownMasteryScore(recent.length ? recent : rounds);
  const successfulTimes = rounds
    .filter(row => row.correct === 1)
    .map(row => Number(row.response_time_ms))
    .filter(value => Number.isFinite(value) && value > 0);

  return {
    masteryScore,
    level: masteryLevel(masteryScore, rounds.length),
    totals: { rounds: rounds.length, cards, sessions, correct },
    accuracy: percent(correct, rounds.length),
    recentAccuracy: percent(recentCorrect, recent.length),
    avgError: average(rounds.map(row => row.absolute_error)),
    recentAvgError: average(recent.map(row => row.absolute_error)),
    avgCards: average(rounds.map(row => row.total_cards)),
    avgDecks: average(rounds.map(row => row.deck_count)),
    medianResponse: percentile(
      rounds.map(row => row.response_time_ms),
      0.5
    ),
    p90Response: percentile(
      rounds.map(row => row.response_time_ms),
      0.9
    ),
    bestTimeMs: successfulTimes.length ? Math.min(...successfulTimes) : 0,
    currentStreak: trailingStreak(rounds),
    bestStreak: bestCorrectStreak(rounds),
    noMajorErrorStreak: trailingNoMajorErrorStreak(rounds),
    errorBuckets: {
      perfect: rounds.filter(row => row.absolute_error === 0).length,
      one: rounds.filter(row => row.absolute_error === 1).length,
      two: rounds.filter(row => row.absolute_error === 2).length,
      major: rounds.filter(row => row.absolute_error >= 3).length
    },
    byDeckCount: groupedMetric(
      rounds,
      row => `${row.deck_count || 0} deck${Number(row.deck_count) === 1 ? "" : "s"}`
    ),
    byCardsPerFlip: groupedMetric(rounds, row => `${row.cards_per_flip || 0} cards/flip`),
    byFlipMode: groupedMetric(rounds, row => (row.flip_mode === "auto" ? "Automatic" : "Manual"))
  };
}

export function buildDeckCountdownTrends(range: string) {
  const rows = queryAll(
    "SELECT date(created_at) AS day, correct, absolute_error, response_time_ms FROM deck_countdown_rounds ORDER BY created_at ASC"
  );
  const cutoff = range === "7d" ? 7 : range === "30d" ? 30 : null;
  const now = Date.now();
  const filtered = cutoff
    ? rows.filter(row => (now - new Date(`${row.day}T00:00:00Z`).getTime()) / 86400000 <= cutoff)
    : rows;
  const byDay = new Map<string, any[]>();
  for (const row of filtered) {
    const bucket = byDay.get(row.day) || [];
    bucket.push(row);
    byDay.set(row.day, bucket);
  }
  return {
    range,
    days: [...byDay.entries()].map(([day, dayRounds]) => ({
      day,
      checks: dayRounds.length,
      accuracy: percent(dayRounds.filter(row => row.correct === 1).length, dayRounds.length),
      avgError: average(dayRounds.map(row => row.absolute_error)),
      medianResponse: percentile(
        dayRounds.map(row => row.response_time_ms),
        0.5
      )
    }))
  };
}

export function deckCountdownRecentSessions(limit = 10, sinceIso: string | null = null) {
  const whereClause = sinceIso ? `WHERE s.started_at >= '${sinceIso.replace(/'/g, "")}'` : "";
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit) || 10));
  return queryAll(`
    SELECT
      s.id,
      s.started_at,
      s.ended_at,
      COUNT(dcr.id) AS checks,
      ROUND(100.0 * AVG(CASE WHEN dcr.correct = 1 THEN 1 ELSE 0 END), 1) AS accuracy,
      ROUND(AVG(dcr.absolute_error), 2) AS avg_error,
      ROUND(AVG(dcr.response_time_ms)) AS avg_response_ms,
      ROUND(AVG(dcr.deck_count), 1) AS avg_decks,
      ROUND(AVG(dcr.cards_per_flip), 1) AS avg_cards_per_flip,
      COALESCE(SUM(dcr.total_cards), 0) AS cards
    FROM sessions s
    JOIN deck_countdown_rounds dcr ON dcr.session_id = s.id
    ${whereClause}
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ${safeLimit}
  `);
}
