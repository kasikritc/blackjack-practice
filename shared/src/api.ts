// Request / response DTOs for the REST API. Field names match the legacy server
// contract exactly so the existing SQLite data and analytics stay compatible.

import type { AppSettings } from "./settings.js";
import type { StrategyData } from "./strategy.js";

export type AnalyticsRange = "7d" | "30d" | "all";

export interface CardPayload {
  visibleOrder: number;
  rank: string;
  suit: string;
  hiLoValue: number;
  runningCountAfter?: number;
  seatRole?: string;
  seatName?: string;
  dealerHoleReveal?: boolean;
  numberOfOtherPlayers?: number;
  shoeDisplayMode?: string;
  dealerSpeed?: string;
  dealDelayMs?: number;
  playerThinkDelayMs?: number;
  dealerThinkDelayMs?: number;
  countPromptDelayMs?: number;
  msSincePreviousVisibleCard?: number;
}

export interface CreateSessionRequest {
  appVersion?: string;
  userAgent?: string;
  settings?: Partial<AppSettings>;
}

export interface CreateSessionResponse {
  id: number;
  trackingEnabled: boolean;
}

export interface ShoeStartedRequest {
  sessionId: number;
  settings: Partial<AppSettings>;
}

export interface ShoeEndedRequest {
  shoeId: number;
  cardsDealt?: number;
  cutCardReached?: boolean;
  finalRunningCount?: number;
}

export interface HandCompletedRequest {
  sessionId: number;
  shoeId?: number;
  handNumber?: number;
  durationMs?: number;
  outcome?: string;
  cardsDealt?: number;
  visibleCardsCounted?: number;
  runningCountBefore?: number;
  runningCountAfter?: number;
  shoeDepthPercent?: number;
  decksRemaining?: number;
}

export interface CardObservedRequest extends CardPayload {
  sessionId: number;
  shoeId?: number;
  handNumber?: number;
  runningCountAfter?: number;
  shoeDepthPercent?: number;
  decksRemaining?: number;
}

export interface CountCheckSubmittedRequest {
  sessionId: number;
  shoeId?: number;
  handNumber?: number;
  promptSource?: string;
  correctRunningCount?: number;
  userAnswer?: number;
  signedError?: number;
  absoluteError?: number;
  correct?: boolean;
  responseTimeMs?: number;
  cardsSincePreviousCheck?: number;
  previousCount?: number;
  netCountDelta?: number;
  shoeDepthPercent?: number;
  decksRemaining?: number;
  numberOfOtherPlayers?: number;
  shoeDisplayMode?: string;
  countCheckMode?: string;
  dealerSpeed?: string;
  cards?: CardPayload[];
}

export interface FlashRoundSubmittedRequest {
  sessionId: number;
  numCards?: number;
  correctCount?: number;
  userAnswer?: number;
  signedError?: number;
  absoluteError?: number;
  correct?: boolean;
  responseTimeMs?: number;
  flashDurationMs?: number;
  minCards?: number;
  maxCards?: number;
  cards?: CardPayload[];
}

export interface DeckCountdownRoundSubmittedRequest {
  sessionId: number;
  deckCount?: number;
  totalCards?: number;
  omittedCardCount?: number;
  cardsPerFlip?: number;
  flipMode?: string;
  autoIntervalMs?: number;
  stopwatchShown?: boolean;
  correctCount?: number;
  userAnswer?: number;
  signedError?: number;
  absoluteError?: number;
  correct?: boolean;
  responseTimeMs?: number;
}

export interface StrategyAttemptRequest {
  ruleProfileId?: number;
  chartId?: number;
  subsetId?: number;
  handNumber?: number;
  category?: string;
  rowKey?: string;
  dealerUpcard?: string;
  playerCards?: unknown[];
  action?: string;
  expectedAction?: string;
  correct?: boolean;
  responseTimeMs?: number;
}

export interface CreatedResponse {
  id: number | null;
}

export interface StrategyMutationResponse extends StrategyData {
  id?: number;
  ok?: boolean;
}

// --- Analytics response shapes ---------------------------------------------

export interface MetricGroup {
  label: string;
  checks: number;
  accuracy: number;
  avgError: number;
  medianResponse: number;
  [key: string]: unknown;
}

export interface ErrorBuckets {
  perfect: number;
  one: number;
  two: number;
  major: number;
}

export interface AnalyticsSummary {
  masteryScore: number;
  level: string;
  totals: {
    sessions: number;
    shoes: number;
    hands: number;
    cards: number;
    checks: number;
    totalPlayMs: number;
  };
  accuracy: number;
  recentAccuracy: number;
  avgError: number;
  recentAvgError: number;
  medianResponse: number;
  p90Response: number;
  currentStreak: number;
  bestStreak: number;
  noMajorErrorStreak: number;
  errorBuckets: ErrorBuckets;
  depth: MetricGroup[];
  pressure: MetricGroup[];
  promptTypes: MetricGroup[];
  otherPlayers: MetricGroup[];
  shoeDisplayModes: MetricGroup[];
  errorDrivers: unknown[];
  speedBreakdown: MetricGroup[];
  quizSpacing: {
    avgCardsPerCheck: number;
    medianCardsPerCheck: number;
    p90CardsPerCheck: number;
    maxRecentGap: number;
    checksPer100Cards: number;
    buckets: MetricGroup[];
  };
}

export interface TrendDay {
  day: string;
  checks: number;
  accuracy: number;
  avgError: number;
  medianResponse: number;
  cleanTimePerDeckMs?: number;
}

export interface AnalyticsTrends {
  range: string;
  days: TrendDay[];
}

export interface SessionRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  [key: string]: unknown;
}

export interface RecentSessionsResponse {
  sessions: SessionRow[];
  limit: number;
  range: string;
}

export interface FlashSummary {
  masteryScore: number;
  level: string;
  totals: { rounds: number; cards: number; sessions: number; correct: number };
  accuracy: number;
  recentAccuracy: number;
  avgError: number;
  recentAvgError: number;
  avgCards: number;
  medianResponse: number;
  p90Response: number;
  currentStreak: number;
  bestStreak: number;
  noMajorErrorStreak: number;
  errorBuckets: ErrorBuckets;
  byCardCount: MetricGroup[];
}

export interface DeckCountdownSummary {
  masteryScore: number;
  level: string;
  totals: { rounds: number; cards: number; sessions: number; correct: number };
  accuracy: number;
  recentAccuracy: number;
  avgError: number;
  recentAvgError: number;
  avgCards: number;
  avgDecks: number;
  medianResponse: number;
  p90Response: number;
  bestTimeMs: number;
  currentStreak: number;
  bestStreak: number;
  noMajorErrorStreak: number;
  errorBuckets: ErrorBuckets;
  byDeckCount: MetricGroup[];
  byCardsPerFlip: MetricGroup[];
  byFlipMode: MetricGroup[];
}
