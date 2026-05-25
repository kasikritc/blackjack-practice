import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StrategyData } from "@blackjack/shared";
import { Hand } from "../../components/PlayingCard";
import { TopBar } from "../../components/TopBar";
import { api } from "../../lib/api";
import { randomRank, type GameCard } from "../../lib/cards";
import { StrategyChartPanel } from "./StrategyChartPanel";
import { StrategyRulesPanel } from "./StrategyRulesPanel";
import {
  STRATEGY_ACTION_KEYS,
  STRATEGY_ACTION_LABELS,
  cardsForStrategyRow,
  cloneCriteria,
  currentStrategyDecision,
  defaultStrategyCriteria,
  doubleRuleLabel,
  isStrategyActionLegal,
  makeStrategyCard,
  normalizedStrategyRules,
  randomStrategyPracticeCell,
  surrenderLabel,
  type StrategyCriteria
} from "./strategyLogic";

const ACTIONS: Array<{ action: string; key: string }> = [
  { action: "hit", key: "A" },
  { action: "stand", key: "S" },
  { action: "double", key: "D" },
  { action: "split", key: "F" },
  { action: "surrender", key: "R" },
  { action: "insurance", key: "E" }
];

interface Session {
  playerHand: GameCard[];
  dealerHand: GameCard[];
  handNumber: number;
  feedback: string;
  feedbackType: "neutral" | "correct" | "incorrect";
  insuranceResolved: boolean;
  promptOpenedAt: number;
}

const EMPTY_SESSION: Session = {
  playerHand: [],
  dealerHand: [],
  handNumber: 0,
  feedback: "Loading strategy charts…",
  feedbackType: "neutral",
  insuranceResolved: false,
  promptOpenedAt: 0
};

// Persist the selected profile/chart/subset at module scope so returning to the
// drill keeps your selection, matching the original single-global-state app.
const saved: { profileId: number | null; chartId: number | null; subsetId: number | null } = {
  profileId: null,
  chartId: null,
  subsetId: null
};

export function BasicStrategy() {
  const [data, setData] = useState<StrategyData | null>(null);
  const [serverAvailable, setServerAvailable] = useState(true);
  const [profileId, setProfileId] = useState<number | null>(saved.profileId);
  const [chartId, setChartId] = useState<number | null>(saved.chartId);
  const [subsetId, setSubsetId] = useState<number | null>(saved.subsetId);

  useEffect(() => {
    saved.profileId = profileId;
    saved.chartId = chartId;
    saved.subsetId = subsetId;
  }, [profileId, chartId, subsetId]);
  const [session, setSession] = useState<Session>(EMPTY_SESSION);
  const [criteria, setCriteria] = useState<StrategyCriteria>(defaultStrategyCriteria);
  const [panelMode, setPanelMode] = useState<"review" | "edit" | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const dealTimer = useRef<number | null>(null);

  const profiles = data?.profiles ?? [];
  const currentProfile = profiles.find(p => p.id === profileId) || null;
  const currentChart = (data?.charts ?? []).find(c => c.id === chartId) || null;
  const rules = useMemo(() => normalizedStrategyRules(currentProfile?.rules), [currentProfile]);

  const decision = useMemo(
    () =>
      currentStrategyDecision(currentChart?.chart, session.playerHand, session.dealerHand, rules),
    [currentChart, session.playerHand, session.dealerHand, rules]
  );

  // Load strategy data once.
  useEffect(() => {
    api
      .getStrategy()
      .then(d => {
        setServerAvailable(true);
        setData(d);
        // Prefer a previously chosen selection if it still exists; else default to first.
        const profile =
          (saved.profileId != null && d.profiles.find(p => p.id === saved.profileId)?.id) ||
          d.profiles[0]?.id ||
          null;
        const chart =
          (saved.chartId != null &&
            d.charts.find(c => c.id === saved.chartId && c.ruleProfileId === profile)?.id) ||
          d.charts.find(c => c.ruleProfileId === profile)?.id ||
          d.charts[0]?.id ||
          null;
        const subset =
          (saved.subsetId != null &&
            d.subsets.find(s => s.id === saved.subsetId && (s.chartId === chart || s.isDefault))
              ?.id) ||
          d.subsets.find(s => s.chartId === chart || s.isDefault)?.id ||
          null;
        setProfileId(profile);
        setChartId(chart);
        setSubsetId(subset);
        const subsetRecord = d.subsets.find(s => s.id === subset);
        setCriteria(cloneCriteria(subsetRecord?.criteria ?? defaultStrategyCriteria()));
      })
      .catch(() => {
        setServerAvailable(false);
        setSession(s => ({ ...s, feedback: "Start the local server to load strategy profiles." }));
      });
  }, []);

  useEffect(
    () => () => {
      if (dealTimer.current) window.clearTimeout(dealTimer.current);
    },
    []
  );

  const deal = useCallback(() => {
    const chart = currentChart;
    if (!chart) {
      setSession(s => ({
        ...s,
        feedback: serverAvailable
          ? "Load a strategy chart to start."
          : "Strategy database unavailable."
      }));
      return;
    }
    const cell = randomStrategyPracticeCell(chart.chart, rules, criteria);
    if (!cell) {
      setSession(s => ({ ...s, feedback: "No legal starting hands match this subset and chart." }));
      return;
    }
    const playerHand = cardsForStrategyRow(cell.category, cell.rowKey);
    const dealerHand = [makeStrategyCard(cell.dealer, true), makeStrategyCard(randomRank(), false)];
    setSession(s => ({
      ...s,
      playerHand,
      dealerHand,
      handNumber: s.handNumber + 1,
      feedback: "",
      feedbackType: "neutral",
      insuranceResolved: false,
      promptOpenedAt: Date.now()
    }));
  }, [currentChart, criteria, rules, serverAvailable]);

  const dealRef = useRef(deal);
  useEffect(() => {
    dealRef.current = deal;
  }, [deal]);

  const scheduleDeal = () => {
    if (dealTimer.current) window.clearTimeout(dealTimer.current);
    dealTimer.current = window.setTimeout(() => dealRef.current(), 650);
  };

  // Deal an initial prompt once a chart is selected.
  useEffect(() => {
    if (currentChart && !session.playerHand.length) deal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChart]);

  const recordAttempt = (action: string, dec: NonNullable<typeof decision>, correct: boolean) => {
    if (!serverAvailable) return;
    api
      .strategyAttempt({
        ruleProfileId: profileId ?? undefined,
        chartId: chartId ?? undefined,
        subsetId: subsetId ?? undefined,
        handNumber: session.handNumber,
        category: dec.category,
        rowKey: dec.rowKey,
        dealerUpcard: dec.dealer,
        playerCards: session.playerHand.map(card => ({ rank: card.rank, suit: card.suit })),
        action,
        expectedAction: dec.expectedAction,
        correct,
        responseTimeMs: Date.now() - (session.promptOpenedAt || Date.now())
      })
      .catch(() => {});
  };

  const submitAction = useCallback(
    (action: string) => {
      const dec = currentStrategyDecision(
        currentChart?.chart,
        session.playerHand,
        session.dealerHand,
        rules
      );
      if (!dec) return;
      const correct = action === dec.expectedAction;
      recordAttempt(action, dec, correct);
      if (!correct) {
        setSession(s => ({ ...s, feedback: "Incorrect. Try again.", feedbackType: "incorrect" }));
        return;
      }
      if (action === "hit") {
        setSession(s => ({
          ...s,
          playerHand: [...s.playerHand, makeStrategyCard(randomRank(), true)],
          feedbackType: "correct",
          feedback: "",
          promptOpenedAt: Date.now()
        }));
        // Re-evaluate bust/21 after state commit.
        window.setTimeout(() => {
          setSession(s => {
            const total = handTotalQuick(s.playerHand);
            if (total > 21) {
              scheduleDeal();
              return { ...s, feedback: "Correct. Bust.", feedbackType: "correct" };
            }
            if (total === 21) {
              scheduleDeal();
              return { ...s, feedback: "Correct. 21.", feedbackType: "correct" };
            }
            return s;
          });
        }, 0);
        return;
      }
      if (action === "double") {
        setSession(s => ({
          ...s,
          playerHand: [...s.playerHand, makeStrategyCard(randomRank(), true)],
          feedback: "Correct: Double.",
          feedbackType: "correct"
        }));
        scheduleDeal();
        return;
      }
      setSession(s => ({
        ...s,
        feedback: `Correct: ${STRATEGY_ACTION_LABELS[action]}.`,
        feedbackType: "correct"
      }));
      scheduleDeal();
    },
    // recordAttempt closes over the same state already listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      currentChart,
      rules,
      session.playerHand,
      session.dealerHand,
      session.handNumber,
      profileId,
      chartId,
      subsetId,
      session.promptOpenedAt
    ]
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "n" || key === "enter") {
        event.preventDefault();
        deal();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        setPanelMode("review");
        return;
      }
      if (key === "v") {
        event.preventDefault();
        setPanelMode("edit");
        return;
      }
      const action = STRATEGY_ACTION_KEYS[key];
      if (
        action &&
        decision &&
        isStrategyActionLegal(
          action,
          rules,
          session.playerHand,
          decision.dealer,
          session.insuranceResolved
        )
      ) {
        event.preventDefault();
        submitAction(action);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deal, submitAction, decision, rules, session.playerHand, session.insuranceResolved]);

  const criteriaForSubset = (subsetRecord: { criteria?: StrategyCriteria } | undefined) =>
    cloneCriteria(subsetRecord?.criteria ?? defaultStrategyCriteria());

  const onProfileChange = (id: number) => {
    setProfileId(id);
    const firstChart = (data?.charts ?? []).find(c => c.ruleProfileId === id)?.id ?? null;
    const firstSubset =
      (data?.subsets ?? []).find(s => s.chartId === firstChart || s.isDefault) ?? undefined;
    setChartId(firstChart);
    setSubsetId(firstSubset?.id ?? null);
    setCriteria(criteriaForSubset(firstSubset as never));
    setSession(s => ({ ...s, playerHand: [], dealerHand: [] }));
  };

  const onChartChange = (id: number) => {
    setChartId(id);
    const firstSubset =
      (data?.subsets ?? []).find(s => s.chartId === id || s.isDefault) ?? undefined;
    setSubsetId(firstSubset?.id ?? null);
    setCriteria(criteriaForSubset(firstSubset as never));
    setSession(s => ({ ...s, playerHand: [], dealerHand: [] }));
  };

  const onSubsetChange = (id: number) => {
    setSubsetId(id || null);
    const subsetRecord = (data?.subsets ?? []).find(s => s.id === id) ?? undefined;
    setCriteria(criteriaForSubset(subsetRecord as never));
  };

  // Apply a server mutation result (clone/save chart, save subset, rules) and selection.
  const applyData = (
    next: StrategyData,
    sel?: { profileId?: number; chartId?: number; subsetId?: number }
  ) => {
    setData(next);
    if (sel?.profileId != null) setProfileId(sel.profileId);
    if (sel?.chartId != null) setChartId(sel.chartId);
    if (sel?.subsetId != null) {
      setSubsetId(sel.subsetId);
      setCriteria(criteriaForSubset(next.subsets.find(s => s.id === sel.subsetId) as never));
    }
  };

  // Live in-memory chart cell edit (drill uses it immediately; persisted on Save chart).
  const onChartCellChange = (category: string, rowKey: string, dealer: string, action: string) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        charts: prev.charts.map(c => {
          if (c.id !== chartId) return c;
          const chart = c.chart as unknown as Record<
            string,
            Record<string, Record<string, string>>
          >;
          const updatedCategory = { ...(chart[category] || {}) };
          updatedCategory[rowKey] = { ...(updatedCategory[rowKey] || {}), [dealer]: action };
          return {
            ...c,
            chart: { ...chart, [category]: updatedCategory } as unknown as typeof c.chart
          };
        })
      };
    });
  };

  const ruleChips = currentProfile
    ? [
        `${rules.decks} decks`,
        rules.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands soft 17",
        `Blackjack pays ${rules.blackjackPayout}`,
        doubleRuleLabel(rules.doubleRule),
        rules.doubleAfterSplit ? "Double after split" : "No double after split",
        surrenderLabel(rules.surrender),
        `Maximum split hands ${rules.maxSplitHands}`,
        rules.resplitAces ? "Resplit aces" : "No resplit aces",
        rules.hitSplitAces ? "Hit split aces" : "No hit split aces",
        rules.insurance ? "Insurance" : "No insurance"
      ]
    : [];

  const insuranceLabel = rules.insurance ? "Insurance pays 2:1" : "Insurance not offered";

  return (
    <div className="drill strategy-shell" data-mode="strategy">
      <TopBar eyebrow="Basic Strategy" title="Basic Strategy Drill">
        <button type="button" className="ghost-button" onClick={() => setPanelMode("review")}>
          <span>Review chart</span>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Open strategy settings"
          title="Settings"
          onClick={() => setRulesOpen(true)}
        >
          ⚙
        </button>
      </TopBar>

      <section
        className="strategy-toolbar strategy-prompt-toolbar"
        aria-label="Basic strategy prompt controls"
      >
        <button type="button" className="primary-button" onClick={deal} disabled={!currentChart}>
          Next prompt
        </button>
      </section>

      <section className="strategy-rules-strip" aria-label="Current house rules">
        <div className="strategy-rules-summary">
          {ruleChips.length
            ? ruleChips.map(chip => <span key={chip}>{chip}</span>)
            : "No rule profile loaded."}
        </div>
      </section>

      <div className="felt strategy-felt">
        <div className="seat dealer-seat">
          <div className="seat-label">
            <span>Dealer</span>
          </div>
          <Hand cards={session.dealerHand} />
        </div>
        <div className="strategy-center">
          <div className="felt-mark strategy-prompt-meta">
            <span>
              Blackjack pays <strong>{rules.blackjackPayout}</strong>
            </span>
            <span>{insuranceLabel}</span>
          </div>
        </div>
        <div className="seat strategy-player">
          <div className="seat-label">
            <span>You</span>
          </div>
          <Hand cards={session.playerHand} />
        </div>
      </div>

      <p className={`status-line strategy-feedback ${session.feedbackType}`} role="status">
        {session.feedback ||
          (decision ? `What is the play for ${decision.label} vs dealer ${decision.dealer}?` : "")}
      </p>

      <div className="strategy-actions" aria-label="Strategy actions">
        {ACTIONS.map(({ action, key }) => {
          const legal = decision
            ? isStrategyActionLegal(
                action,
                rules,
                session.playerHand,
                decision.dealer,
                session.insuranceResolved
              )
            : false;
          return (
            <button
              key={action}
              type="button"
              className="action-button"
              disabled={!legal}
              onClick={() => submitAction(action)}
            >
              {STRATEGY_ACTION_LABELS[action]}
              <kbd>{key}</kbd>
            </button>
          );
        })}
      </div>

      <p className="shortcut-help">
        Shortcuts: A hit · S stand · D double · F split · R surrender · E insurance · C review chart
        · V edit chart · N/Enter next prompt.
      </p>

      {data ? (
        <>
          <StrategyChartPanel
            open={panelMode !== null}
            mode={panelMode ?? "review"}
            setMode={setPanelMode}
            onClose={() => setPanelMode(null)}
            data={data}
            profileId={profileId}
            chartId={chartId}
            subsetId={subsetId}
            criteria={criteria}
            onCriteriaChange={setCriteria}
            onSelectChart={onChartChange}
            onSelectSubset={onSubsetChange}
            onChartCellChange={onChartCellChange}
            onDataChange={applyData}
            onFeedback={msg => setSession(s => ({ ...s, feedback: msg }))}
          />
          <StrategyRulesPanel
            open={rulesOpen}
            onClose={() => setRulesOpen(false)}
            data={data}
            profileId={profileId}
            chartId={chartId}
            onSelectProfile={onProfileChange}
            onDataChange={applyData}
            onFeedback={msg => setSession(s => ({ ...s, feedback: msg }))}
          />
        </>
      ) : null}
    </div>
  );
}

function handTotalQuick(hand: GameCard[]): number {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      aces += 1;
      total += 11;
    } else if (["10", "J", "Q", "K"].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}
