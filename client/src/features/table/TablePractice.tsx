import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings } from "@blackjack/shared";
import { CountDialog } from "../../components/CountDialog";
import { Hand } from "../../components/PlayingCard";
import { TopBar } from "../../components/TopBar";
import { SettingsDrawer } from "../../components/SettingsDrawer";
import { cardLabel, getHiLoValue, signed } from "../../lib/cards";
import { useSettings } from "../../lib/useSettings";
import { TableAnalytics } from "../analytics/TableAnalytics";
import { TrackingControls } from "../analytics/AnalyticsShared";
import type { CountCheckResult, Seat } from "./engine";
import { DealerHand } from "./DealerHand";
import { ShoeBoxes } from "./ShoeBoxes";
import { useTableGame } from "./useTableGame";

function seatPosition(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 50, y: 82 };
  const positions: Record<number, Array<{ x: number; y: number }>> = {
    2: [
      { x: 32, y: 84 },
      { x: 68, y: 84 }
    ],
    3: [
      { x: 18, y: 64 },
      { x: 50, y: 90 },
      { x: 82, y: 64 }
    ],
    4: [
      { x: 9, y: 48 },
      { x: 34, y: 84 },
      { x: 66, y: 84 },
      { x: 91, y: 48 }
    ],
    5: [
      { x: 7, y: 38 },
      { x: 25, y: 72 },
      { x: 50, y: 92 },
      { x: 75, y: 72 },
      { x: 93, y: 38 }
    ],
    6: [
      { x: 6, y: 32 },
      { x: 20, y: 58 },
      { x: 39, y: 88 },
      { x: 61, y: 88 },
      { x: 80, y: 58 },
      { x: 94, y: 32 }
    ],
    7: [
      { x: 5, y: 28 },
      { x: 16, y: 51 },
      { x: 31, y: 78 },
      { x: 50, y: 94 },
      { x: 69, y: 78 },
      { x: 84, y: 51 },
      { x: 95, y: 28 }
    ]
  };
  return positions[count]?.[index] ?? { x: 50, y: 70 };
}

function SeatView({ seat }: { seat: Seat }) {
  return (
    <>
      <div className="seat-label">
        <span>{seat.name}</span>
      </div>
      {seat.role === "dealer" ? <DealerHand cards={seat.hand} /> : <Hand cards={seat.hand} />}
    </>
  );
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function dialogFraming(source: string): { eyebrow: string; title: string; betweenRounds: boolean } {
  if (source === "everyRound")
    return { eyebrow: "Place your bet", title: "What is the running count?", betweenRounds: true };
  if (source === "cutCard")
    return { eyebrow: "Cut card reached", title: "Final running count?", betweenRounds: true };
  return { eyebrow: "Count check", title: "What is the running count?", betweenRounds: false };
}

export function TablePractice() {
  const [settings, setSettings] = useSettings();
  const { engine, snapshot } = useTableGame(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [feedback, setFeedback] = useState<CountCheckResult | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current && !snapshot.hasShoe) {
      startedRef.current = true;
      engine.startNewShoe();
    }
  }, [engine, snapshot.hasShoe]);

  const startNewShoe = useCallback(() => {
    setFeedback(null);
    engine.startNewShoe();
  }, [engine]);

  const next = useCallback(() => {
    if (snapshot.acting) engine.manualStep();
    else void engine.runRound();
  }, [engine, snapshot.acting]);

  const pending = snapshot.pendingCountCheck;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (pending || settingsOpen || analyticsOpen || isTextEntry(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "n" || key === "enter") {
        event.preventDefault();
        next();
      } else if (key === "w") {
        event.preventDefault();
        startNewShoe();
      } else if (key === "p" || key === " ") {
        event.preventDefault();
        engine.togglePause();
      } else if (key === "c") {
        event.preventDefault();
        void engine.openCountCheck("manual");
      } else if (key === "s") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [engine, next, startNewShoe, pending, settingsOpen, analyticsOpen]);

  const submitCount = (answer: number) => setFeedback(engine.submitCountCheck(answer));
  const continueCount = () => {
    setFeedback(null);
    engine.closeCountCheck();
  };

  const framing = pending ? dialogFraming(pending.source) : null;
  const feedbackContent =
    pending && feedback ? (
      <div className="count-feedback">
        <div className="feedback-result">
          <strong>{feedback.correct ? "Correct" : "Incorrect"}</strong>
          <span>Correct {signed(feedback.correctCount)}</span>
        </div>
        <div className="feedback-equation">
          <span>Previous</span>
          <strong>{signed(feedback.previousCount)}</strong>
          <span>Net change</span>
          <strong>{signed(feedback.delta)}</strong>
          <span>Running count</span>
          <strong>{signed(feedback.correctCount)}</strong>
        </div>
        <h3>Cards since last check</h3>
        <div className="count-card-grid">
          {feedback.cards.length ? (
            feedback.cards.map(card => (
              <span className="count-card" key={card.id}>
                <span>{cardLabel(card)}</span>
                <strong>{signed(getHiLoValue(card))}</strong>
              </span>
            ))
          ) : (
            <span className="count-card empty">
              No newly visible cards <strong>0</strong>
            </span>
          )}
        </div>
      </div>
    ) : null;

  // Settings persist live (the engine picks them up via useTableGame's effect);
  // Apply reshuffles the shoe, matching the original "Apply and shuffle" button.
  const onSettingsChange = (next: AppSettings) => setSettings(next);

  return (
    <div className="drill table-shell" data-mode="table">
      <TopBar eyebrow="Hi-Lo Practice" title="Blackjack Table">
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

      <section className="felt">
        <ShoeBoxes
          snapshot={snapshot}
          settings={settings}
          dealer={<SeatView seat={snapshot.dealer} />}
        />
        <div className="other-players">
          {snapshot.seats.map((seat, index) => {
            const pos = seatPosition(index, snapshot.seats.length);
            return (
              <div
                key={`${seat.name}-${index}`}
                className={`seat table-seat${seat.role === "player" ? " is-you" : ""}`}
                style={{ ["--seat-x" as string]: `${pos.x}%`, ["--seat-y" as string]: `${pos.y}%` }}
              >
                <SeatView seat={seat} />
              </div>
            );
          })}
        </div>
        <div className="table-center">
          <div className="felt-mark">
            <span>
              Blackjack pays <strong>{settings.blackjackPayout}</strong>
            </span>
            <span>
              {settings.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands soft 17"}
            </span>
          </div>
          <div className="status-pill" role="status">
            {snapshot.status}
          </div>
        </div>
      </section>

      <nav className="controls" aria-label="Game controls">
        <button type="button" className="primary-button" onClick={startNewShoe}>
          New shoe
        </button>
        <button type="button" className="ghost-button" onClick={next}>
          Next hand
        </button>
        <button type="button" className="ghost-button" onClick={() => engine.togglePause()}>
          Pause
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void engine.openCountCheck("manual")}
        >
          Count check
        </button>
      </nav>

      <TrackingControls className="tracking-bar" />

      <p className="shortcut-help">
        Shortcuts: N/Enter next hand · W new shoe · P/Space pause · C count check · S settings
      </p>

      {pending && framing ? (
        <CountDialog
          open
          eyebrow={framing.eyebrow}
          title={framing.title}
          betweenRounds={framing.betweenRounds}
          feedback={feedback ? { correct: feedback.correct, content: feedbackContent } : null}
          onSubmit={submitCount}
          onContinue={continueCount}
        />
      ) : null}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        variant="table"
        onChange={onSettingsChange}
        onApply={startNewShoe}
      />
      <TableAnalytics open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
    </div>
  );
}
