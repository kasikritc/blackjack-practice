import { useEffect, useState, type ReactNode } from "react";
import type { AnalyticsRange, SessionRow, TrendDay } from "@blackjack/shared";
import {
  formatCards,
  formatDayHeader,
  formatMinSec,
  formatMs,
  formatNumber,
  formatPercent,
  formatTimeOnly,
  dayKey,
  type StatusBadge
} from "../../lib/format";
import { subscribeTracking, toggleTracking, trackingStatus } from "./tracker";

// ---------- Hero ----------

export function AnalyticsHero({
  score,
  level,
  recentAccuracy,
  hasData,
  emptyLevel = "Needs count checks",
  accuracyHint = "Last 50 checks"
}: {
  score: number;
  level: string;
  recentAccuracy: number;
  hasData: boolean;
  emptyLevel?: string;
  accuracyHint?: string;
}) {
  return (
    <section className="analytics-hero" aria-label="Mastery summary">
      <div>
        <span className="metric-label">Mastery score</span>
        <strong>{hasData ? String(score || 0) : "—"}</strong>
        <span>{hasData ? level || "No data yet" : emptyLevel}</span>
      </div>
      <div>
        <span className="metric-label">Recent accuracy</span>
        <strong>{hasData ? `${formatPercent(recentAccuracy)}%` : "—"}</strong>
        <span>{accuracyHint}</span>
      </div>
    </section>
  );
}

// ---------- Metric tiles ----------

export function PriorityCard({
  label,
  value,
  hint,
  status
}: {
  label: string;
  value: ReactNode;
  hint: string;
  status: StatusBadge;
}) {
  return (
    <div className={`priority-card ${status.className}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>
        {status.text} · {status.hint || hint}
      </small>
    </div>
  );
}

export function MetricGroupSection({
  title,
  tiles
}: {
  title: string;
  tiles: Array<{ label: string; value: ReactNode; hint: string }>;
}) {
  return (
    <section className="metric-group">
      <h3>{title}</h3>
      <div className="metric-grid">
        {tiles.map(tile => (
          <div className="metric-tile" key={tile.label}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>{tile.hint}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Trend bar chart ----------

export function TrendChart({ days }: { days: TrendDay[] }) {
  if (!days.length) return <p className="empty-state">No data yet.</p>;
  return (
    <div className="trend-chart">
      {days.slice(-18).map(day => {
        const height = Math.max(4, Math.round(day.accuracy));
        return (
          <div
            className="trend-bar"
            key={day.day}
            title={`${day.day}: ${formatPercent(day.accuracy)}% accuracy`}
          >
            <span style={{ height: `${height}%` }} />
            <small>{day.day.slice(5)}</small>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Breakdowns ----------

export interface BreakdownRowData {
  label: string;
  checks: number;
  accuracy?: number;
  avgError?: number;
  atRisk?: boolean;
}

export interface BreakdownBlockData {
  title: string;
  rows: BreakdownRowData[];
}

export interface BreakdownFamilyData {
  title?: string;
  blocks: BreakdownBlockData[];
}

function BreakdownRow({ row }: { row: BreakdownRowData }) {
  const hasAccuracy = row.accuracy !== undefined;
  const value = hasAccuracy ? `${formatPercent(row.accuracy!)}%` : String(row.checks);
  const bar = hasAccuracy ? row.accuracy! : Math.min(100, row.checks * 10);
  const risk = row.atRisk ? " · at risk" : "";
  const detail =
    row.avgError === undefined
      ? `${row.checks} checks${risk}`
      : `${row.checks} checks, ${formatNumber(row.avgError)} avg error${risk}`;
  return (
    <div className="breakdown-row">
      <div>
        <span>{row.label}</span>
        <small>{detail}</small>
      </div>
      <strong>{value}</strong>
      <span className="breakdown-meter">
        <span style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
      </span>
    </div>
  );
}

function BreakdownBlock({ block }: { block: BreakdownBlockData }) {
  return (
    <div className="breakdown-block">
      <h5>{block.title}</h5>
      {block.rows.length ? (
        block.rows.map((row, i) => <BreakdownRow row={row} key={`${row.label}-${i}`} />)
      ) : (
        <p className="empty-state">No data</p>
      )}
    </div>
  );
}

export function BreakdownGrid({ families }: { families: BreakdownFamilyData[] }) {
  return (
    <div className="breakdown-grid">
      {families.map((family, i) => (
        <section className="breakdown-family" key={family.title ?? i}>
          {family.title ? <h4>{family.title}</h4> : null}
          <div className="breakdown-family-grid">
            {family.blocks.map(block => (
              <BreakdownBlock block={block} key={block.title} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------- Recent sessions (day-grouped, paginated) ----------

function num(session: SessionRow, key: string): number {
  const value = session[key];
  return typeof value === "number" ? value : Number(value) || 0;
}

export function SessionsList({
  sessions,
  hasMore,
  onLoadMore,
  variant
}: {
  sessions: SessionRow[];
  hasMore: boolean;
  onLoadMore: () => void;
  variant: "table" | "flash" | "deckCountdown";
}) {
  if (!sessions.length) {
    return <p className="empty-state">No sessions in this range.</p>;
  }

  // Group by calendar day, preserving order.
  const order: string[] = [];
  const buckets = new Map<string, { label: string; items: SessionRow[] }>();
  for (const session of sessions) {
    const key = dayKey(session.started_at);
    if (!buckets.has(key)) {
      buckets.set(key, { label: formatDayHeader(session.started_at), items: [] });
      order.push(key);
    }
    buckets.get(key)!.items.push(session);
  }

  return (
    <div className="session-list-scroll">
      <div className="session-list">
        {order.map(key => {
          const group = buckets.get(key)!;
          return (
            <div key={key}>
              <div className="session-day-header">{group.label}</div>
              {group.items.map(session => {
                const checks = num(session, "checks");
                return (
                  <div className="session-row" key={session.id}>
                    <div>
                      <strong>{formatTimeOnly(session.started_at)}</strong>
                      <span>
                        {variant === "flash"
                          ? `${checks} rounds · ${formatCards(num(session, "avg_cards"))} avg`
                          : variant === "deckCountdown"
                            ? `${checks} rounds · ${formatCards(num(session, "cards"))} seen · ${formatCards(num(session, "avg_cards_per_flip"))}/flip`
                            : `${formatMinSec(num(session, "play_ms"))} · ${num(session, "hands")} hands · ${checks} checks · ${num(session, "shoes")} shoes`}
                      </span>
                    </div>
                    <div>
                      <strong>
                        {checks ? `${formatPercent(num(session, "accuracy"))}%` : "—"}
                      </strong>
                      <span>
                        {checks
                          ? `${formatNumber(num(session, "avg_error"))} avg err · ${formatMs(num(session, "avg_response_ms"))}`
                          : variant === "flash"
                            ? "No rounds yet"
                            : variant === "deckCountdown"
                              ? "No rounds yet"
                              : "No checks yet"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {hasMore ? (
        <button type="button" className="load-more-button" onClick={onLoadMore}>
          <span>Show more</span>
        </button>
      ) : null}
    </div>
  );
}

// ---------- Range selector ----------

// (formatMinSec is imported from lib/format)

export function RangeSelect({
  value,
  onChange,
  options
}: {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
  options: Array<{ value: AnalyticsRange; label: string }>;
}) {
  return (
    <select
      aria-label="Date range"
      value={value}
      onChange={e => onChange(e.target.value as AnalyticsRange)}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ---------- Tracking ----------

export function TrackingControls({ className = "tracking-controls" }: { className?: string }) {
  const [status, setStatus] = useState(trackingStatus());
  useEffect(() => subscribeTracking(() => setStatus(trackingStatus())), []);

  const available = status.serverAvailable || status.sessionId != null;
  let message = "Tracking unavailable until the local API starts.";
  if (available && status.trackingEnabled && status.sessionId) {
    message = `Tracking session #${status.sessionId}`;
  } else if (available && status.trackingEnabled) {
    message = "Tracking ready. Session starts on first visible card.";
  } else if (available) {
    message = "Tracking paused. Practice continues without new data.";
  }

  return (
    <div className={className} aria-label="Analytics tracking status">
      <span>{message}</span>
      <button
        type="button"
        className={`ghost-button${status.trackingEnabled ? "" : " is-off"}`}
        onClick={() => void toggleTracking()}
        disabled={!available}
      >
        {status.trackingEnabled ? "Tracking On" : "Tracking Off"}
      </button>
    </div>
  );
}
