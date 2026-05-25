export function nowIso(): string {
  return new Date().toISOString();
}

export function parseSettingsJson(value: unknown): Record<string, any> {
  if (!value) return {};
  try {
    return JSON.parse(value as string);
  } catch {
    return {};
  }
}

export function firstPresent(...values: any[]): any {
  return values.find(value => value !== null && value !== undefined && value !== "");
}

export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function average(values: any[]): number {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  return round(nums.reduce((sum, value) => sum + value, 0) / nums.length, 2);
}

export function percentile(values: any[], p: number): number {
  const nums = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!nums.length) return 0;
  const index = Math.min(nums.length - 1, Math.max(0, Math.ceil(nums.length * p) - 1));
  return Math.round(nums[index]);
}

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return round((value / total) * 100, 1);
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value as string, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function rangeToSinceIso(range: string): string | null {
  const days = ({ "7d": 7, "30d": 30 } as Record<string, number>)[range];
  if (!days) return null;
  const since = new Date(Date.now() - days * 86400000);
  return since.toISOString().replace("T", " ").slice(0, 19);
}
