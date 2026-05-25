import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, FlashSummary } from "@blackjack/shared";
import { CountDialog } from "../../components/CountDialog";
import { PlayingCard } from "../../components/PlayingCard";
import { SettingsDrawer } from "../../components/SettingsDrawer";
import { TopBar } from "../../components/TopBar";
import { api } from "../../lib/api";
import {
  cardLabel,
  getHiLoValue,
  makeCard,
  randomRank,
  randomSuit,
  signed,
  type GameCard
} from "../../lib/cards";
import { formatMs, formatPercent } from "../../lib/format";
import { clampFlashCount } from "../../lib/settings";
import { useSettings } from "../../lib/useSettings";
import { configureTracking, trackFlashRound } from "../analytics/tracker";
import { FlashAnalytics } from "../analytics/FlashAnalytics";

type Phase = "idle" | "memorize" | "prompt" | "feedback";

interface Round {
  cards: GameCard[];
  correctCount: number;
  numCards: number;
  minCards: number;
  maxCards: number;
  promptOpenedAt: number;
}

function makeFlashCards(count: number): GameCard[] {
  const cards: GameCard[] = [];
  for (let i = 0; i < count; i += 1)
    cards.push(makeCard(randomRank(), randomSuit(), "flash", true));
  return cards;
}

function FlashStatsBar({ stats }: { stats: FlashSummary | null }) {
  const rounds = stats?.totals?.rounds || 0;
  return (
    <div className="flash-stats" aria-label="Flash count stats">
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
        <strong>{stats?.bestStreak || 0}</strong>
        <small>Best</small>
      </span>
      <span className="flash-stat">
        <strong>{rounds ? formatMs(stats!.medianResponse) : "—"}</strong>
        <small>Median time</small>
      </span>
    </div>
  );
}

export function FlashCount() {
  const [settings, setSettings] = useSettings();
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState<Round | null>(null);
  const [correct, setCorrect] = useState(false);
  const [status, setStatus] = useState("Press Deal to start a round.");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [stats, setStats] = useState<FlashSummary | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    configureTracking(settings);
  }, [settings]);

  const refreshStats = useCallback(() => {
    api
      .flashSummary()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  const deal = useCallback(() => {
    if (phase === "memorize" || phase === "prompt") return;
    const lo = clampFlashCount(settings.flashMinCards);
    const hi = clampFlashCount(settings.flashMaxCards);
    const min = Math.min(lo, hi);
    const max = Math.max(lo, hi);
    const count = min + Math.floor(Math.random() * (max - min + 1));
    const cards = makeFlashCards(count);
    setRound({
      cards,
      correctCount: cards.reduce((sum, card) => sum + getHiLoValue(card), 0),
      numCards: count,
      minCards: min,
      maxCards: max,
      promptOpenedAt: 0
    });
    setPhase("memorize");
    setStatus("Memorize the cards…");
    const duration = Math.max(300, Number(settings.flashDurationMs) || 1500);
    timerRef.current = window.setTimeout(() => {
      setRound(prev => (prev ? { ...prev, promptOpenedAt: Date.now() } : prev));
      setPhase("prompt");
      setStatus("What is the count?");
    }, duration);
  }, [phase, settings.flashMinCards, settings.flashMaxCards, settings.flashDurationMs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (settingsOpen || analyticsOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      // Only auto-deal from the idle view. While the count dialog is open
      // (prompt/feedback) the dialog owns Enter (submit / continue), so a single
      // keypress can't both continue and immediately re-deal a new round.
      if ((key === "n" || key === "enter") && phase === "idle") {
        event.preventDefault();
        deal();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deal, phase, settingsOpen, analyticsOpen]);

  const submit = (answer: number) => {
    if (!round) return;
    const isCorrect = answer === round.correctCount;
    const signedError = answer - round.correctCount;
    setCorrect(isCorrect);
    setPhase("feedback");
    setStatus(isCorrect ? "Correct! Deal again." : `Count was ${signed(round.correctCount)}.`);
    trackFlashRound({
      numCards: round.numCards,
      correctCount: round.correctCount,
      userAnswer: answer,
      signedError,
      absoluteError: Math.abs(signedError),
      correct: isCorrect,
      responseTimeMs: Date.now() - (round.promptOpenedAt || Date.now()),
      flashDurationMs: Number(settings.flashDurationMs),
      minCards: round.minCards,
      maxCards: round.maxCards,
      cards: round.cards.map((card, index) => ({
        visibleOrder: index + 1,
        rank: card.rank,
        suit: card.suit,
        hiLoValue: getHiLoValue(card)
      }))
    });
    // Refresh the live stats bar shortly after the round is recorded.
    window.setTimeout(refreshStats, 150);
  };

  const continueRound = () => {
    setPhase("idle");
    setStatus("Press Deal for the next round.");
  };

  const showFaceUp = phase === "memorize" || phase === "feedback";
  const dialogOpen = phase === "prompt" || phase === "feedback";

  const feedbackContent =
    round && phase === "feedback" ? (
      <div className="count-feedback">
        <div className="feedback-result">
          <strong>{correct ? "Correct" : "Incorrect"}</strong>
          <span>Count {signed(round.correctCount)}</span>
        </div>
        <h3>Cards this round</h3>
        <div className="count-card-grid">
          {round.cards.map(card => (
            <span className="count-card" key={card.id}>
              <span>{cardLabel(card)}</span>
              <strong>{signed(getHiLoValue(card))}</strong>
            </span>
          ))}
        </div>
      </div>
    ) : null;

  const onSettingsChange = (next: AppSettings) => setSettings(next);

  return (
    <div className="drill flash-shell" data-mode="flash">
      <TopBar eyebrow="Flash Count" title="Flash Count">
        <button type="button" className="ghost-button" onClick={() => setAnalyticsOpen(true)}>
          <span>Analytics</span>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Open settings"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
      </TopBar>

      <FlashStatsBar stats={stats} />

      <section className="flash-stage">
        <div className="flash-cards" aria-live="polite">
          {round
            ? round.cards.map(card => <PlayingCard key={card.id} card={card} faceUp={showFaceUp} />)
            : null}
        </div>
        <div className="status-pill" role="status">
          {status}
        </div>
      </section>

      <nav className="controls flash-controls" aria-label="Flash controls">
        <button
          type="button"
          className="primary-button flash-deal"
          onClick={deal}
          disabled={phase === "memorize" || phase === "prompt"}
        >
          Deal
        </button>
      </nav>
      <p className="shortcut-help">
        Shortcuts: N/Enter deal · in the count prompt: D toggles sign, Enter submits.
      </p>

      {dialogOpen && round ? (
        <CountDialog
          open
          eyebrow="Flash count"
          title="What is the count for this hand?"
          feedback={phase === "feedback" ? { correct, content: feedbackContent } : null}
          onSubmit={submit}
          onContinue={continueRound}
        />
      ) : null}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        variant="flash"
        onChange={onSettingsChange}
        onApply={() => {}}
      />
      <FlashAnalytics open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
    </div>
  );
}
