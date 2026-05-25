import { useCallback, useState } from "react";
import type { AppSettings } from "@blackjack/shared";
import { loadSettings, saveSettings } from "./settings";

/** Settings backed by localStorage, shared in shape across all drills. */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const update = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  return [settings, update] as const;
}

export const SPEED_PRESETS: Record<
  string,
  { deal: number; player: number; dealer: number; quiz: number }
> = {
  fast: { deal: 250, player: 300, dealer: 250, quiz: 800 },
  normal: { deal: 800, player: 1200, dealer: 700, quiz: 1800 },
  slow: { deal: 1400, player: 2300, dealer: 1300, quiz: 3200 },
  learning: { deal: 2500, player: 4000, dealer: 2500, quiz: 5200 },
  firstLesson: { deal: 4000, player: 6500, dealer: 4000, quiz: 7800 }
};
