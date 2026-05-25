import { useCallback, useEffect, useState } from "react";
import type { AnalyticsRange, AnalyticsTrends, FlashSummary, SessionRow } from "@blackjack/shared";
import { Drawer } from "../../components/Drawer";
import { api } from "../../lib/api";
import { formatCards, formatMs, formatNumber, formatPercent } from "../../lib/format";
import {
  AnalyticsHero,
  BreakdownGrid,
  MetricGroupSection,
  RangeSelect,
  SessionsList,
  TrendChart,
  type BreakdownFamilyData,
  type BreakdownRowData
} from "./AnalyticsShared";

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

function breakdownFamilies(summary: FlashSummary): BreakdownFamilyData[] {
  const errorRows: BreakdownRowData[] = [
    { label: "Perfect", checks: summary.errorBuckets?.perfect || 0 },
    { label: "Off by 1", checks: summary.errorBuckets?.one || 0 },
    { label: "Off by 2", checks: summary.errorBuckets?.two || 0 },
    { label: "Major", checks: summary.errorBuckets?.major || 0 }
  ];
  return [
    {
      blocks: [
        { title: "By hand size", rows: summary.byCardCount || [] },
        { title: "Error size", rows: errorRows }
      ]
    }
  ];
}

export function FlashAnalytics({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [summary, setSummary] = useState<FlashSummary | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrends | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [trendRange, setTrendRange] = useState<AnalyticsRange>("all");
  const [sessionRange, setSessionRange] = useState<AnalyticsRange>("7d");
  const [sessionLimit, setSessionLimit] = useState(PAGE_SIZE);
  const [error, setError] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.flashSummary(), api.flashTrends(trendRange)]);
      setSummary(s);
      setTrends(t);
      setError(false);
    } catch {
      setError(true);
    }
  }, [trendRange]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.flashSessions(sessionLimit + 1, sessionRange);
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
    if (!window.confirm("Delete all recorded Flash Count data? This cannot be undone.")) return;
    await api.resetFlashAnalytics();
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
      eyebrow="Flash counting"
      title="Flash Analytics"
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
          emptyLevel="Needs rounds"
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
                hint: "Every round"
              },
              {
                label: "Average error",
                value: formatNumber(summary.avgError),
                hint: "Absolute count miss"
              },
              {
                label: "Median speed",
                value: formatMs(summary.medianResponse),
                hint: "Typical answer time"
              },
              { label: "P90 speed", value: formatMs(summary.p90Response), hint: "Slower responses" }
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
              {
                label: "Rounds played",
                value: summary.totals?.rounds || 0,
                hint: "Submitted answers"
              },
              { label: "Cards seen", value: summary.totals?.cards || 0, hint: "Across rounds" },
              {
                label: "Avg hand size",
                value: formatCards(summary.avgCards),
                hint: "Cards per round"
              },
              { label: "Sessions", value: summary.totals?.sessions || 0, hint: "Tracked visits" }
            ]}
          />
        </section>
      ) : !error ? (
        <p className="empty-state">No flash rounds yet.</p>
      ) : null}

      {summary ? (
        <>
          <section className="analytics-section" aria-label="Progress trend">
            <div className="section-title">
              <h3>Progress</h3>
              <RangeSelect value={trendRange} onChange={setTrendRange} options={TREND_OPTIONS} />
            </div>
            <TrendChart days={trends?.days ?? []} />
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
              variant="flash"
            />
          </section>
        </>
      ) : null}
    </Drawer>
  );
}
