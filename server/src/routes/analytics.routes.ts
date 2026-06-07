import { Router } from "express";
import { runSql } from "../db/client.js";
import { buildSummary, buildTrends, recentSessions } from "../services/analytics.service.js";
import {
  buildFlashSummary,
  buildFlashTrends,
  flashRecentSessions
} from "../services/flashAnalytics.service.js";
import {
  buildDeckCountdownSummary,
  buildDeckCountdownTrends,
  deckCountdownRecentSessions
} from "../services/deckCountdownAnalytics.service.js";
import { clampInt, rangeToSinceIso } from "../util.js";

export const analyticsRouter = Router();

analyticsRouter.get("/analytics/summary", (_req, res) => {
  res.status(200).json(buildSummary());
});

analyticsRouter.get("/analytics/trends", (req, res) => {
  res.status(200).json(buildTrends((req.query.range as string) || "all"));
});

analyticsRouter.get("/analytics/sessions", (req, res) => {
  const limit = clampInt(req.query.limit, 10, 1, 500);
  const range = (req.query.range as string) || "all";
  res.status(200).json({ sessions: recentSessions(limit, rangeToSinceIso(range)), limit, range });
});

analyticsRouter.delete("/analytics", (_req, res) => {
  runSql(
    "DELETE FROM count_check_cards; DELETE FROM count_checks; DELETE FROM card_observations; DELETE FROM hands; DELETE FROM shoes; DELETE FROM sessions;"
  );
  res.status(200).json({ ok: true });
});

analyticsRouter.get("/analytics/flash-summary", (_req, res) => {
  res.status(200).json(buildFlashSummary());
});

analyticsRouter.get("/analytics/flash-trends", (req, res) => {
  res.status(200).json(buildFlashTrends((req.query.range as string) || "all"));
});

analyticsRouter.get("/analytics/flash-sessions", (req, res) => {
  const limit = clampInt(req.query.limit, 10, 1, 500);
  const range = (req.query.range as string) || "all";
  res
    .status(200)
    .json({ sessions: flashRecentSessions(limit, rangeToSinceIso(range)), limit, range });
});

analyticsRouter.delete("/analytics/flash", (_req, res) => {
  runSql("DELETE FROM flash_round_cards; DELETE FROM flash_rounds;");
  res.status(200).json({ ok: true });
});

analyticsRouter.get("/analytics/deck-countdown-summary", (_req, res) => {
  res.status(200).json(buildDeckCountdownSummary());
});

analyticsRouter.get("/analytics/deck-countdown-trends", (req, res) => {
  res.status(200).json(buildDeckCountdownTrends((req.query.range as string) || "all"));
});

analyticsRouter.get("/analytics/deck-countdown-sessions", (req, res) => {
  const limit = clampInt(req.query.limit, 10, 1, 500);
  const range = (req.query.range as string) || "all";
  res.status(200).json({
    sessions: deckCountdownRecentSessions(limit, rangeToSinceIso(range)),
    limit,
    range
  });
});

analyticsRouter.delete("/analytics/deck-countdown", (_req, res) => {
  runSql("DELETE FROM deck_countdown_rounds;");
  res.status(200).json({ ok: true });
});
