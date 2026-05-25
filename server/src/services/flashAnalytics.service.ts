import { firstValue, queryAll } from "../db/client.js";
import { average, percent, percentile } from "../util.js";
import {
  bestCorrectStreak,
  calculateMasteryScore,
  groupedMetric,
  masteryLevel,
  trailingNoMajorErrorStreak,
  trailingStreak
} from "./metrics.js";

export function buildFlashSummary() {
  const rounds = queryAll("SELECT * FROM flash_rounds ORDER BY created_at ASC");
  const recent = rounds.slice(-50);
  const correct = rounds.filter(row => row.correct === 1).length;
  const recentCorrect = recent.filter(row => row.correct === 1).length;
  const sessions = firstValue("SELECT COUNT(DISTINCT session_id) AS value FROM flash_rounds");
  const cards = firstValue("SELECT COUNT(*) AS value FROM flash_round_cards");
  const byCardCount = groupedMetric(rounds, row => `${row.num_cards} cards`).sort(
    (a, b) => Number.parseInt(a.label, 10) - Number.parseInt(b.label, 10)
  );
  const masteryScore = calculateMasteryScore(recent.length ? recent : rounds);

  return {
    masteryScore,
    level: masteryLevel(masteryScore, rounds.length),
    totals: { rounds: rounds.length, cards, sessions, correct },
    accuracy: percent(correct, rounds.length),
    recentAccuracy: percent(recentCorrect, recent.length),
    avgError: average(rounds.map(row => row.absolute_error)),
    recentAvgError: average(recent.map(row => row.absolute_error)),
    avgCards: average(rounds.map(row => row.num_cards)),
    medianResponse: percentile(
      rounds.map(row => row.response_time_ms),
      0.5
    ),
    p90Response: percentile(
      rounds.map(row => row.response_time_ms),
      0.9
    ),
    currentStreak: trailingStreak(rounds),
    bestStreak: bestCorrectStreak(rounds),
    noMajorErrorStreak: trailingNoMajorErrorStreak(rounds),
    errorBuckets: {
      perfect: rounds.filter(row => row.absolute_error === 0).length,
      one: rounds.filter(row => row.absolute_error === 1).length,
      two: rounds.filter(row => row.absolute_error === 2).length,
      major: rounds.filter(row => row.absolute_error >= 3).length
    },
    byCardCount
  };
}

export function buildFlashTrends(range: string) {
  const rows = queryAll(
    "SELECT date(created_at) AS day, correct, absolute_error, response_time_ms FROM flash_rounds ORDER BY created_at ASC"
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

export function flashRecentSessions(limit = 10, sinceIso: string | null = null) {
  const whereClause = sinceIso ? `WHERE s.started_at >= '${sinceIso.replace(/'/g, "")}'` : "";
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit) || 10));
  return queryAll(`
    SELECT
      s.id,
      s.started_at,
      s.ended_at,
      COUNT(fr.id) AS checks,
      ROUND(100.0 * AVG(CASE WHEN fr.correct = 1 THEN 1 ELSE 0 END), 1) AS accuracy,
      ROUND(AVG(fr.absolute_error), 2) AS avg_error,
      ROUND(AVG(fr.response_time_ms)) AS avg_response_ms,
      ROUND(AVG(fr.num_cards), 1) AS avg_cards
    FROM sessions s
    JOIN flash_rounds fr ON fr.session_id = s.id
    ${whereClause}
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ${safeLimit}
  `);
}
