// User-facing practice settings. Mirrors the legacy defaultSettings object and is
// persisted to localStorage on the client and to settings_json on the server.

export type ShoeDisplayMode = "decks" | "numbers" | "graphic" | "hidden";
export type DealerSpeed =
  | "fast"
  | "normal"
  | "slow"
  | "learning"
  | "firstLesson"
  | "manual"
  | "custom";
export type CountCheckMode = "everyRound" | "everyNCards" | "random" | "manual";
export type DeckCountdownFlipMode = "manual" | "auto";

export interface AppSettings {
  numberOfDecks: number;
  penetrationPercent: number;
  dealerHitsSoft17: boolean;
  dealerPeek: boolean;
  blackjackPayout: string;
  surrenderAllowed: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  hitSplitAces: boolean;
  maxSplitHands: number;
  numberOfOtherPlayers: number;
  shoeDisplayMode: ShoeDisplayMode;
  dealerSpeed: DealerSpeed;
  dealDelayMs: number;
  playerThinkDelayMs: number;
  dealerThinkDelayMs: number;
  countPromptDelayMs: number;
  countCheckMode: CountCheckMode;
  countCheckCardInterval: number;
  shuffleImmediately: boolean;
  sideBetsEnabled: boolean;
  animationsEnabled: boolean;
  flashMinCards: number;
  flashMaxCards: number;
  flashDurationMs: number;
  deckCountdownDecks: number;
  deckCountdownCardsPerFlip: number;
  deckCountdownFlipMode: DeckCountdownFlipMode;
  deckCountdownAutoIntervalMs: number;
  deckCountdownShowStopwatch: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  numberOfDecks: 6,
  penetrationPercent: 75,
  dealerHitsSoft17: true,
  dealerPeek: true,
  blackjackPayout: "3:2",
  surrenderAllowed: false,
  doubleAfterSplit: true,
  resplitAces: false,
  hitSplitAces: false,
  maxSplitHands: 4,
  numberOfOtherPlayers: 2,
  shoeDisplayMode: "decks",
  dealerSpeed: "normal",
  dealDelayMs: 800,
  playerThinkDelayMs: 1200,
  dealerThinkDelayMs: 700,
  countPromptDelayMs: 1800,
  countCheckMode: "everyRound",
  countCheckCardInterval: 10,
  shuffleImmediately: false,
  sideBetsEnabled: false,
  animationsEnabled: true,
  flashMinCards: 2,
  flashMaxCards: 5,
  flashDurationMs: 1500,
  deckCountdownDecks: 1,
  deckCountdownCardsPerFlip: 1,
  deckCountdownFlipMode: "auto",
  deckCountdownAutoIntervalMs: 1000,
  deckCountdownShowStopwatch: false
};
