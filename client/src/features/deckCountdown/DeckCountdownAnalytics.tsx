import { useCallback, useEffect, useState } from "react";
import type {
  AnalyticsRange,
  AnalyticsTrends,
  DeckCountdownSummary,
  SessionRow,
  TrendDay
} from "@blackjack/shared";
import { Drawer } from "../../components/Drawer";
import { api } from "../../lib/api";
import { formatMs, formatNumber, formatPercent } from "../../lib/format";
import {
  AnalyticsHero,
  BreakdownGrid,
  MetricGroupSection,
  RangeSelect,
  SessionsList,
  type BreakdownFamilyData,
  type BreakdownRowData
} from "../analytics/AnalyticsShared";

const PAGE_SIZE = 10;
const TREND_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "all", label: "All time" },
  { value: "30d", label: "30 days" },
  { value: "7d", label: "7 days" }
];
const SESSION_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" }
];

function breakdownFamilies(summary: DeckCountdownSummary): BreakdownFamilyData[] {
  const errorRows: BreakdownRowData[] = [
    { label: "Perfect", checks: summary.errorBuckets?.perfect || 0 },
    { label: "Off by 1", checks: summary.errorBuckets?.one || 0 },
    { label: "Off by 2", checks: summary.errorBuckets?.two || 0 },
    { label: "Major", checks: summary.errorBuckets?.major || 0 }
  ];
  return [
    {
      blocks: [
        { title: "By deck count", rows: summary.byDeckCount || [] },
        { title: "Cards per flip", rows: summary.byCardsPerFlip || [] },
        { title: "Flip mode", rows: summary.byFlipMode || [] },
        { title: "Error size", rows: errorRows }
      ]
    }
  ];
}

function CleanTimePerDeckChart({ days }: { days: TrendDay[] }) {
  const cleanDays = days
    .filter(
      (day): day is TrendDay & { cleanTimePerDeckMs: number } =>
        Number.isFinite(Number(day.cleanTimePerDeckMs)) && Number(day.cleanTimePerDeckMs) > 0
    )
    .slice(-18);
  if (!cleanDays.length) {
    return <p className="empty-state">No 100%-accurate runs in this range.</p>;
  }

  const width = 640;
  const height = 220;
  const margin = { top: 18, right: 16, bottom: 38, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = cleanDays.map(day => day.cleanTimePerDeckMs);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(1000, (rawMax - rawMin) * 0.12);
  const minValue = Math.max(0, rawMin - padding);
  const maxValue = rawMax + padding;
  const valueRange = Math.max(1, maxValue - minValue);
  const xAt = (index: number) =>
    cleanDays.length === 1
      ? margin.left + plotWidth / 2
      : margin.left + (index / (cleanDays.length - 1)) * plotWidth;
  const yAt = (value: number) => margin.top + ((maxValue - value) / valueRange) * plotHeight;
  const linePoints = cleanDays
    .map((day, index) => `${xAt(index)},${yAt(day.cleanTimePerDeckMs)}`)
    .join(" ");
  const ticks = Array.from({ length: 4 }, (_, index) => maxValue - (valueRange * index) / 3);
  const labelEvery = Math.max(1, Math.ceil(cleanDays.length / 6));

  return (
    <div className="clean-time-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Average clean time per deck by day"
      >
        {ticks.map(value => {
          const y = yAt(value);
          return (
            <g className="clean-time-grid" key={value}>
              <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} />
              <text x={margin.left - 8} y={y + 4} textAnchor="end">
                {formatMs(value)}
              </text>
            </g>
          );
        })}
        <polyline className="clean-time-line" points={linePoints} />
        {cleanDays.map((day, index) => {
          const x = xAt(index);
          const y = yAt(day.cleanTimePerDeckMs);
          const showLabel =
            index === 0 || index === cleanDays.length - 1 || index % labelEvery === 0;
          return (
            <g className="clean-time-point" key={day.day}>
              <circle cx={x} cy={y} r="4">
                <title>{`${day.day}: ${formatMs(day.cleanTimePerDeckMs)} per deck (${day.checks} clean ${day.checks === 1 ? "run" : "runs"})`}</title>
              </circle>
              {showLabel ? (
                <text x={x} y={margin.top + plotHeight + 24} textAnchor="middle">
                  {day.day.slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DeckCountdownAnalytics({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [summary, setSummary] = useState<DeckCountdownSummary | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrends | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [trendRange, setTrendRange] = useState<AnalyticsRange>("all");
  const [sessionRange, setSessionRange] = useState<AnalyticsRange>("7d");
  const [sessionLimit, setSessionLimit] = useState(PAGE_SIZE);
  const [error, setError] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        api.deckCountdownSummary(),
        api.deckCountdownTrends(trendRange)
      ]);
      setSummary(s);
      setTrends(t);
      setError(false);
    } catch {
      setError(true);
    }
  }, [trendRange]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.deckCountdownSessions(sessionLimit + 1, sessionRange);
      setHasMore(data.sessions.length > sessionLimit);
      setSessions(data.sessions.slice(0, sessionLimit));
    } catch {
      setSessions([]);
      setHasMore(false);
    }
  }, [sessionLimit, sessionRange]);

  useEffect(() => {
    if (open) void loadSummary();
  }, [open, loadSummary]);

  useEffect(() => {
    if (open) void loadSessions();
  }, [open, loadSessions]);

  const reset = async () => {
    if (!window.confirm("Delete all recorded Deck Countdown data? This cannot be undone.")) return;
    await api.resetDeckCountdownAnalytics();
    void loadSummary();
    void loadSessions();
  };

  const refresh = () => {
    void loadSummary();
    void loadSessions();
  };

  const hasRounds = (summary?.totals?.rounds || 0) > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Deck countdown"
      title="Countdown Analytics"
      footer={
        <div className="data-tools">
          <button type="button" className="ghost-button" onClick={refresh}>
            Refresh
          </button>
          <button type="button" className="ghost-button" onClick={() => void reset()}>
            Reset data
          </button>
        </div>
      }
    >
      {error ? <p className="empty-state">Start the local server to load analytics.</p> : null}

      {summary ? (
        <AnalyticsHero
          score={summary.masteryScore}
          level={summary.level}
          recentAccuracy={summary.recentAccuracy}
          hasData={hasRounds}
          emptyLevel="Needs completed decks"
          accuracyHint="Last 50 rounds"
        />
      ) : null}

      {summary && hasRounds ? (
        <section className="analytics-metrics">
          <MetricGroupSection
            title="Performance"
            tiles={[
              {
                label: "All-time accuracy",
                value: `${formatPercent(summary.accuracy)}%`,
                hint: "Completed countdowns"
              },
              {
                label: "Average error",
                value: formatNumber(summary.avgError),
                hint: "Absolute final-count miss"
              },
              {
                label: "Median time",
                value: formatMs(summary.medianResponse),
                hint: "Typical completion time"
              },
              {
                label: "Best clean time",
                value: formatMs(summary.bestTimeMs),
                hint: "Correct rounds only"
              }
            ]}
          />
          <MetricGroupSection
            title="Consistency"
            tiles={[
              { label: "Current streak", value: summary.currentStreak, hint: "Correct rounds" },
              { label: "Best streak", value: summary.bestStreak, hint: "Correct rounds" },
              { label: "No major miss", value: summary.noMajorErrorStreak, hint: "Errors under 3" }
            ]}
          />
          <MetricGroupSection
            title="Practice volume"
            tiles={[
              { label: "Rounds", value: summary.totals?.rounds || 0, hint: "Submitted drills" },
              { label: "Cards seen", value: summary.totals?.cards || 0, hint: "Across rounds" },
              {
                label: "Average decks",
                value: formatNumber(summary.avgDecks),
                hint: "Decks per round"
              },
              { label: "Sessions", value: summary.totals?.sessions || 0, hint: "Tracked visits" }
            ]}
          />
        </section>
      ) : !error ? (
        <p className="empty-state">No completed deck countdowns yet.</p>
      ) : null}

      {summary ? (
        <>
          <section className="analytics-section" aria-label="Progress trend">
            <div className="section-title">
              <h3>Progress</h3>
              <RangeSelect value={trendRange} onChange={setTrendRange} options={TREND_OPTIONS} />
            </div>
            <div className="clean-time-heading">
              <strong>Average clean time per deck</strong>
              <span>Daily average from 100%-accurate runs. Lower is better.</span>
            </div>
            <CleanTimePerDeckChart days={trends?.days ?? []} />
          </section>

          <section className="analytics-section" aria-label="Performance breakdowns">
            <h3>Breakdowns</h3>
            <BreakdownGrid families={breakdownFamilies(summary)} />
          </section>

          <section className="analytics-section" aria-label="Recent sessions">
            <div className="session-section-header">
              <h3>Recent Sessions</h3>
              <label className="session-range">
                <RangeSelect
                  value={sessionRange}
                  onChange={range => {
                    setSessionRange(range);
                    setSessionLimit(PAGE_SIZE);
                  }}
                  options={SESSION_OPTIONS}
                />
              </label>
            </div>
            <SessionsList
              sessions={sessions}
              hasMore={hasMore}
              onLoadMore={() => setSessionLimit(limit => limit + PAGE_SIZE)}
              variant="deckCountdown"
            />
          </section>
        </>
      ) : null}
    </Drawer>
  );
}
