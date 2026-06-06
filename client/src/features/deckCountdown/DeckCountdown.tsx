import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { AppSettings, DeckCountdownSummary } from "@blackjack/shared";
import { CountDialog } from "../../components/CountDialog";
import { PlayingCard } from "../../components/PlayingCard";
import { TopBar } from "../../components/TopBar";
import { api } from "../../lib/api";
import { formatCards, formatMs, formatPercent } from "../../lib/format";
import {
  clampDeckCountdownCardsPerFlip,
  clampDeckCountdownDecks,
  clampDeckCountdownFlipDuration,
  clampDeckCountdownInterval,
  clampDeckCountdownOmittedCards
} from "../../lib/settings";
import { cardLabel, getHiLoValue, makeShoe, signed, type GameCard } from "../../lib/cards";
import { useSettings } from "../../lib/useSettings";
import { TrackingControls } from "../analytics/AnalyticsShared";
import { configureTracking, trackDeckCountdownRound } from "../analytics/tracker";
import { DeckCountdownAnalytics } from "./DeckCountdownAnalytics";

type Phase = "idle" | "countdown" | "running" | "finishing" | "complete" | "feedback";

const DECK_CHOICES = [1, 2, 4, 6, 8];
const DEFAULT_FLIP_DURATION_MS = 180;
const MIN_FINAL_REVEAL_MS = 700;
const FINAL_PROMPT_BUFFER_MS = 300;

function flipStaggerMs(durationMs: number): number {
  return Math.max(18, Math.round(durationMs * 0.12));
}

function finalPromptDelayMs(
  animationsEnabled: boolean,
  deckCountdownAnimationsEnabled: boolean,
  flipDurationMs: number,
  cardCount: number
): number {
  if (!animationsEnabled || !deckCountdownAnimationsEnabled) return MIN_FINAL_REVEAL_MS;
  const animatedMs =
    flipDurationMs +
    Math.max(0, cardCount - 1) * flipStaggerMs(flipDurationMs) +
    FINAL_PROMPT_BUFFER_MS;
  return Math.max(MIN_FINAL_REVEAL_MS, animatedMs);
}

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
  const [previousCards, setPreviousCards] = useState<GameCard[]>([]);
  const [omittedCards, setOmittedCards] = useState<GameCard[]>([]);
  const [expectedCount, setExpectedCount] = useState(0);
  const [cardsShown, setCardsShown] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState("Press Enter or Start to begin.");
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    value: number;
    expectedCount: number;
    elapsedMs: number;
    omittedCards: GameCard[];
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
  const previousCardsTimerRef = useRef<number | null>(null);
  const finalPromptTimerRef = useRef<number | null>(null);
  const currentCardsRef = useRef<GameCard[]>([]);

  useEffect(() => {
    configureTracking(settings);
  }, [settings]);

  useEffect(() => {
    currentCardsRef.current = currentCards;
  }, [currentCards]);

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
    if (previousCardsTimerRef.current) window.clearTimeout(previousCardsTimerRef.current);
    if (finalPromptTimerRef.current) window.clearTimeout(finalPromptTimerRef.current);
    autoTimerRef.current = null;
    countdownTimerRef.current = null;
    elapsedTimerRef.current = null;
    previousCardsTimerRef.current = null;
    finalPromptTimerRef.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const startElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = window.setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);
  }, []);

  const finishRun = useCallback(
    (finalGroupSize: number, flipDurationMs: number) => {
      if (autoTimerRef.current) window.clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
      if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
      if (finalPromptTimerRef.current) window.clearTimeout(finalPromptTimerRef.current);
      const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
      finishedElapsedRef.current = elapsed;
      setElapsedMs(elapsed);
      setPhase("finishing");
      setStatus("Deck complete. Count the final cards.");
      finalPromptTimerRef.current = window.setTimeout(
        () => {
          finalPromptTimerRef.current = null;
          setPhase("complete");
          setStatus("Deck complete. Enter your ending count.");
        },
        finalPromptDelayMs(
          settings.animationsEnabled,
          settings.deckCountdownAnimationsEnabled,
          flipDurationMs,
          finalGroupSize
        )
      );
    },
    [settings.animationsEnabled, settings.deckCountdownAnimationsEnabled]
  );

  const flipNextGroup = useCallback(() => {
    if (!deckRef.current.length) return true;
    if (!startedAtRef.current) {
      startedAtRef.current = Date.now();
      startElapsedTimer();
    }
    const cardsPerFlip = clampDeckCountdownCardsPerFlip(settings.deckCountdownCardsPerFlip);
    const flipDurationMs = clampDeckCountdownFlipDuration(settings.deckCountdownFlipDurationMs);
    const start = nextIndexRef.current;
    const end = Math.min(deckRef.current.length, start + cardsPerFlip);
    const nextCards = deckRef.current.slice(start, end);
    if (previousCardsTimerRef.current) window.clearTimeout(previousCardsTimerRef.current);
    if (settings.animationsEnabled && settings.deckCountdownAnimationsEnabled) {
      setPreviousCards(currentCardsRef.current);
      previousCardsTimerRef.current = window.setTimeout(
        () => setPreviousCards([]),
        flipDurationMs + Math.max(0, nextCards.length - 1) * flipStaggerMs(flipDurationMs)
      );
    } else {
      setPreviousCards([]);
    }
    setCurrentCards(nextCards);
    nextIndexRef.current = end;
    setCardsShown(end);
    setPhase("running");
    setStatus("Keep counting.");
    if (end >= deckRef.current.length) {
      finishRun(nextCards.length, flipDurationMs);
      return true;
    }
    return false;
  }, [
    finishRun,
    settings.animationsEnabled,
    settings.deckCountdownAnimationsEnabled,
    settings.deckCountdownCardsPerFlip,
    settings.deckCountdownFlipDurationMs,
    startElapsedTimer
  ]);

  const prepareRun = useCallback(() => {
    clearTimers();
    const deckCount = clampDeckCountdownDecks(settings.deckCountdownDecks);
    const omittedCardCount = clampDeckCountdownOmittedCards(settings.deckCountdownOmittedCards);
    const fullDeck = makeCountdownDeck(deckCount);
    const runOmittedCards = fullDeck.slice(0, omittedCardCount);
    const countdownDeck = fullDeck.slice(omittedCardCount);
    deckRef.current = countdownDeck;
    setOmittedCards(runOmittedCards);
    setExpectedCount(countdownDeck.reduce((sum, card) => sum + getHiLoValue(card), 0));
    nextIndexRef.current = 0;
    startedAtRef.current = null;
    finishedElapsedRef.current = 0;
    setCurrentCards([]);
    setPreviousCards([]);
    setCardsShown(0);
    setElapsedMs(0);
    setFeedback(null);
  }, [clearTimers, settings.deckCountdownDecks, settings.deckCountdownOmittedCards]);

  const resetRun = useCallback(() => {
    clearTimers();
    deckRef.current = [];
    nextIndexRef.current = 0;
    startedAtRef.current = null;
    finishedElapsedRef.current = 0;
    setPhase("idle");
    setCurrentCards([]);
    setPreviousCards([]);
    setOmittedCards([]);
    setExpectedCount(0);
    setCardsShown(0);
    setElapsedMs(0);
    setFeedback(null);
    setStatus("Press Enter or Start to begin.");
  }, [clearTimers]);

  const startCountdownRun = useCallback(
    (auto: boolean) => {
      if (
        phase === "countdown" ||
        phase === "running" ||
        phase === "finishing" ||
        phase === "complete"
      )
        return;
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
        if (auto && !done) {
          autoTimerRef.current = window.setInterval(() => {
            flipNextGroup();
          }, clampDeckCountdownInterval(settings.deckCountdownAutoIntervalMs));
        }
      }, 1000);
    },
    [flipNextGroup, phase, prepareRun, settings.deckCountdownAutoIntervalMs]
  );

  const flipManual = useCallback(() => {
    if (settings.deckCountdownFlipMode !== "manual") return;
    if (phase === "idle" || phase === "feedback") {
      startCountdownRun(false);
      return;
    }
    if (phase === "running") flipNextGroup();
  }, [flipNextGroup, phase, settings.deckCountdownFlipMode, startCountdownRun]);

  const startAuto = useCallback(() => {
    if (settings.deckCountdownFlipMode !== "auto") return;
    startCountdownRun(true);
  }, [settings.deckCountdownFlipMode, startCountdownRun]);

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
        return;
      }
      if (settings.deckCountdownFlipMode === "auto" && phase === "idle") {
        event.preventDefault();
        startAuto();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [analyticsOpen, flipManual, phase, settings.deckCountdownFlipMode, startAuto]);

  const updateSettings = (patch: Partial<AppSettings>) => setSettings({ ...settings, ...patch });

  const submitFinalCount = (answer: number) => {
    if (phase !== "complete") return;
    const value = Math.trunc(answer);
    if (!Number.isFinite(value)) return;
    const signedError = value - expectedCount;
    const correct = signedError === 0;
    const elapsed = finishedElapsedRef.current || elapsedMs;
    const runOmittedCards = omittedCards;
    setFeedback({
      correct,
      value,
      expectedCount,
      elapsedMs: elapsed,
      omittedCards: runOmittedCards
    });
    setPhase("feedback");
    setStatus(
      correct
        ? "Correct. The final count is " + signed(expectedCount) + "."
        : "Incorrect. The final count is " + signed(expectedCount) + "."
    );
    trackDeckCountdownRound(
      {
        deckCount: clampDeckCountdownDecks(settings.deckCountdownDecks),
        totalCards: deckRef.current.length,
        omittedCardCount: runOmittedCards.length,
        cardsPerFlip: clampDeckCountdownCardsPerFlip(settings.deckCountdownCardsPerFlip),
        flipMode: settings.deckCountdownFlipMode,
        autoIntervalMs:
          settings.deckCountdownFlipMode === "auto"
            ? clampDeckCountdownInterval(settings.deckCountdownAutoIntervalMs)
            : undefined,
        stopwatchShown: settings.deckCountdownShowStopwatch,
        correctCount: expectedCount,
        userAnswer: value,
        signedError,
        absoluteError: Math.abs(signedError),
        correct,
        responseTimeMs: elapsed
      },
      refreshStats
    );
  };

  const continueFinalCount = () => {
    setFeedback(null);
    setPhase("idle");
    setStatus("Press Enter or Start to begin.");
  };

  const finalCountFeedback = feedback ? (
    <div className="count-feedback deck-countdown-feedback">
      <div className="feedback-result">
        <strong>{feedback.correct ? "Correct" : "Incorrect"}</strong>
        <span>Expected {signed(feedback.expectedCount)}</span>
      </div>
      <div className="feedback-equation">
        <span>Submitted</span>
        <strong>{signed(feedback.value)}</strong>
        <span>Expected</span>
        <strong>{signed(feedback.expectedCount)}</strong>
        <span>Elapsed</span>
        <strong>{formatMs(feedback.elapsedMs)}</strong>
      </div>
      <h3>Omitted cards</h3>
      <div className="count-card-grid">
        {feedback.omittedCards.length ? (
          feedback.omittedCards.map(card => (
            <span className="count-card" key={card.id}>
              <span>{cardLabel(card)}</span>
              <strong>{signed(getHiLoValue(card))}</strong>
            </span>
          ))
        ) : (
          <span className="count-card empty">
            No cards omitted <strong>0</strong>
          </span>
        )}
      </div>
    </div>
  ) : null;

  const active =
    phase === "countdown" || phase === "running" || phase === "finishing" || phase === "complete";
  const totalCards = Math.max(
    0,
    clampDeckCountdownDecks(settings.deckCountdownDecks) * 52 -
      clampDeckCountdownOmittedCards(settings.deckCountdownOmittedCards)
  );
  const progress = totalCards ? Math.round((cardsShown / totalCards) * 100) : 0;
  const deckCountdownAnimationsEnabled =
    settings.animationsEnabled && settings.deckCountdownAnimationsEnabled;
  const deckCountdownFlipDurationMs = clampDeckCountdownFlipDuration(
    settings.deckCountdownFlipDurationMs ?? DEFAULT_FLIP_DURATION_MS
  );
  const deckCountdownFlipStaggerMs = flipStaggerMs(deckCountdownFlipDurationMs);

  return (
    <div
      className={`drill deck-countdown-shell${deckCountdownAnimationsEnabled ? "" : " no-animation"}`}
      data-mode="deck-countdown"
    >
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
          Omitted cards
          <input
            type="number"
            min={0}
            max={5}
            disabled={active}
            value={settings.deckCountdownOmittedCards}
            onChange={e => updateSettings({ deckCountdownOmittedCards: Number(e.target.value) })}
            onBlur={e =>
              updateSettings({
                deckCountdownOmittedCards: clampDeckCountdownOmittedCards(e.target.value)
              })
            }
          />
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
        <label className="deck-range-control">
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
        <label className="deck-range-control">
          Flip speed
          <input
            type="range"
            min={100}
            max={300}
            step={10}
            disabled={active || !deckCountdownAnimationsEnabled}
            value={deckCountdownFlipDurationMs}
            onChange={e =>
              updateSettings({
                deckCountdownFlipDurationMs: clampDeckCountdownFlipDuration(e.target.value)
              })
            }
          />
          <span>{deckCountdownFlipDurationMs} ms</span>
        </label>
        <div className="deck-toggle-group">
          <label className="deck-checkbox">
            <input
              type="checkbox"
              checked={settings.deckCountdownAnimationsEnabled}
              disabled={active || !settings.animationsEnabled}
              onChange={e => updateSettings({ deckCountdownAnimationsEnabled: e.target.checked })}
            />
            <span>Animate flips</span>
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
        </div>
      </section>

      <section className="flash-stage deck-countdown-stage">
        {phase === "countdown" ? <div className="countdown-number">{countdown}</div> : null}

        <div className="flash-cards deck-countdown-cards" aria-live="polite">
          {previousCards.length ? (
            <div className="deck-previous-cards" aria-hidden="true">
              {previousCards.map(card => (
                <span className="deck-previous-card" key={card.id}>
                  <PlayingCard card={card} faceUp />
                </span>
              ))}
            </div>
          ) : null}
          <div className="deck-current-cards">
            {currentCards.map((card, index) => (
              <span
                className="deck-flip-card"
                key={card.id}
                style={
                  {
                    "--flip-index": index,
                    "--flip-duration-ms": `${deckCountdownFlipDurationMs}ms`,
                    "--flip-stagger-ms": `${deckCountdownFlipStaggerMs}ms`
                  } as CSSProperties
                }
              >
                <span className="deck-flip-inner">
                  <span className="deck-flip-face deck-flip-back" aria-hidden="true">
                    <PlayingCard card={card} faceUp={false} />
                  </span>
                  <span className="deck-flip-face deck-flip-front">
                    <PlayingCard card={card} faceUp />
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
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
      {phase !== "running" ? (
        <div className="deck-status" role="status">
          {status}
        </div>
      ) : null}

      <nav className="controls deck-countdown-controls" aria-label="Deck countdown controls">
        {settings.deckCountdownFlipMode === "manual" ? (
          <button
            type="button"
            className="primary-button"
            onClick={flipManual}
            disabled={phase === "countdown" || phase === "finishing" || phase === "complete"}
          >
            {phase === "running" ? "Flip card" : "Start countdown"}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={startAuto}
            disabled={
              phase === "countdown" ||
              phase === "running" ||
              phase === "finishing" ||
              phase === "complete"
            }
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
        Enter starts the countdown. In manual mode, Enter flips one group after the first reveal. In
        the final-count prompt, D toggles sign and Enter submits.
      </p>

      {phase === "complete" || phase === "feedback" ? (
        <CountDialog
          open
          eyebrow="Deck countdown"
          title="What is the final count?"
          betweenRounds
          feedback={feedback ? { correct: feedback.correct, content: finalCountFeedback } : null}
          onSubmit={submitFinalCount}
          onContinue={continueFinalCount}
        />
      ) : null}

      <DeckCountdownAnalytics open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
    </div>
  );
}
