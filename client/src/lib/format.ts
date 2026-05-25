// Formatting helpers ported verbatim from the original app.js so stats bars and
// analytics render numbers/dates/durations identically to the monolithic app.

export function formatNumber(value: number | string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

export function formatPercent(value: number | string): string {
  return formatNumber(Number(value) || 0);
}

export function formatCards(value: number | string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0 cards";
  const rounded = Number.isInteger(number) ? String(number) : number.toFixed(1);
  return `${rounded} card${number === 1 ? "" : "s"}`;
}

export function formatMinSec(ms: number | string): string {
  const number = Number(ms);
  if (!Number.isFinite(number) || number <= 0) return "0m 0s";
  const totalSeconds = Math.round(number / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatDuration(ms: number | string): string {
  const number = Number(ms);
  if (!Number.isFinite(number) || number <= 0) return "0m";
  const totalSeconds = Math.round(number / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatMs(value: number | string): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "0 ms";
  if (number >= 1000) return `${(number / 1000).toFixed(1)} s`;
  return `${Math.round(number)} ms`;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimeOnly(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayKey(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatDayHeader(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "Unknown";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== today.getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString([], opts);
}

export interface StatusBadge {
  className: string;
  text: string;
  hint?: string;
}

export function priorityStatus(value: number, strong: number, watch: number): StatusBadge {
  const number = Number(value);
  if (!Number.isFinite(number)) return { className: "is-watch", text: "Needs data" };
  if (number >= strong) return { className: "is-strong", text: "Strong" };
  if (number >= watch) return { className: "is-watch", text: "Watch" };
  return { className: "is-risk", text: "Priority" };
}

export function errorStatus(value: number): StatusBadge {
  const number = Number(value);
  if (!Number.isFinite(number)) return { className: "is-watch", text: "Needs data" };
  if (number <= 0.5) return { className: "is-strong", text: "Strong" };
  if (number <= 1.25) return { className: "is-watch", text: "Watch" };
  return { className: "is-risk", text: "Priority" };
}

export function selfCheckSpacingStatus(quizSpacing: {
  medianCardsPerCheck: number;
  p90CardsPerCheck: number;
  buckets: Array<{ label: string; atRisk?: boolean }>;
}): StatusBadge {
  const median = Number(quizSpacing?.medianCardsPerCheck);
  const p90 = Number(quizSpacing?.p90CardsPerCheck);
  if (!Number.isFinite(median) || !Number.isFinite(p90)) {
    return {
      className: "is-watch",
      text: "Needs data",
      hint: "Submit more count checks to see spacing"
    };
  }
  const longBuckets = ["11-15 cards", "16+ cards"];
  const hurting = (quizSpacing.buckets || []).find(
    bucket => bucket.atRisk && longBuckets.includes(bucket.label)
  );
  if (hurting) {
    return {
      className: "is-risk",
      text: "Count slips at long gaps",
      hint: `Accuracy drops at ${hurting.label} — practice holding the count longer`
    };
  }
  if (p90 > 10) {
    return {
      className: "is-strong",
      text: "Holding the count",
      hint: `Accuracy steady across gaps up to ${formatCards(p90)}`
    };
  }
  return {
    className: "is-watch",
    text: "Short gaps only",
    hint: "Try longer stretches between checks to match table play"
  };
}
