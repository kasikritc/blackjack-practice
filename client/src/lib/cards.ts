import {
  RANKS,
  RED_SUITS,
  SUITS,
  SUIT_SYMBOLS,
  hiLoValue,
  type Rank,
  type Suit
} from "@blackjack/shared";

export interface CardAnalytics {
  visibleOrder: number;
  hiLoValue: number;
  runningCountAfter: number;
  seatRole: string;
  seatName: string;
  dealerHoleReveal: boolean;
  observedAt: number;
  msSincePreviousVisibleCard: number | null;
  numberOfOtherPlayers?: number;
  shoeDisplayMode?: string;
  dealerSpeed?: string;
  dealDelayMs?: number;
  playerThinkDelayMs?: number;
  dealerThinkDelayMs?: number;
  countPromptDelayMs?: number;
}

export interface GameCard {
  rank: Rank;
  suit: Suit;
  id: string;
  visible: boolean;
  counted: boolean;
  analytics?: CardAnalytics;
}

let cardSerial = 0;

export function nextSerial(): number {
  cardSerial += 1;
  return cardSerial;
}

export function makeCard(rank: Rank, suit: Suit, prefix: string, visible: boolean): GameCard {
  return { rank, suit, id: `${prefix}-${suit}-${rank}-${nextSerial()}`, visible, counted: false };
}

export function randomRank(): Rank {
  return RANKS[Math.floor(Math.random() * RANKS.length)];
}

export function randomSuit(): Suit {
  return SUITS[Math.floor(Math.random() * SUITS.length)];
}

export interface Shoe {
  cards: GameCard[];
  discardPile: GameCard[];
  cutCardIndex: number;
  cardsDealt: number;
  cutReached: boolean;
}

export function makeShoe(deckCount: number, penetrationPercent: number): Shoe {
  const cards: GameCard[] = [];
  cardSerial = 0;
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cardSerial += 1;
        cards.push({
          rank,
          suit,
          id: `${deck}-${suit}-${rank}-${cardSerial}`,
          visible: false,
          counted: false
        });
      }
    }
  }
  shuffle(cards);
  const cutCardIndex = Math.floor(cards.length * (penetrationPercent / 100));
  return { cards, discardPile: [], cutCardIndex, cardsDealt: 0, cutReached: false };
}

export function shuffle<T>(cards: T[]): void {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

export function getHiLoValue(card: { rank: Rank }): number {
  return hiLoValue(card.rank);
}

export interface HandValue {
  total: number;
  soft: boolean;
}

export function handValue(hand: GameCard[], includeHidden = false): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (!card.visible && !includeHidden) continue;
    if (card.rank === "A") {
      aces += 1;
      total += 11;
    } else if (["10", "J", "Q", "K"].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(hand: GameCard[]): boolean {
  return hand.length === 2 && handValue(hand, true).total === 21;
}

export function isRed(suit: Suit): boolean {
  return RED_SUITS.includes(suit);
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}

export function cardLabel(card: { rank: Rank; suit: Suit }): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function rankBlackjackValue(rank: string): number {
  if (rank === "A") return 11;
  if (["10", "J", "Q", "K"].includes(rank)) return 10;
  return Number(rank);
}
