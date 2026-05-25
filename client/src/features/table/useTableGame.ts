import { useEffect, useState } from "react";
import type { AppSettings } from "@blackjack/shared";
import { TableEngine, type TableSnapshot } from "./engine";

/**
 * The table engine lives at module scope so the shoe, running count and tracking
 * session survive route changes — leaving Table Practice and coming back keeps the
 * same game alive, matching the original single-global-state app.
 */
let sharedEngine: TableEngine | null = null;

export function useTableGame(settings: AppSettings) {
  if (sharedEngine === null) {
    sharedEngine = new TableEngine(settings);
  }
  const engine = sharedEngine;
  const [snapshot, setSnapshot] = useState<TableSnapshot>(() => engine.snapshot());

  useEffect(() => engine.subscribe(setSnapshot), [engine]);

  useEffect(() => {
    engine.setSettings(settings);
  }, [engine, settings]);

  return { engine, snapshot };
}
