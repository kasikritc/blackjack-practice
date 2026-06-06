// Core card / table domain types shared between client and server.

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export const SUITS: readonly Suit[] = ["hearts", "diamonds", "clubs", "spades"];

export const RANKS: readonly Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K"
];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠"
};

export const RED_SUITS: readonly Suit[] = ["hearts", "diamonds"];

export interface Card {
  rank: Rank;
  suit: Suit;
  /** Unique per-deal serial used as a render key. */
  serial?: number;
}

export type SeatRole = "player" | "dealer" | "other";

/** The drill currently being played; also the basis for the route slug. */
export type DrillMode = "home" | "table" | "flash" | "strategy" | "deckCountdown";

/** Hi-Lo running-count value for a rank: +1 low (2-6), 0 neutral (7-9), -1 high (10-A). */
export function hiLoValue(rank: Rank): number {
  if (rank === "A" || rank === "K" || rank === "Q" || rank === "J" || rank === "10") return -1;
  if (rank === "7" || rank === "8" || rank === "9") return 0;
  return 1;
}
