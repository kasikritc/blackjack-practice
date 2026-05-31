import { DEFAULT_SETTINGS, type AppSettings } from "@blackjack/shared";

const STORAGE_KEY = "blackjack-practice:settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private mode); ignore */
  }
}

export function clampFlashCount(value: number | string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(8, n));
}


export function clampDeckCountdownDecks(value: number | string): number {
  const allowed = [1, 2, 4, 6, 8];
  const n = Math.round(Number(value));
  return allowed.includes(n) ? n : 1;
}

export function clampDeckCountdownCardsPerFlip(value: number | string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(8, n));
}

export function clampDeckCountdownInterval(value: number | string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1000;
  return Math.max(200, Math.min(3000, n));
}
