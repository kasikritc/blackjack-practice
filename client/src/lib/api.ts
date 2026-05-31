import type {
  AnalyticsRange,
  AnalyticsSummary,
  AnalyticsTrends,
  CardObservedRequest,
  CountCheckSubmittedRequest,
  CreateSessionRequest,
  DeckCountdownRoundSubmittedRequest,
  CreateSessionResponse,
  CreatedResponse,
  DeckCountdownSummary,
  FlashRoundSubmittedRequest,
  FlashSummary,
  HandCompletedRequest,
  RecentSessionsResponse,
  ShoeEndedRequest,
  ShoeStartedRequest,
  StrategyAttemptRequest,
  StrategyData,
  StrategyMutationResponse
} from "@blackjack/shared";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export const api = {
  // Sessions
  createSession: (payload: CreateSessionRequest) =>
    request<CreateSessionResponse>("POST", "/api/sessions", payload),
  patchSession: (id: number, payload: { trackingEnabled?: boolean; ended?: boolean }) =>
    request<{ ok: boolean }>("PATCH", `/api/sessions/${id}`, payload),

  // Table events
  shoeStarted: (payload: ShoeStartedRequest) =>
    request<CreatedResponse>("POST", "/api/events/shoe-started", payload),
  shoeEnded: (payload: ShoeEndedRequest) =>
    request<{ ok: boolean }>("PATCH", "/api/events/shoe-ended", payload),
  handCompleted: (payload: HandCompletedRequest) =>
    request<CreatedResponse>("POST", "/api/events/hand-completed", payload),
  cardObserved: (payload: CardObservedRequest) =>
    request<CreatedResponse>("POST", "/api/events/card-observed", payload),
  countCheckSubmitted: (payload: CountCheckSubmittedRequest) =>
    request<CreatedResponse>("POST", "/api/events/count-check-submitted", payload),

  // Flash events
  flashRoundSubmitted: (payload: FlashRoundSubmittedRequest) =>
    request<CreatedResponse>("POST", "/api/events/flash-round-submitted", payload),

  // Deck countdown events
  deckCountdownRoundSubmitted: (payload: DeckCountdownRoundSubmittedRequest) =>
    request<CreatedResponse>("POST", "/api/events/deck-countdown-round-submitted", payload),

  // Strategy
  strategyAttempt: (payload: StrategyAttemptRequest) =>
    request<CreatedResponse>("POST", "/api/events/strategy-attempt", payload),
  getStrategy: () => request<StrategyData>("GET", "/api/strategy"),
  createRuleProfile: (payload: { name?: string; rules?: unknown }) =>
    request<StrategyMutationResponse>("POST", "/api/strategy/rule-profiles", payload),
  updateRuleProfile: (id: number, payload: { name?: string; rules?: unknown }) =>
    request<StrategyMutationResponse>("PATCH", `/api/strategy/rule-profiles/${id}`, payload),
  createChart: (payload: {
    ruleProfileId?: number;
    name?: string;
    chart?: unknown;
    cloneFromChartId?: number;
  }) => request<StrategyMutationResponse>("POST", "/api/strategy/charts", payload),
  updateChart: (id: number, payload: { ruleProfileId?: number; name?: string; chart?: unknown }) =>
    request<StrategyMutationResponse>("PATCH", `/api/strategy/charts/${id}`, payload),
  createSubset: (payload: {
    chartId?: number;
    name?: string;
    criteria?: unknown;
    isDefault?: boolean;
  }) => request<StrategyMutationResponse>("POST", "/api/strategy/subsets", payload),
  updateSubset: (
    id: number,
    payload: { chartId?: number; name?: string; criteria?: unknown; isDefault?: boolean }
  ) => request<StrategyMutationResponse>("PATCH", `/api/strategy/subsets/${id}`, payload),

  // Analytics (table)
  analyticsSummary: () => request<AnalyticsSummary>("GET", "/api/analytics/summary"),
  analyticsTrends: (range: AnalyticsRange) =>
    request<AnalyticsTrends>("GET", `/api/analytics/trends?range=${range}`),
  analyticsSessions: (limit: number, range: AnalyticsRange) =>
    request<RecentSessionsResponse>("GET", `/api/analytics/sessions?limit=${limit}&range=${range}`),
  resetAnalytics: () => request<{ ok: boolean }>("DELETE", "/api/analytics"),

  // Analytics (flash)
  flashSummary: () => request<FlashSummary>("GET", "/api/analytics/flash-summary"),
  flashTrends: (range: AnalyticsRange) =>
    request<AnalyticsTrends>("GET", `/api/analytics/flash-trends?range=${range}`),
  flashSessions: (limit: number, range: AnalyticsRange) =>
    request<RecentSessionsResponse>(
      "GET",
      `/api/analytics/flash-sessions?limit=${limit}&range=${range}`
    ),
  resetFlashAnalytics: () => request<{ ok: boolean }>("DELETE", "/api/analytics/flash"),

  // Analytics (deck countdown)
  deckCountdownSummary: () =>
    request<DeckCountdownSummary>("GET", "/api/analytics/deck-countdown-summary"),
  deckCountdownTrends: (range: AnalyticsRange) =>
    request<AnalyticsTrends>("GET", `/api/analytics/deck-countdown-trends?range=${range}`),
  deckCountdownSessions: (limit: number, range: AnalyticsRange) =>
    request<RecentSessionsResponse>(
      "GET",
      `/api/analytics/deck-countdown-sessions?limit=${limit}&range=${range}`
    ),
  resetDeckCountdownAnalytics: () =>
    request<{ ok: boolean }>("DELETE", "/api/analytics/deck-countdown")
};

/** Best-effort POST that never throws — analytics must not break gameplay. */
export function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => {
    /* tracking is non-critical */
  });
}
