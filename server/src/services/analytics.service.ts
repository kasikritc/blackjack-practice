import { firstValue, queryAll } from "../db/client.js";
import { average, percent, percentile } from "../util.js";
import {
  buildErrorDrivers,
  buildQuizSpacingMetrics,
  buildSpeedBreakdown,
  bestCorrectStreak,
  calculateMasteryScore,
  enrichCheckSettings,
  groupedMetric,
  masteryLevel,
  otherPlayersLabel,
  shoeDisplayLabel,
  trailingNoMajorErrorStreak,
  trailingStreak
} from "./metrics.js";

export function buildSummary() {
  const checks = queryAll(`
    SELECT
      c.*,
      COALESCE(c.number_of_other_players, sh.number_of_other_players, s.initial_number_of_other_players) AS number_of_other_players,
      COALESCE(c.shoe_display_mode, sh.shoe_display_mode, s.initial_shoe_display_mode) AS shoe_display_mode,
      COALESCE(c.dealer_speed, sh.dealer_speed) AS dealer_speed,
      sh.settings_json AS shoe_settings_json,
      s.settings_json AS session_settings_json
    FROM count_checks c
    LEFT JOIN shoes sh ON sh.id = c.shoe_id
    LEFT JOIN sessions s ON s.id = c.session_id
    ORDER BY c.created_at ASC
  `).map(enrichCheckSettings);
  const recent = checks.slice(-50);
  const correct = checks.filter(row => row.correct === 1).length;
  const recentCorrect = recent.filter(row => row.correct === 1).length;
  const avgError = average(checks.map(row => row.absolute_error));
  const recentAvgError = average(recent.map(row => row.absolute_error));
  const medianResponse = percentile(
    checks.map(row => row.response_time_ms),
    0.5
  );
  const p90Response = percentile(
    checks.map(row => row.response_time_ms),
    0.9
  );
  const currentStreak = trailingStreak(checks);
  const bestStreak = bestCorrectStreak(checks);
  const noMajorErrorStreak = trailingNoMajorErrorStreak(checks);
  const masteryScore = calculateMasteryScore(recent.length ? recent : checks);
  const cards = firstValue("SELECT COUNT(*) AS value FROM card_observations");
  const sessions = firstValue("SELECT COUNT(*) AS value FROM sessions");
  const shoes = firstValue("SELECT COUNT(*) AS value FROM shoes");
  const hands = firstValue("SELECT COUNT(*) AS value FROM hands");
  const totalPlayMs = firstValue(`
    SELECT COALESCE(SUM(span_ms), 0) AS value FROM (
      SELECT (julianday(MAX(completed_at)) - julianday(MIN(completed_at))) * 86400000 AS span_ms
      FROM hands GROUP BY session_id
    )
  `);
  const depth = groupedMetric(checks, row => {
    if (row.shoe_depth_percent < 33) return "Early shoe";
    if (row.shoe_depth_percent < 67) return "Middle shoe";
    return "Late shoe";
  });
  const pressure = groupedMetric(checks, row => {
    const magnitude = Math.abs(Number(row.correct_running_count) || 0);
    if (magnitude <= 2) return "Count 0-2";
    if (magnitude <= 5) return "Count 3-5";
    return "Count 6+";
  });
  const promptTypes = groupedMetric(checks, row => row.prompt_source || "unknown");
  const otherPlayers = groupedMetric(checks, row => otherPlayersLabel(row.number_of_other_players));
  const shoeDisplayModes = groupedMetric(checks, row => shoeDisplayLabel(row.shoe_display_mode));
  const errorDrivers = buildErrorDrivers();
  const speedBreakdown = buildSpeedBreakdown(checks);
  const quizSpacing = buildQuizSpacingMetrics(checks, cards);

  return {
    masteryScore,
    level: masteryLevel(masteryScore, checks.length),
    totals: { sessions, shoes, hands, cards, checks: checks.length, totalPlayMs },
    accuracy: percent(correct, checks.length),
    recentAccuracy: percent(recentCorrect, recent.length),
    avgError,
    recentAvgError,
    medianResponse,
    p90Response,
    currentStreak,
    bestStreak,
    noMajorErrorStreak,
    errorBuckets: {
      perfect: checks.filter(row => row.absolute_error === 0).length,
      one: checks.filter(row => row.absolute_error === 1).length,
      two: checks.filter(row => row.absolute_error === 2).length,
      major: checks.filter(row => row.absolute_error >= 3).length
    },
    depth,
    pressure,
    promptTypes,
    otherPlayers,
    shoeDisplayModes,
    errorDrivers,
    speedBreakdown,
    quizSpacing
  };
}

export function buildTrends(range: string) {
  const rows = queryAll(
    "SELECT date(created_at) AS day, correct, absolute_error, response_time_ms FROM count_checks ORDER BY created_at ASC"
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
    days: [...byDay.entries()].map(([day, checks]) => ({
      day,
      checks: checks.length,
      accuracy: percent(checks.filter(row => row.correct === 1).length, checks.length),
      avgError: average(checks.map(row => row.absolute_error)),
      medianResponse: percentile(
        checks.map(row => row.response_time_ms),
        0.5
      )
    }))
  };
}

export function recentSessions(limit = 10, sinceIso: string | null = null) {
  const whereClause = sinceIso ? `WHERE s.started_at >= '${sinceIso.replace(/'/g, "")}'` : "";
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit) || 10));
  return queryAll(`
    SELECT
      s.id,
      s.started_at,
      s.ended_at,
      COUNT(DISTINCT sh.id) AS shoes,
      COUNT(DISTINCT h.id) AS hands,
      COUNT(c.id) AS checks,
      ROUND(100.0 * AVG(CASE WHEN c.correct = 1 THEN 1 ELSE 0 END), 1) AS accuracy,
      ROUND(AVG(c.absolute_error), 2) AS avg_error,
      ROUND(AVG(c.response_time_ms)) AS avg_response_ms,
      ROUND((julianday(MAX(h.completed_at)) - julianday(MIN(h.completed_at))) * 86400000) AS play_ms
    FROM sessions s
    LEFT JOIN shoes sh ON sh.session_id = s.id
    LEFT JOIN hands h ON h.session_id = s.id
    LEFT JOIN count_checks c ON c.session_id = s.id
    ${whereClause}
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ${safeLimit}
  `);
}
