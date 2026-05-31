import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AppSettings, DeckCountdownSummary } from "@blackjack/shared";
import { PlayingCard } from "../../components/PlayingCard";
import { TopBar } from "../../components/TopBar";
import { api } from "../../lib/api";
import { formatCards, formatMs, formatPercent } from "../../lib/format";
import {
  clampDeckCountdownCardsPerFlip,
  clampDeckCountdownDecks,
  clampDeckCountdownInterval
} from "../../lib/settings";
import { makeShoe, signed, type GameCard } from "../../lib/cards";
import { useSettings } from "../../lib/useSettings";
import { TrackingControls } from "../analytics/AnalyticsShared";
import { configureTracking, trackDeckCountdownRound } from "../analytics/tracker";
import { DeckCountdownAnalytics } from "./DeckCountdownAnalytics";

type Phase = "idle" | "countdown" | "running" | "complete" | "feedback";

const DECK_CHOICES = [1, 2, 4, 6, 8];

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function makeCountdownDeck(deckCount: number): GameCard[] {
  return makeShoe(deckCount, 100).cards.map(card => ({ ...card, visible: true }));
}

function DeckCountdownStatsBar({ stats }: { stats: DeckCountdownSummary | null }) {
  const rounds = stats?.totals?.rounds || 0;
  return (
    <div className="flash-stats" aria-label="Deck countdown stats">
      <span className="flash-stat">
        <strong>{rounds ? `${formatPercent(stats!.recentAccuracy)}%` : "—"}</strong>
        <small>Recent accuracy</small>
      </span>
      <span className="flash-stat">
        <strong>{rounds}</strong>
        <small>Rounds</small>
      </span>
      <span className="flash-stat">
        <strong>{stats?.currentStreak || 0}</strong>
        <small>Streak</small>
      </span>
      <span className="flash-stat">
        <strong>{stats?.bestTimeMs ? formatMs(stats.bestTimeMs) : "—"}</strong>
        <small>Best time</small>
      </span>
      <span className="flash-stat">
        <strong>{rounds ? formatMs(stats!.medianResponse) : "—"}</strong>
        <small>Median time</small>
      </span>
    </div>
  );
}

export function DeckCountdown() {
  const [settings, setSettings] = useSettings();
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentCards, setCurrentCards] = useState<GameCard[]>([]);
  const [cardsShown, setCardsShown] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState("Press Enter or Flip card to start.");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    value: number;
    elapsedMs: number;
  } | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [stats, setStats] = useState<DeckCountdownSummary | null>(null);

  const deckRef = useRef<GameCard[]>([]);
  const nextIndexRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const finishedElapsedRef = useRef(0);
  const autoTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    configureTracking(settings);
  }, [settings]);

  const refreshStats = useCallback(() => {
    api
      .deckCountdownSummary()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const clearTimers = useCallback(() => {
    if (autoTimerRef.current) window.clearInterval(autoTimerRef.current);
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    autoTimerRef.current = null;
    countdownTimerRef.current = null;
    elapsedTimerRef.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const startElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = window.setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);
  }, []);

  const finishRun = useCallback(() => {
    if (autoTimerRef.current) window.clearInterval(autoTimerRef.current);
    autoTimerRef.current = null;
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
    const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    finishedElapsedRef.current = elapsed;
    setElapsedMs(elapsed);
    setPhase("complete");
    setStatus("Deck complete. Enter your ending count.");
  }, []);

  const flipNextGroup = useCallback(() => {
    if (!deckRef.current.length) return true;
    if (!startedAtRef.current) {
      startedAtRef.current = Date.now();
      startElapsedTimer();
    }
    const cardsPerFlip = clampDeckCountdownCardsPerFlip(settings.deckCountdownCardsPerFlip);
    const start = nextIndexRef.current;
    const end = Math.min(deckRef.current.length, start + cardsPerFlip);
    setCurrentCards(deckRef.current.slice(start, end));
    nextIndexRef.current = end;
    setCardsShown(end);
    setPhase("running");
    setStatus(`${formatCards(end)} of ${formatCards(deckRef.current.length)} shown.`);
    if (end >= deckRef.current.length) {
      finishRun();
      return true;
    }
    return false;
  }, [finishRun, settings.deckCountdownCardsPerFlip, startElapsedTimer]);

  const prepareRun = useCallback(() => {
    clearTimers();
    const deckCount = clampDeckCountdownDecks(settings.deckCountdownDecks);
    deckRef.current = makeCountdownDeck(deckCount);
    nextIndexRef.current = 0;
    startedAtRef.current = null;
    finishedElapsedRef.current = 0;
    setCurrentCards([]);
    setCardsShown(0);
    setElapsedMs(0);
    setAnswer("");
    setFeedback(null);
  }, [clearTimers, settings.deckCountdownDecks]);

  const resetRun = useCallback(() => {
    clearTimers();
    deckRef.current = [];
    nextIndexRef.current = 0;
    startedAtRef.current = null;
    finishedElapsedRef.current = 0;
    setPhase("idle");
    setCurrentCards([]);
    setCardsShown(0);
    setElapsedMs(0);
    setAnswer("");
    setFeedback(null);
    setStatus("Press Enter or Flip card to start.");
  }, [clearTimers]);

  const flipManual = useCallback(() => {
    if (settings.deckCountdownFlipMode !== "manual") return;
    if (phase === "complete" || phase === "countdown") return;
    if (phase === "idle" || phase === "feedback") prepareRun();
    flipNextGroup();
  }, [flipNextGroup, phase, prepareRun, settings.deckCountdownFlipMode]);

  const startAuto = useCallback(() => {
    if (phase === "countdown" || phase === "running") return;
    prepareRun();
    let count = 3;
    setCountdown(count);
    setPhase("countdown");
    setStatus("Get ready.");
    countdownTimerRef.current = window.setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        return;
      }
      if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      const done = flipNextGroup();
      if (!done) {
        autoTimerRef.current = window.setInterval(() => {
          flipNextGroup();
        }, clampDeckCountdownInterval(settings.deckCountdownAutoIntervalMs));
      }
    }, 1000);
  }, [flipNextGroup, phase, prepareRun, settings.deckCountdownAutoIntervalMs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (analyticsOpen || isTextEntry(event.target)) return;
      if (event.key !== "Enter") return;
      if (
        settings.deckCountdownFlipMode === "manual" &&
        (phase === "idle" || phase === "running")
      ) {
        event.preventDefault();
        flipManual();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [analyticsOpen, flipManual, phase, settings.deckCountdownFlipMode]);

  const updateSettings = (patch: Partial<AppSettings>) => setSettings({ ...settings, ...patch });

  const submitFinalCount = (event: FormEvent) => {
    event.preventDefault();
    if (phase !== "complete") return;
    const value = Math.trunc(Number(answer));
    if (!Number.isFinite(value)) return;
    const signedError = value;
    const correct = value === 0;
    const elapsed = finishedElapsedRef.current || elapsedMs;
    setFeedback({ correct, value, elapsedMs: elapsed });
    setPhase("feedback");
    setStatus(
      correct ? "Correct. The final count is 0." : "Incorrect. A complete deck count ends at 0."
    );
    trackDeckCountdownRound(
      {
        deckCount: clampDeckCountdownDecks(settings.deckCountdownDecks),
        totalCards: deckRef.current.length,
        cardsPerFlip: clampDeckCountdownCardsPerFlip(settings.deckCountdownCardsPerFlip),
        flipMode: settings.deckCountdownFlipMode,
        autoIntervalMs:
          settings.deckCountdownFlipMode === "auto"
            ? clampDeckCountdownInterval(settings.deckCountdownAutoIntervalMs)
            : undefined,
        stopwatchShown: settings.deckCountdownShowStopwatch,
        correctCount: 0,
        userAnswer: value,
        signedError,
        absoluteError: Math.abs(signedError),
        correct,
        responseTimeMs: elapsed
      },
      refreshStats
    );
  };

  const active = phase === "countdown" || phase === "running" || phase === "complete";
  const totalCards = clampDeckCountdownDecks(settings.deckCountdownDecks) * 52;
  const progress = totalCards ? Math.round((cardsShown / totalCards) * 100) : 0;

  return (
    <div className="drill deck-countdown-shell" data-mode="deck-countdown">
      <TopBar eyebrow="Deck Countdown" title="Deck Countdown">
        <button type="button" className="ghost-button" onClick={() => setAnalyticsOpen(true)}>
          <span>Analytics</span>
        </button>
      </TopBar>

      <DeckCountdownStatsBar stats={stats} />

      <section className="deck-config" aria-label="Deck countdown settings">
        <label>
          Decks
          <select
            value={settings.deckCountdownDecks}
            disabled={active}
            onChange={e =>
              updateSettings({ deckCountdownDecks: clampDeckCountdownDecks(e.target.value) })
            }
          >
            {DECK_CHOICES.map(choice => (
              <option value={choice} key={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cards per flip
          <input
            type="number"
            min={1}
            max={8}
            disabled={active}
            value={settings.deckCountdownCardsPerFlip}
            onChange={e => updateSettings({ deckCountdownCardsPerFlip: Number(e.target.value) })}
            onBlur={e =>
              updateSettings({
                deckCountdownCardsPerFlip: clampDeckCountdownCardsPerFlip(e.target.value)
              })
            }
          />
        </label>
        <label>
          Mode
          <select
            value={settings.deckCountdownFlipMode}
            disabled={active}
            onChange={e =>
              updateSettings({
                deckCountdownFlipMode: e.target.value as AppSettings["deckCountdownFlipMode"]
              })
            }
          >
            <option value="manual">Manual</option>
            <option value="auto">Automatic</option>
          </select>
        </label>
        <label>
          Auto speed
          <input
            type="range"
            min={200}
            max={3000}
            step={100}
            disabled={active || settings.deckCountdownFlipMode !== "auto"}
            value={settings.deckCountdownAutoIntervalMs}
            onChange={e => updateSettings({ deckCountdownAutoIntervalMs: Number(e.target.value) })}
          />
          <span>{settings.deckCountdownAutoIntervalMs} ms</span>
        </label>
        <label className="deck-checkbox">
          <input
            type="checkbox"
            checked={settings.deckCountdownShowStopwatch}
            disabled={active}
            onChange={e => updateSettings({ deckCountdownShowStopwatch: e.target.checked })}
          />
          <span>Show stopwatch</span>
        </label>
      </section>

      <section className="flash-stage deck-countdown-stage">
        {phase === "countdown" ? <div className="countdown-number">{countdown}</div> : null}

        <div className="flash-cards deck-countdown-cards" aria-live="polite">
          {currentCards.map(card => (
            <PlayingCard key={card.id} card={card} faceUp />
          ))}
        </div>

        {phase === "complete" ? (
          <form className="deck-final-form" onSubmit={submitFinalCount}>
            <label>
              Ending count
              <input
                autoFocus
                inputMode="numeric"
                type="number"
                value={answer}
                onChange={e => setAnswer(e.target.value)}
              />
            </label>
            <button type="submit" className="primary-button">
              Submit
            </button>
          </form>
        ) : null}

        {feedback ? (
          <div className={`deck-feedback ${feedback.correct ? "correct" : "incorrect"}`}>
            <strong>{feedback.correct ? "Correct" : "Incorrect"}</strong>
            <span>
              Submitted {signed(feedback.value)} · correct count 0 · {formatMs(feedback.elapsedMs)}
            </span>
          </div>
        ) : null}
      </section>

      <div className="deck-progress" aria-label="Deck countdown progress">
        <span>{formatCards(cardsShown)} shown</span>
        <strong>{progress}%</strong>
        {settings.deckCountdownShowStopwatch || phase === "complete" || phase === "feedback" ? (
          <span>{formatMs(elapsedMs)}</span>
        ) : (
          <span>Stopwatch hidden</span>
        )}
      </div>
      <div className="deck-status" role="status">
        {status}
      </div>

      <nav className="controls deck-countdown-controls" aria-label="Deck countdown controls">
        {settings.deckCountdownFlipMode === "manual" ? (
          <button
            type="button"
            className="primary-button"
            onClick={flipManual}
            disabled={phase === "countdown" || phase === "complete"}
          >
            Flip card
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={startAuto}
            disabled={phase === "countdown" || phase === "running" || phase === "complete"}
          >
            Start auto
          </button>
        )}
        <button type="button" className="ghost-button" onClick={resetRun}>
          Stop / restart
        </button>
      </nav>

      <TrackingControls className="tracking-bar" />

      <p className="shortcut-help">
        Manual shortcut: Enter flips one group. A stopped run is discarded until you finish and
        submit.
      </p>

      <DeckCountdownAnalytics open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
    </div>
  );
}
