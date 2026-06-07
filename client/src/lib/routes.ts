import type { DrillMode } from "@blackjack/shared";

/** Descriptive slugs requested for each drill. Home lives at "/". */
export const DRILL_PATHS: Record<Exclude<DrillMode, "home">, string> = {
  table: "/table-practice",
  flash: "/flash-count",
  strategy: "/basic-strategy",
  deckCountdown: "/deck-countdown",
  simulator: "/simulator"
};

export interface DrillMeta {
  mode: Exclude<DrillMode, "home">;
  path: string;
  title: string;
  tagline: string;
  description: string;
}

export const DRILLS: DrillMeta[] = [
  {
    mode: "table",
    path: DRILL_PATHS.table,
    title: "Table Practice",
    tagline: "Full table",
    description: "Play full shoes with other players and keep a running count, quizzed as you go."
  },
  {
    mode: "flash",
    path: DRILL_PATHS.flash,
    title: "Flash Count",
    tagline: "Speed drill",
    description:
      "A few cards flash, then hide. Call the Hi-Lo count of the hand instantly. Resets each round."
  },
  {
    mode: "strategy",
    path: DRILL_PATHS.strategy,
    title: "Basic Strategy",
    tagline: "Decision drill",
    description:
      "Practice two-card player decisions against a dealer upcard using your own saved charts and house rules."
  },
  {
    mode: "deckCountdown",
    path: DRILL_PATHS.deckCountdown,
    title: "Deck Countdown",
    tagline: "Full deck speed",
    description:
      "Flip through complete shuffled decks and submit the ending Hi-Lo count. Built for speed and accuracy."
  },
  {
    mode: "simulator",
    path: DRILL_PATHS.simulator,
    title: "Simulator",
    tagline: "Strategy laboratory",
    description:
      "Generate strategy evidence, evaluate complete systems, monitor native runs, and compare results."
  }
];
