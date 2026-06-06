import type { AppSettings } from "@blackjack/shared";
import {
  getHiLoValue,
  handValue,
  isBlackjack,
  makeShoe,
  type GameCard,
  type Shoe
} from "../../lib/cards";
import {
  configureTracking,
  trackCard,
  trackCountCheck,
  trackEndShoe,
  trackHand,
  trackStartShoe
} from "../analytics/tracker";

export type SeatRole = "player" | "dealer" | "other";

export interface Seat {
  name: string;
  role: SeatRole;
  hand: GameCard[];
  stood: boolean;
  busted: boolean;
  blackjack: boolean;
}

export type GamePhase = "ready" | "dealing" | "players" | "dealer" | "roundEnd";

export interface PendingCountCheck {
  source: string;
  correctCount: number;
  previousCount: number;
  delta: number;
  cards: GameCard[];
  promptOpenedAt: number;
}

export interface CountCheckResult {
  correct: boolean;
  correctCount: number;
  previousCount: number;
  delta: number;
  cards: GameCard[];
}

export interface TableSnapshot {
  dealer: Seat;
  seats: Seat[];
  runningCount: number;
  phase: GamePhase;
  paused: boolean;
  acting: boolean;
  handNumber: number;
  status: string;
  pendingShuffle: boolean;
  pendingCountCheck: PendingCountCheck | null;
  shoeCards: number;
  discardCards: number;
  cutReached: boolean;
  hasShoe: boolean;
}

function makeSeat(name: string, role: SeatRole): Seat {
  return { name, role, hand: [], stood: false, busted: false, blackjack: false };
}

export class TableEngine {
  private settings: AppSettings;
  private shoe: Shoe | null = null;
  private dealer: Seat = makeSeat("Dealer", "dealer");
  private seats: Seat[] = [];
  private runningCount = 0;
  private lastCheckCount = 0;
  private visibleCardsSinceLastCheck: GameCard[] = [];
  private visibleCardsSincePrompt = 0;
  private nextRandomPromptAt = 9;
  private phase: GamePhase = "ready";
  private paused = false;
  private acting = false;
  private pendingShuffle = false;
  private handNumber = 0;
  private status = "";
  private pendingCountCheck: PendingCountCheck | null = null;

  private countPromptResolve: (() => void) | null = null;
  private pauseResolvers: Array<() => void> = [];
  private manualStepResolve: (() => void) | null = null;

  private visibleOrder = 0;
  private lastVisibleCardAt: number | null = null;
  private handStartedAt = 0;
  private handVisibleCards = 0;
  private handCardsDealtStart = 0;
  private handRunningCountStart = 0;
  private countPromptSource = "manual";

  private listeners = new Set<(snapshot: TableSnapshot) => void>();

  constructor(settings: AppSettings) {
    this.settings = settings;
    configureTracking(settings);
  }

  subscribe(listener: (snapshot: TableSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setSettings(settings: AppSettings): void {
    this.settings = settings;
    configureTracking(settings);
  }

  snapshot(): TableSnapshot {
    return {
      dealer: this.dealer,
      seats: this.seats,
      runningCount: this.runningCount,
      phase: this.phase,
      paused: this.paused,
      acting: this.acting,
      handNumber: this.handNumber,
      status: this.status,
      pendingShuffle: this.pendingShuffle,
      pendingCountCheck: this.pendingCountCheck,
      shoeCards: this.shoe?.cards.length ?? 0,
      discardCards: this.shoe?.discardPile.length ?? 0,
      cutReached: this.shoe?.cutReached ?? false,
      hasShoe: Boolean(this.shoe)
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  private setStatus(text: string): void {
    this.status = text;
  }

  // --- Shoe lifecycle -------------------------------------------------------

  startNewShoe(): void {
    if (this.shoe) {
      trackEndShoe({
        cardsDealt: this.shoe.cardsDealt,
        cutCardReached: this.shoe.cutReached,
        finalRunningCount: this.runningCount
      });
    }
    this.resumePausedWaits();
    this.paused = false;
    this.shoe = makeShoe(this.settings.numberOfDecks, this.settings.penetrationPercent);
    this.runningCount = 0;
    this.lastCheckCount = 0;
    this.visibleCardsSinceLastCheck = [];
    this.visibleCardsSincePrompt = 0;
    this.nextRandomPromptAt = this.randomPromptDistance();
    this.pendingShuffle = false;
    this.phase = "ready";
    this.handNumber = 0;
    this.clearTable();
    this.setStatus(
      `New ${this.settings.numberOfDecks}-deck shoe shuffled. Cut card at ${this.settings.penetrationPercent}%.`
    );
    trackStartShoe();
    this.visibleOrder = 0;
    this.lastVisibleCardAt = null;
    this.emit();
  }

  private clearTable(): void {
    this.dealer = makeSeat("Dealer", "dealer");
    this.seats = [];
    const leftSeatCount = Math.floor(this.settings.numberOfOtherPlayers / 2);
    for (let i = 0; i < leftSeatCount; i += 1) this.seats.push(makeSeat(`Seat ${i + 1}`, "other"));
    this.seats.push(makeSeat("You", "player"));
    for (let i = leftSeatCount; i < this.settings.numberOfOtherPlayers; i += 1) {
      this.seats.push(makeSeat(`Seat ${i + 1}`, "other"));
    }
  }

  // --- Round loop -----------------------------------------------------------

  async runRound(): Promise<void> {
    if (this.acting || this.paused) return;
    if (!this.shoe) this.startNewShoe();
    if (this.pendingShuffle) {
      this.startNewShoe();
      return;
    }
    this.acting = true;
    this.clearTable();
    this.handNumber += 1;
    this.handStartedAt = Date.now();
    this.handVisibleCards = 0;
    this.handCardsDealtStart = this.shoe!.cardsDealt;
    this.handRunningCountStart = this.runningCount;
    this.phase = "dealing";
    this.setStatus(`Hand ${this.handNumber}: dealing.`);
    this.emit();
    let handOutcome = "Round complete";

    try {
      await this.dealInitialCards();
      this.markNaturals();
      if (this.settings.dealerPeek && this.dealerHasBlackjackPeek()) {
        await this.revealDealerHole();
        handOutcome = "Dealer blackjack";
        this.setStatus("Dealer blackjack. Round ends.");
      } else {
        await this.playPlayers();
        await this.playDealer();
        handOutcome = this.resolveSummary();
        this.setStatus(handOutcome);
      }

      this.moveHandsToDiscard();
      this.recordHand(handOutcome);
      this.phase = "roundEnd";
      this.clearTable();
      this.emit();

      if (this.shoe!.cutReached) {
        this.pendingShuffle = true;
        this.setStatus("Cut card reached. Shuffling after this round.");
        if (
          this.settings.countCheckMode === "random" ||
          this.settings.countCheckMode === "everyRound"
        ) {
          await this.maybePrompt(true);
        }
      } else if (this.settings.countCheckMode === "everyRound") {
        await this.openCountCheck("everyRound");
      }
    } catch (error) {
      console.error(error);
      this.setStatus("Dealing stopped. Tap New shoe to reset.");
    }

    this.phase = "roundEnd";
    this.acting = false;
    this.emit();
  }

  private async dealInitialCards(): Promise<void> {
    for (const seat of this.clockwisePlayerSeats()) await this.dealTo(seat, true);
    await this.dealTo(this.dealer, true);
    for (const seat of this.clockwisePlayerSeats()) await this.dealTo(seat, true);
    await this.dealTo(this.dealer, false);
  }

  private async playPlayers(): Promise<void> {
    this.phase = "players";
    for (const seat of this.clockwisePlayerSeats()) {
      this.setStatus(`${seat.name} playing.`);
      await this.waitForThink(seat.role === "dealer" ? "dealer" : "player");
      while (handValue(seat.hand).total < 17 && !isBlackjack(seat.hand)) {
        await this.dealTo(seat, true);
        if (handValue(seat.hand).total > 21) {
          seat.busted = true;
          break;
        }
        if (handValue(seat.hand).total < 17) await this.waitForThink("player");
      }
      seat.stood = true;
      await this.waitForSpeed();
    }
  }

  private clockwisePlayerSeats(): Seat[] {
    return [...this.seats].reverse();
  }

  private async playDealer(): Promise<void> {
    this.phase = "dealer";
    await this.waitForThink("dealer");
    await this.revealDealerHole();
    while (this.dealerShouldHit()) {
      await this.waitForThink("dealer");
      await this.dealTo(this.dealer, true);
    }
  }

  private dealerShouldHit(): boolean {
    const value = handValue(this.dealer.hand);
    if (value.total < 17) return true;
    return value.total === 17 && value.soft && this.settings.dealerHitsSoft17;
  }

  private async dealTo(seat: Seat, visible: boolean): Promise<void> {
    await this.waitIfPaused();
    const card = this.shoe!.cards.shift();
    if (!card) {
      this.pendingShuffle = true;
      return;
    }
    this.shoe!.cardsDealt += 1;
    if (this.shoe!.cardsDealt >= this.shoe!.cutCardIndex) {
      this.shoe!.cutReached = true;
      if (this.settings.shuffleImmediately) this.pendingShuffle = true;
    }
    card.visible = visible;
    seat.hand.push(card);
    if (visible) this.countCard(card, seat, false);
    this.emit();
    await this.maybePrompt(false);
    await this.waitForSpeed();
  }

  private async revealDealerHole(): Promise<void> {
    await this.waitIfPaused();
    const hole = this.dealer.hand.find(card => !card.visible);
    if (!hole) return;
    hole.visible = true;
    this.countCard(hole, this.dealer, true);
    this.emit();
    await this.maybePrompt(false);
    await this.waitForSpeed();
  }

  private countCard(card: GameCard, seat: Seat, dealerHoleReveal: boolean): void {
    if (!card.visible || card.counted) return;
    card.counted = true;
    const hiLo = getHiLoValue(card);
    this.runningCount += hiLo;
    this.visibleOrder += 1;
    const observedAt = Date.now();
    card.analytics = {
      visibleOrder: this.visibleOrder,
      hiLoValue: hiLo,
      runningCountAfter: this.runningCount,
      seatRole: seat?.role || "unknown",
      seatName: seat?.name || "Unknown",
      dealerHoleReveal,
      observedAt,
      msSincePreviousVisibleCard: this.lastVisibleCardAt
        ? observedAt - this.lastVisibleCardAt
        : null,
      ...this.speedSnapshot()
    };
    this.lastVisibleCardAt = observedAt;
    this.visibleCardsSinceLastCheck.push(card);
    this.visibleCardsSincePrompt += 1;
    this.handVisibleCards += 1;
    this.recordCard(card, seat, dealerHoleReveal);
  }

  private async maybePrompt(force: boolean): Promise<void> {
    if (this.phase === "ready" || this.paused || this.pendingCountCheck) return;
    if (this.settings.countCheckMode === "manual") return;
    if (force) {
      await this.openAutomaticCountCheck("cutCard");
      return;
    }
    if (
      this.settings.countCheckMode === "everyNCards" &&
      this.visibleCardsSincePrompt >= this.settings.countCheckCardInterval
    ) {
      await this.openAutomaticCountCheck("everyNCards");
    }
    if (
      this.settings.countCheckMode === "random" &&
      this.visibleCardsSincePrompt >= this.nextRandomPromptAt
    ) {
      await this.openAutomaticCountCheck("random");
    }
  }

  private async openAutomaticCountCheck(source: string): Promise<void> {
    await this.waitForCountPrompt();
    if (this.paused || this.pendingCountCheck) return;
    await this.openCountCheck(source);
  }

  private waitForCountPrompt(): Promise<void> {
    if (this.settings.dealerSpeed === ("manual" as AppSettings["dealerSpeed"]))
      return Promise.resolve();
    return this.pauseAwareDelay(this.settings.countPromptDelayMs);
  }

  openCountCheck(source = "manual"): Promise<void> {
    return new Promise(resolve => {
      if (this.pendingCountCheck) {
        resolve();
        return;
      }
      this.paused = true;
      this.countPromptSource = source;
      this.pendingCountCheck = {
        source,
        correctCount: this.runningCount,
        previousCount: this.lastCheckCount,
        delta: this.runningCount - this.lastCheckCount,
        cards: [...this.visibleCardsSinceLastCheck],
        promptOpenedAt: Date.now()
      };
      this.countPromptResolve = resolve;
      this.emit();
    });
  }

  /** Records the answer and returns feedback; counters reset here (matches legacy). */
  submitCountCheck(answer: number): CountCheckResult {
    const pc = this.pendingCountCheck!;
    const correct = answer === pc.correctCount;
    const cardsSincePreviousCheck = pc.cards.length;
    if (cardsSincePreviousCheck > 0) {
      const responseTimeMs = Date.now() - pc.promptOpenedAt;
      const signedError = answer - pc.correctCount;
      trackCountCheck({
        handNumber: this.handNumber,
        promptSource: this.countPromptSource,
        correctRunningCount: pc.correctCount,
        userAnswer: answer,
        signedError,
        absoluteError: Math.abs(signedError),
        correct,
        responseTimeMs,
        cardsSincePreviousCheck,
        previousCount: pc.previousCount,
        netCountDelta: pc.delta,
        shoeDepthPercent: this.shoeDepthPercent(),
        decksRemaining: this.decksRemaining(),
        countCheckMode: this.settings.countCheckMode,
        dealerSpeed: this.settings.dealerSpeed,
        numberOfOtherPlayers: this.settings.numberOfOtherPlayers,
        shoeDisplayMode: this.settings.shoeDisplayMode,
        cards: pc.cards.map(card => ({
          visibleOrder: card.analytics?.visibleOrder ?? 0,
          rank: card.rank,
          suit: card.suit,
          hiLoValue: card.analytics?.hiLoValue ?? getHiLoValue(card),
          runningCountAfter: card.analytics?.runningCountAfter,
          seatRole: card.analytics?.seatRole || "unknown",
          seatName: card.analytics?.seatName || "Unknown",
          dealerHoleReveal: Boolean(card.analytics?.dealerHoleReveal),
          numberOfOtherPlayers: card.analytics?.numberOfOtherPlayers,
          shoeDisplayMode: card.analytics?.shoeDisplayMode,
          dealerSpeed: card.analytics?.dealerSpeed,
          dealDelayMs: card.analytics?.dealDelayMs,
          playerThinkDelayMs: card.analytics?.playerThinkDelayMs,
          dealerThinkDelayMs: card.analytics?.dealerThinkDelayMs,
          countPromptDelayMs: card.analytics?.countPromptDelayMs,
          msSincePreviousVisibleCard: card.analytics?.msSincePreviousVisibleCard ?? undefined
        }))
      });
    }
    const result: CountCheckResult = {
      correct,
      correctCount: pc.correctCount,
      previousCount: pc.previousCount,
      delta: pc.delta,
      cards: pc.cards
    };
    this.lastCheckCount = this.runningCount;
    this.visibleCardsSinceLastCheck = [];
    this.visibleCardsSincePrompt = 0;
    this.nextRandomPromptAt = this.randomPromptDistance();
    return result;
  }

  closeCountCheck(): void {
    this.pendingCountCheck = null;
    this.paused = false;
    this.resumePausedWaits();
    if (this.countPromptResolve) {
      const resolve = this.countPromptResolve;
      this.countPromptResolve = null;
      resolve();
    }
    this.emit();
  }

  togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.setStatus("Paused. Press Resume to continue.");
    } else {
      this.setStatus("Resumed.");
      this.resumePausedWaits();
    }
    this.emit();
  }

  manualStep(): void {
    if (this.manualStepResolve && !this.paused) {
      const resolve = this.manualStepResolve;
      this.manualStepResolve = null;
      resolve();
    }
  }

  // --- Resolution helpers ---------------------------------------------------

  private markNaturals(): void {
    for (const seat of [...this.seats, this.dealer]) seat.blackjack = isBlackjack(seat.hand);
  }

  private dealerHasBlackjackPeek(): boolean {
    const upcard = this.dealer.hand[0];
    if (!upcard) return false;
    return (
      ["A", "10", "J", "Q", "K"].includes(upcard.rank) &&
      isBlackjack(this.dealer.hand.map(card => ({ ...card, visible: true })))
    );
  }

  private resolveSummary(): string {
    const dealerTotal = handValue(this.dealer.hand).total;
    if (dealerTotal > 21) return "Dealer busts. Round complete.";
    return `Dealer stands on ${dealerTotal}. Round complete.`;
  }

  private moveHandsToDiscard(): void {
    for (const seat of [...this.seats, this.dealer]) this.shoe!.discardPile.push(...seat.hand);
  }

  // --- Timing ---------------------------------------------------------------

  private waitForSpeed(): Promise<void> {
    if (this.settings.dealerSpeed === ("manual" as AppSettings["dealerSpeed"]))
      return this.waitForManualStep();
    return this.pauseAwareDelay(this.settings.dealDelayMs);
  }

  private waitForThink(actor: "dealer" | "player"): Promise<void> {
    if (this.settings.dealerSpeed === ("manual" as AppSettings["dealerSpeed"]))
      return this.waitForManualStep();
    const ms =
      actor === "dealer" ? this.settings.dealerThinkDelayMs : this.settings.playerThinkDelayMs;
    return this.pauseAwareDelay(ms);
  }

  private waitForManualStep(): Promise<void> {
    this.setStatus("Manual step: tap Next hand for next action.");
    this.emit();
    return new Promise(resolve => {
      this.manualStepResolve = resolve;
    });
  }

  private async pauseAwareDelay(ms: number): Promise<void> {
    let remaining = Math.max(0, Number(ms) || 0);
    while (remaining > 0) {
      await this.waitIfPaused();
      const slice = Math.min(remaining, 50);
      const startedAt = Date.now();
      await delay(slice);
      remaining -= Date.now() - startedAt;
    }
    await this.waitIfPaused();
  }

  private waitIfPaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise(resolve => {
      this.pauseResolvers.push(resolve);
    });
  }

  private resumePausedWaits(): void {
    const resolvers = this.pauseResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }

  private randomPromptDistance(): number {
    const base = Math.max(4, this.settings.countCheckCardInterval || 10);
    return Math.floor(base * 0.7 + Math.random() * base);
  }

  private speedSnapshot() {
    return {
      numberOfOtherPlayers: this.settings.numberOfOtherPlayers,
      shoeDisplayMode: this.settings.shoeDisplayMode,
      dealerSpeed: this.settings.dealerSpeed,
      dealDelayMs: this.settings.dealDelayMs,
      playerThinkDelayMs: this.settings.playerThinkDelayMs,
      dealerThinkDelayMs: this.settings.dealerThinkDelayMs,
      countPromptDelayMs: this.settings.countPromptDelayMs
    };
  }

  private shoeDepthPercent(): number {
    if (!this.shoe) return 0;
    const total = Math.max(1, this.settings.numberOfDecks * 52);
    return Math.round((this.shoe.cardsDealt / total) * 1000) / 10;
  }

  private decksRemaining(): number {
    if (!this.shoe) return 0;
    return Math.round((this.shoe.cards.length / 52) * 10) / 10;
  }

  // --- Analytics payload builders ------------------------------------------

  private recordCard(card: GameCard, seat: Seat, dealerHoleReveal: boolean): void {
    trackCard({
      handNumber: this.handNumber,
      visibleOrder: card.analytics?.visibleOrder ?? 0,
      rank: card.rank,
      suit: card.suit,
      hiLoValue: card.analytics?.hiLoValue ?? getHiLoValue(card),
      runningCountAfter: card.analytics?.runningCountAfter ?? this.runningCount,
      seatRole: card.analytics?.seatRole || seat?.role || "unknown",
      seatName: card.analytics?.seatName || seat?.name || "Unknown",
      dealerHoleReveal,
      shoeDepthPercent: this.shoeDepthPercent(),
      decksRemaining: this.decksRemaining(),
      numberOfOtherPlayers: card.analytics?.numberOfOtherPlayers,
      shoeDisplayMode: card.analytics?.shoeDisplayMode,
      dealerSpeed: card.analytics?.dealerSpeed,
      dealDelayMs: card.analytics?.dealDelayMs,
      playerThinkDelayMs: card.analytics?.playerThinkDelayMs,
      dealerThinkDelayMs: card.analytics?.dealerThinkDelayMs,
      countPromptDelayMs: card.analytics?.countPromptDelayMs,
      msSincePreviousVisibleCard: card.analytics?.msSincePreviousVisibleCard ?? undefined
    });
  }

  private recordHand(outcome: string): void {
    trackHand({
      handNumber: this.handNumber,
      durationMs: Date.now() - (this.handStartedAt || Date.now()),
      outcome,
      cardsDealt: this.shoe!.cardsDealt - this.handCardsDealtStart,
      visibleCardsCounted: this.handVisibleCards,
      runningCountBefore: this.handRunningCountStart,
      runningCountAfter: this.runningCount,
      shoeDepthPercent: this.shoeDepthPercent(),
      decksRemaining: this.decksRemaining()
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
