import type {
  AppSettings,
  CardObservedRequest,
  CountCheckSubmittedRequest,
  DeckCountdownRoundSubmittedRequest,
  FlashRoundSubmittedRequest,
  HandCompletedRequest,
  ShoeEndedRequest
} from "@blackjack/shared";
import { api } from "../../lib/api";

interface TrackerState {
  serverAvailable: boolean;
  trackingEnabled: boolean;
  sessionId: number | null;
  sessionPromise: Promise<number | null> | null;
  currentShoeId: number | null;
  shoePromise: Promise<number | null> | null;
  settings: AppSettings | null;
}

const state: TrackerState = {
  serverAvailable: false,
  trackingEnabled: true,
  sessionId: null,
  sessionPromise: null,
  currentShoeId: null,
  shoePromise: null,
  settings: null
};

const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}

export function subscribeTracking(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function trackingStatus() {
  return {
    serverAvailable: state.serverAvailable,
    trackingEnabled: state.trackingEnabled,
    sessionId: state.sessionId
  };
}

export function configureTracking(settings: AppSettings): void {
  state.settings = settings;
}

export async function initTracking(): Promise<void> {
  try {
    await api.analyticsSummary();
    state.serverAvailable = true;
  } catch {
    state.serverAvailable = false;
  }
  notify();
}

function shouldTrack(): boolean {
  return state.serverAvailable && state.trackingEnabled;
}

export async function toggleTracking(): Promise<void> {
  if (!state.serverAvailable) return;
  state.trackingEnabled = !state.trackingEnabled;
  notify();
  if (!state.sessionId) return;
  try {
    await api.patchSession(state.sessionId, { trackingEnabled: state.trackingEnabled });
  } catch {
    state.trackingEnabled = !state.trackingEnabled;
    notify();
  }
}

function ensureSession(): Promise<number | null> {
  if (!shouldTrack()) return Promise.resolve(null);
  if (state.sessionId) return Promise.resolve(state.sessionId);
  if (state.sessionPromise) return state.sessionPromise;
  state.sessionPromise = api
    .createSession({
      appVersion: "0.2.0",
      userAgent: navigator.userAgent,
      settings: state.settings ?? undefined
    })
    .then(data => {
      state.sessionId = data.id;
      state.trackingEnabled = data.trackingEnabled !== false;
      notify();
      return data.id;
    })
    .catch(() => {
      state.sessionPromise = null;
      return null;
    });
  return state.sessionPromise;
}

function ensureShoe(): Promise<number | null> {
  if (!shouldTrack()) return Promise.resolve(null);
  if (state.currentShoeId) return Promise.resolve(state.currentShoeId);
  if (state.shoePromise) return state.shoePromise;
  state.shoePromise = ensureSession().then(sessionId => {
    if (!sessionId || !state.settings) return null;
    return api
      .shoeStarted({ sessionId, settings: state.settings })
      .then(data => {
        state.currentShoeId = data.id ?? null;
        return state.currentShoeId;
      })
      .catch(() => null);
  });
  return state.shoePromise;
}

/** Reset per-shoe tracking ids (call when a new shoe is shuffled). */
export function trackStartShoe(): void {
  state.currentShoeId = null;
  state.shoePromise = null;
}

export function trackEndShoe(payload: Omit<ShoeEndedRequest, "shoeId">): void {
  if (!shouldTrack() || !state.sessionId || !state.currentShoeId) return;
  api.shoeEnded({ ...payload, shoeId: state.currentShoeId }).catch(() => {});
}

export function trackCard(payload: Omit<CardObservedRequest, "sessionId" | "shoeId">): void {
  if (!shouldTrack()) return;
  ensureShoe()
    .then(shoeId => {
      if (!shoeId || !state.sessionId) return;
      return api.cardObserved({ ...payload, sessionId: state.sessionId, shoeId });
    })
    .catch(() => {});
}

export function trackHand(payload: Omit<HandCompletedRequest, "sessionId" | "shoeId">): void {
  if (!shouldTrack()) return;
  ensureShoe()
    .then(shoeId => {
      if (!shoeId || !state.sessionId) return;
      return api.handCompleted({ ...payload, sessionId: state.sessionId, shoeId });
    })
    .catch(() => {});
}

export function trackCountCheck(
  payload: Omit<CountCheckSubmittedRequest, "sessionId" | "shoeId">,
  onRecorded?: () => void
): void {
  if (!shouldTrack()) return;
  ensureShoe()
    .then(shoeId => {
      if (!shoeId || !state.sessionId) return;
      return api.countCheckSubmitted({ ...payload, sessionId: state.sessionId, shoeId });
    })
    .then(() => onRecorded?.())
    .catch(() => {});
}

export function trackFlashRound(
  payload: Omit<FlashRoundSubmittedRequest, "sessionId">,
  onRecorded?: () => void
): void {
  if (!shouldTrack()) return;
  ensureSession()
    .then(sessionId => {
      if (!sessionId) return;
      return api.flashRoundSubmitted({ ...payload, sessionId });
    })
    .then(() => onRecorded?.())
    .catch(() => {});
}

export function trackDeckCountdownRound(
  payload: Omit<DeckCountdownRoundSubmittedRequest, "sessionId">,
  onRecorded?: () => void
): void {
  if (!shouldTrack()) return;
  ensureSession()
    .then(sessionId => {
      if (!sessionId) return;
      return api.deckCountdownRoundSubmitted({ ...payload, sessionId });
    })
    .then(() => onRecorded?.())
    .catch(() => {});
}
