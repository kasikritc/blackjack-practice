import { useCallback, useEffect, useState } from "react";
import type {
  AnalyticsRange,
  AnalyticsSummary,
  AnalyticsTrends,
  SessionRow
} from "@blackjack/shared";
import { Drawer } from "../../components/Drawer";
import { api } from "../../lib/api";
import {
  errorStatus,
  formatCards,
  formatDuration,
  formatMs,
  formatNumber,
  formatPercent,
  priorityStatus,
  selfCheckSpacingStatus
} from "../../lib/format";
import {
  AnalyticsHero,
  BreakdownGrid,
  MetricGroupSection,
  PriorityCard,
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

function breakdownFamilies(summary: AnalyticsSummary): BreakdownFamilyData[] {
  const errorRows: BreakdownRowData[] = [
    { label: "Perfect", checks: summary.errorBuckets?.perfect || 0 },
    { label: "Off by 1", checks: summary.errorBuckets?.one || 0 },
    { label: "Off by 2", checks: summary.errorBuckets?.two || 0 },
    { label: "Major", checks: summary.errorBuckets?.major || 0 }
  ];
  return [
    {
      title: "Mistake patterns",
      blocks: [
        { title: "Error size", rows: errorRows },
        {
          title: "Likely error drivers",
          rows: (summary.errorDrivers || []) as BreakdownRowData[]
        }
      ]
    },
    {
      title: "Training pressure",
      blocks: [
        { title: "Self-check spacing", rows: summary.quizSpacing?.buckets || [] },
        { title: "Count pressure", rows: summary.pressure || [] },
        { title: "Prompt type", rows: summary.promptTypes || [] }
      ]
    },
    {
      title: "Table conditions",
      blocks: [
        { title: "Actual deal speed", rows: summary.speedBreakdown || [] },
        { title: "Other players", rows: summary.otherPlayers || [] },
        { title: "Shoe display", rows: summary.shoeDisplayModes || [] },
        { title: "Shoe depth", rows: summary.depth || [] }
      ]
    }
  ];
}

export function TableAnalytics({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrends | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [trendRange, setTrendRange] = useState<AnalyticsRange>("all");
  const [sessionRange, setSessionRange] = useState<AnalyticsRange>("7d");
  const [sessionLimit, setSessionLimit] = useState(PAGE_SIZE);
  const [error, setError] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.analyticsSummary(), api.analyticsTrends(trendRange)]);
      setSummary(s);
      setTrends(t);
      setError(false);
    } catch {
      setError(true);
    }
  }, [trendRange]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.analyticsSessions(sessionLimit + 1, sessionRange);
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
    if (!window.confirm("Delete all recorded analytics data? This cannot be undone.")) return;
    await api.resetAnalytics();
    void loadSummary();
    void loadSessions();
  };

  const refresh = () => {
    void loadSummary();
    void loadSessions();
  };

  const hasChecks = (summary?.totals?.checks || 0) > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Counting mastery"
      title="Analytics"
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
          hasData={hasChecks}
        />
      ) : null}

      {summary && hasChecks ? (
        <section className="analytics-metrics">
          <section className="analytics-priority" aria-label="What to focus on first">
            <PriorityCard
              label="Accuracy"
              value={`${formatPercent(summary.recentAccuracy)}%`}
              hint="Last 50 checks"
              status={priorityStatus(summary.recentAccuracy, 90, 75)}
            />
            <PriorityCard
              label="Error control"
              value={formatNumber(summary.recentAvgError)}
              hint="Recent average miss"
              status={errorStatus(summary.recentAvgError)}
            />
            <PriorityCard
              label="Self-check spacing"
              value={formatCards(summary.quizSpacing?.medianCardsPerCheck)}
              hint="Cards between your count checks"
              status={selfCheckSpacingStatus(summary.quizSpacing)}
            />
          </section>
          <MetricGroupSection
            title="Performance"
            tiles={[
              {
                label: "All-time accuracy",
                value: `${formatPercent(summary.accuracy)}%`,
                hint: "Every count check"
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
              { label: "Current streak", value: summary.currentStreak, hint: "Correct checks" },
              { label: "Best streak", value: summary.bestStreak, hint: "Correct checks" },
              { label: "No major miss", value: summary.noMajorErrorStreak, hint: "Errors under 3" }
            ]}
          />
          <MetricGroupSection
            title="Self-check spacing"
            tiles={[
              {
                label: "Typical gap",
                value: formatCards(summary.quizSpacing?.medianCardsPerCheck),
                hint: "Median cards per check"
              },
              {
                label: "Average gap",
                value: formatCards(summary.quizSpacing?.avgCardsPerCheck),
                hint: "Cards per check"
              },
              {
                label: "Check rate",
                value: `${formatNumber(summary.quizSpacing?.checksPer100Cards)} / 100`,
                hint: "Visible cards"
              },
              {
                label: "Max recent gap",
                value: formatCards(summary.quizSpacing?.maxRecentGap),
                hint: "Last 50 checks"
              }
            ]}
          />
          <MetricGroupSection
            title="Practice volume"
            tiles={[
              { label: "Cards counted", value: summary.totals?.cards || 0, hint: "Visible cards" },
              {
                label: "Count checks",
                value: summary.totals?.checks || 0,
                hint: "Submitted answers"
              },
              {
                label: "Hands played",
                value: summary.totals?.hands || 0,
                hint: "Completed rounds"
              },
              { label: "Sessions", value: summary.totals?.sessions || 0, hint: "Tracked visits" },
              {
                label: "Total play time",
                value: formatDuration(summary.totals?.totalPlayMs),
                hint: "Active time at the table"
              }
            ]}
          />
        </section>
      ) : !error ? (
        <p className="empty-state">No count checks yet.</p>
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
              variant="table"
            />
          </section>
        </>
      ) : null}
    </Drawer>
  );
}
