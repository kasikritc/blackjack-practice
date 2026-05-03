const suits = ["hearts", "diamonds", "clubs", "spades"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const suitSymbols = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const redSuits = new Set(["hearts", "diamonds"]);
let cardSerial = 0;

const defaultSettings = {
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
  countCheckMode: "random",
  countCheckCardInterval: 10,
  shuffleImmediately: false,
  sideBetsEnabled: false,
  animationsEnabled: true
};

const state = {
  settings: { ...defaultSettings },
  shoe: null,
  seats: [],
  dealer: makeSeat("Dealer", "dealer"),
  runningCount: 0,
  lastCheckCount: 0,
  visibleCardsSinceLastCheck: [],
  visibleCardsSincePrompt: 0,
  nextRandomPromptAt: 9,
  phase: "ready",
  paused: false,
  acting: false,
  pendingShuffle: false,
  countPromptResolve: null,
  pauseResolvers: [],
  renderedCardKeys: new Set(),
  handNumber: 0,
  analytics: {
    sessionId: null,
    trackingEnabled: true,
    serverAvailable: false,
    currentShoeId: null,
    currentHandStartedAt: null,
    currentHandVisibleCards: 0,
    currentHandCardsDealtStart: 0,
    currentHandRunningCountStart: 0,
    visibleOrder: 0,
    lastVisibleCardAt: null,
    sessionPromise: null,
    countPromptOpenedAt: null,
    countPromptSource: "manual",
    dashboardLoaded: false
  }
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  loadSettings();
  bindEvents();
  await initAnalytics();
  startNewShoe();
});

function bindElements() {
  for (const id of [
    "settingsButton", "closeSettingsButton", "settingsPanel", "applySettingsButton",
    "analyticsButton", "closeAnalyticsButton", "analyticsPanel", "trackingStatus", "trackingToggleButton",
    "masteryScore", "masteryLevel", "recentAccuracy", "analyticsMetrics", "trendRange",
    "trendChart", "breakdownGrid", "recentSessions", "refreshAnalyticsButton", "resetAnalyticsButton",
    "newShoeButton", "nextButton", "pauseButton", "manualCheckButton", "dealerSeat",
    "otherPlayers", "shoe", "discard", "status", "payoutLabel", "ruleLabel",
    "countDialog", "countForm", "countSignButton", "countInput", "countFeedback", "submitCountButton",
    "continueButton", "numberOfDecks", "penetrationPercent", "penetrationValue",
    "dealerHitsSoft17", "dealerPeek", "blackjackPayout", "numberOfOtherPlayers",
    "shoeDisplayMode", "dealerSpeed", "dealDelayMs", "dealDelayValue", "playerThinkDelayMs", "playerThinkDelayValue",
    "dealerThinkDelayMs", "dealerThinkDelayValue", "countPromptDelayMs", "countPromptDelayValue",
    "countCheckMode", "countCheckCardInterval", "shuffleImmediately",
    "surrenderAllowed", "doubleAfterSplit", "resplitAces", "hitSplitAces",
    "sideBetsEnabled", "animationsEnabled"
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  els.settingsButton.addEventListener("click", () => toggleSettings(true));
  els.analyticsButton.addEventListener("click", () => toggleAnalytics(true));
  els.closeAnalyticsButton.addEventListener("click", () => toggleAnalytics(false));
  els.trackingToggleButton.addEventListener("click", toggleTracking);
  els.refreshAnalyticsButton.addEventListener("click", loadAnalyticsDashboard);
  els.resetAnalyticsButton.addEventListener("click", resetAnalyticsData);
  els.closeSettingsButton.addEventListener("click", () => toggleSettings(false));
  els.applySettingsButton.addEventListener("click", applySettings);
  els.newShoeButton.addEventListener("click", startNewShoe);
  els.nextButton.addEventListener("click", () => runRound());
  els.pauseButton.addEventListener("click", togglePause);
  els.manualCheckButton.addEventListener("click", () => openCountCheck());
  els.countSignButton.addEventListener("click", toggleCountSign);
  els.countForm.addEventListener("submit", submitCountAnswer);
  els.continueButton.addEventListener("click", closeCountCheck);
  window.addEventListener("keydown", handleKeyboardShortcut, true);
  els.penetrationPercent.addEventListener("input", () => {
    els.penetrationValue.textContent = `${els.penetrationPercent.value}%`;
  });
  els.dealDelayMs.addEventListener("input", () => {
    els.dealDelayValue.textContent = `${els.dealDelayMs.value} ms`;
    applySpeedSettingsFromForm();
  });
  els.playerThinkDelayMs.addEventListener("input", () => {
    els.playerThinkDelayValue.textContent = `${els.playerThinkDelayMs.value} ms`;
    applySpeedSettingsFromForm();
  });
  els.dealerThinkDelayMs.addEventListener("input", () => {
    els.dealerThinkDelayValue.textContent = `${els.dealerThinkDelayMs.value} ms`;
    applySpeedSettingsFromForm();
  });
  els.countPromptDelayMs.addEventListener("input", () => {
    els.countPromptDelayValue.textContent = `${els.countPromptDelayMs.value} ms`;
    applySpeedSettingsFromForm();
  });
  els.shoeDisplayMode.addEventListener("change", applyShoeDisplayModeFromForm);
  els.dealerSpeed.addEventListener("change", handleSpeedPresetChange);
  els.trendRange.addEventListener("change", loadAnalyticsDashboard);
}

function handleKeyboardShortcut(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

  const key = event.key.toLowerCase();
  const target = event.target;
  const isTyping = isTextEntryTarget(target);

  if (els.countDialog.open) {
    if (key === "s") {
      event.preventDefault();
      toggleCountSign();
      return;
    }
    if ((key === "c" || key === "enter") && !els.continueButton.hidden) {
      event.preventDefault();
      closeCountCheck();
    }
    return;
  }

  if (els.settingsPanel.classList.contains("open")) {
    if (key === "escape") {
      event.preventDefault();
      toggleSettings(false);
      return;
    }
    if (key === "a" && !isTyping) {
      event.preventDefault();
      applySettings();
    }
    return;
  }

  if (els.analyticsPanel.classList.contains("open")) {
    if (key === "escape") {
      event.preventDefault();
      toggleAnalytics(false);
    }
    return;
  }

  if (isTyping) return;

  if (key === "n" || key === "enter") {
    event.preventDefault();
    if (state.acting && !els.nextButton.disabled) els.nextButton.click();
    else runRound();
  } else if (key === "w") {
    event.preventDefault();
    startNewShoe();
  } else if (key === "p" || key === " ") {
    event.preventDefault();
    togglePause();
  } else if (key === "c") {
    event.preventDefault();
    openCountCheck();
  } else if (key === "s") {
    event.preventDefault();
    toggleSettings(true);
  }
}

function isTextEntryTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function makeSeat(name, role) {
  return { name, role, hand: [], stood: false, busted: false, blackjack: false };
}

function makeShoe(deckCount, penetrationPercent) {
  const cards = [];
  cardSerial = 0;
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const suit of suits) {
      for (const rank of ranks) {
        cardSerial += 1;
        cards.push({ rank, suit, id: `${deck}-${suit}-${rank}-${cardSerial}`, visible: false, counted: false });
      }
    }
  }
  shuffle(cards);
  const cutCardIndex = Math.floor(cards.length * (penetrationPercent / 100));
  return { cards, discardPile: [], cutCardIndex, cardsDealt: 0, cutReached: false };
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

function startNewShoe() {
  analyticsEndShoe();
  resumePausedWaits();
  state.paused = false;
  state.shoe = makeShoe(state.settings.numberOfDecks, state.settings.penetrationPercent);
  state.runningCount = 0;
  state.lastCheckCount = 0;
  state.visibleCardsSinceLastCheck = [];
  state.visibleCardsSincePrompt = 0;
  state.nextRandomPromptAt = randomPromptDistance();
  state.pendingShuffle = false;
  state.renderedCardKeys = new Set();
  state.phase = "ready";
  state.handNumber = 0;
  clearTable();
  els.pauseButton.querySelector("span").textContent = "Pause";
  setStatus(`New ${state.settings.numberOfDecks}-deck shoe shuffled. Cut card at ${state.settings.penetrationPercent}%.`);
  render();
  analyticsStartShoe();
}

function clearTable() {
  state.dealer = makeSeat("Dealer", "dealer");
  state.seats = [];
  const leftSeatCount = Math.floor(state.settings.numberOfOtherPlayers / 2);
  for (let i = 0; i < leftSeatCount; i += 1) {
    state.seats.push(makeSeat(`Seat ${i + 1}`, "other"));
  }
  state.seats.push(makeSeat("You", "player"));
  for (let i = leftSeatCount; i < state.settings.numberOfOtherPlayers; i += 1) {
    state.seats.push(makeSeat(`Seat ${i + 1}`, "other"));
  }
}

async function runRound() {
  if (state.acting || state.paused) return;
  if (!state.shoe) startNewShoe();
  if (state.pendingShuffle) {
    startNewShoe();
    return;
  }
  state.acting = true;
  setControls(false);
  clearTable();
  state.handNumber += 1;
  state.analytics.currentHandStartedAt = Date.now();
  state.analytics.currentHandVisibleCards = 0;
  state.analytics.currentHandCardsDealtStart = state.shoe.cardsDealt;
  state.analytics.currentHandRunningCountStart = state.runningCount;
  state.phase = "dealing";
  setStatus(`Hand ${state.handNumber}: dealing.`);
  render();
  let handOutcome = "Round complete";

  try {
    await dealInitialCards();
    markNaturals();
    if (state.settings.dealerPeek && dealerHasBlackjackPeek()) {
      await revealDealerHole();
      handOutcome = "Dealer blackjack";
      setStatus("Dealer blackjack. Round ends.");
    } else {
      await playPlayers();
      await playDealer();
      handOutcome = resolveSummary();
      setStatus(handOutcome);
    }

    moveHandsToDiscard();
    analyticsRecordHand(handOutcome);
    if (state.shoe.cutReached) {
      state.pendingShuffle = true;
      setStatus("Cut card reached. Shuffling after this round.");
      if (state.settings.countCheckMode === "random" || state.settings.countCheckMode === "everyRound") {
        await maybePrompt(true);
      }
    } else if (state.settings.countCheckMode === "everyRound") {
      await openCountCheck("everyRound");
    }
  } catch (error) {
    console.error(error);
    setStatus("Dealing stopped. Tap New shoe to reset.");
  }

  state.phase = "roundEnd";
  state.acting = false;
  setControls(true);
  render();
}

async function dealInitialCards() {
  for (const seat of state.seats) await dealTo(seat, true);
  await dealTo(state.dealer, true);
  for (const seat of state.seats) await dealTo(seat, true);
  await dealTo(state.dealer, false);
}

async function playPlayers() {
  state.phase = "players";
  for (const seat of state.seats) {
    setStatus(`${seat.name} playing.`);
    await waitForThink(seat.role === "dealer" ? "dealer" : "player");
    while (handValue(seat.hand).total < 17 && !isBlackjack(seat.hand)) {
      await dealTo(seat, true);
      if (handValue(seat.hand).total > 21) {
        seat.busted = true;
        break;
      }
      if (handValue(seat.hand).total < 17) await waitForThink("player");
    }
    seat.stood = true;
    await waitForSpeed();
  }
}

async function playDealer() {
  state.phase = "dealer";
  await waitForThink("dealer");
  await revealDealerHole();
  while (dealerShouldHit()) {
    await waitForThink("dealer");
    await dealTo(state.dealer, true);
  }
}

function dealerShouldHit() {
  const value = handValue(state.dealer.hand);
  if (value.total < 17) return true;
  return value.total === 17 && value.soft && state.settings.dealerHitsSoft17;
}

async function dealTo(seat, visible) {
  await waitIfPaused();
  const card = state.shoe.cards.shift();
  if (!card) {
    state.pendingShuffle = true;
    return;
  }
  state.shoe.cardsDealt += 1;
  if (state.shoe.cardsDealt >= state.shoe.cutCardIndex) {
    state.shoe.cutReached = true;
    if (state.settings.shuffleImmediately) state.pendingShuffle = true;
  }
  card.visible = visible;
  seat.hand.push(card);
  if (visible) countCard(card, seat, false);
  render();
  await maybePrompt(false);
  await waitForSpeed();
}

async function revealDealerHole() {
  await waitIfPaused();
  const hole = state.dealer.hand.find(card => !card.visible);
  if (!hole) return;
  hole.visible = true;
  countCard(hole, state.dealer, true);
  render();
  await maybePrompt(false);
  await waitForSpeed();
}

function countCard(card, seat, dealerHoleReveal) {
  if (!card.visible || card.counted) return;
  card.counted = true;
  state.runningCount += getHiLoValue(card);
  state.analytics.visibleOrder += 1;
  const observedAt = Date.now();
  card.analytics = {
    visibleOrder: state.analytics.visibleOrder,
    hiLoValue: getHiLoValue(card),
    runningCountAfter: state.runningCount,
    seatRole: seat?.role || "unknown",
    seatName: seat?.name || "Unknown",
    dealerHoleReveal: Boolean(dealerHoleReveal),
    observedAt,
    msSincePreviousVisibleCard: state.analytics.lastVisibleCardAt ? observedAt - state.analytics.lastVisibleCardAt : null,
    ...currentSpeedSnapshot()
  };
  state.analytics.lastVisibleCardAt = observedAt;
  state.visibleCardsSinceLastCheck.push(card);
  state.visibleCardsSincePrompt += 1;
  state.analytics.currentHandVisibleCards += 1;
  analyticsRecordCard(card, seat, dealerHoleReveal);
}

function getHiLoValue(card) {
  if (["2", "3", "4", "5", "6"].includes(card.rank)) return 1;
  if (["7", "8", "9"].includes(card.rank)) return 0;
  return -1;
}

async function maybePrompt(force) {
  if (state.phase === "ready" || state.paused || els.countDialog.open) return;
  if (state.settings.countCheckMode === "manual") return;
  if (force) {
    await openAutomaticCountCheck("cutCard");
    return;
  }
  if (state.settings.countCheckMode === "everyNCards" && state.visibleCardsSincePrompt >= state.settings.countCheckCardInterval) {
    await openAutomaticCountCheck("everyNCards");
  }
  if (state.settings.countCheckMode === "random" && state.visibleCardsSincePrompt >= state.nextRandomPromptAt) {
    await openAutomaticCountCheck("random");
  }
}

async function openAutomaticCountCheck(source) {
  await waitForCountPrompt();
  if (state.paused || els.countDialog.open) return;
  await openCountCheck(source);
}

function waitForCountPrompt() {
  if (state.settings.dealerSpeed === "manual") return Promise.resolve();
  return pauseAwareDelay(state.settings.countPromptDelayMs);
}

function openCountCheck(source = "manual") {
  return new Promise(resolve => {
    if (els.countDialog.open) {
      resolve();
      return;
    }
    state.paused = true;
    state.analytics.countPromptOpenedAt = Date.now();
    state.analytics.countPromptSource = source;
    els.countSignButton.dataset.sign = "1";
    els.countSignButton.firstChild.textContent = "+";
    els.countInput.value = "";
    els.countFeedback.hidden = true;
    els.countFeedback.className = "feedback";
    els.submitCountButton.hidden = false;
    els.continueButton.hidden = true;
    els.countDialog.dataset.resolve = "pending";
    state.countPromptResolve = resolve;
    els.countDialog.showModal();
    setTimeout(() => els.countInput.focus(), 50);
    els.continueButton.onclick = () => {
      closeCountCheck();
    };
  });
}

function submitCountAnswer(event) {
  event.preventDefault();
  const digits = els.countInput.value.replace(/\D/g, "");
  if (!digits) return;
  const sign = els.countSignButton.dataset.sign === "-1" ? -1 : 1;
  const answer = sign * Number.parseInt(digits, 10);
  const correct = answer === state.runningCount;
  const delta = state.runningCount - state.lastCheckCount;
  const previousCount = state.lastCheckCount;
  const cards = state.visibleCardsSinceLastCheck;
  analyticsRecordCountCheck({
    answer,
    correct,
    delta,
    previousCount,
    cardsSincePreviousCheck: cards.length
  });
  const cardRows = cards.length
    ? cards.map(card => `
        <span class="count-card">
          <span>${cardLabel(card)}</span>
          <strong>${signed(getHiLoValue(card))}</strong>
        </span>
      `).join("")
    : `<span class="count-card empty">No newly visible cards <strong>0</strong></span>`;
  els.countFeedback.hidden = false;
  els.countFeedback.className = `feedback ${correct ? "correct" : "incorrect"}`;
  els.countFeedback.innerHTML = `
    <section class="feedback-section result-section">
      <strong>${correct ? "Correct" : "Incorrect"}</strong>
      <span>Correct ${signed(state.runningCount)}</span>
    </section>
    <section class="feedback-section equation-section">
      <span class="equation-label is-secondary">Previous count</span>
      <strong class="equation-value is-secondary">${signed(previousCount)}</strong>
      <span class="equation-label is-secondary">Net change</span>
      <strong class="equation-value is-secondary">${signed(delta)}</strong>
      <span class="equation-label is-primary">Running count</span>
      <strong class="equation-value is-primary">${signed(state.runningCount)}</strong>
    </section>
    <section class="feedback-section">
      <h3>Visible Cards Since Last Check</h3>
      <div class="count-card-grid">${cardRows}</div>
    </section>
  `;
  els.submitCountButton.hidden = true;
  els.continueButton.hidden = false;
  state.lastCheckCount = state.runningCount;
  state.visibleCardsSinceLastCheck = [];
  state.visibleCardsSincePrompt = 0;
  state.nextRandomPromptAt = randomPromptDistance();
}

function toggleCountSign() {
  const nextSign = els.countSignButton.dataset.sign === "-1" ? "1" : "-1";
  els.countSignButton.dataset.sign = nextSign;
  els.countSignButton.firstChild.textContent = nextSign === "-1" ? "−" : "+";
  els.countInput.focus();
}

function closeCountCheck() {
  if (els.countDialog.open) els.countDialog.close();
  state.paused = false;
  els.pauseButton.querySelector("span").textContent = "Pause";
  resumePausedWaits();
  if (state.countPromptResolve) {
    const resolve = state.countPromptResolve;
    state.countPromptResolve = null;
    resolve();
  }
  render();
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (!card.visible && state.phase !== "roundEnd") continue;
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

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand).total === 21;
}

function markNaturals() {
  for (const seat of [...state.seats, state.dealer]) {
    seat.blackjack = isBlackjack(seat.hand);
  }
}

function dealerHasBlackjackPeek() {
  const upcard = state.dealer.hand[0];
  if (!upcard) return false;
  return ["A", "10", "J", "Q", "K"].includes(upcard.rank) && isBlackjack([...state.dealer.hand].map(card => ({ ...card, visible: true })));
}

function resolveSummary() {
  const dealerTotal = handValue(state.dealer.hand).total;
  if (dealerTotal > 21) return "Dealer busts. Round complete.";
  return `Dealer stands on ${dealerTotal}. Round complete.`;
}

function moveHandsToDiscard() {
  for (const seat of [...state.seats, state.dealer]) {
    state.shoe.discardPile.push(...seat.hand);
  }
}

function render() {
  const cardKeysInThisRender = new Set();
  document.body.classList.toggle("no-animation", !state.settings.animationsEnabled);
  els.payoutLabel.textContent = state.settings.blackjackPayout;
  els.ruleLabel.textContent = state.settings.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands soft 17";
  renderShoeBoxes();
  renderSeat(els.dealerSeat, state.dealer);
  els.otherPlayers.innerHTML = "";
  for (const [index, seat] of state.seats.entries()) {
    const position = getPlayerSeatPosition(index, state.seats.length);
    const node = document.createElement("div");
    node.className = `seat table-seat${seat.role === "player" ? " is-you" : ""}`;
    node.style.setProperty("--seat-x", `${position.x}%`);
    node.style.setProperty("--seat-y", `${position.y}%`);
    renderSeat(node, seat);
    els.otherPlayers.appendChild(node);
  }
  for (const key of cardKeysInThisRender) {
    state.renderedCardKeys.add(key);
  }

  function renderSeat(container, seat) {
    container.innerHTML = `
      <div class="seat-label"><span>${seat.name}</span></div>
      <div class="hand">${seat.hand.map(renderCard).join("")}</div>
    `;
  }

  function renderCard(card) {
    const visualKey = `${card.id}:${card.visible ? "face" : "back"}`;
    const isNew = !state.renderedCardKeys.has(visualKey);
    cardKeysInThisRender.add(visualKey);
    const newClass = isNew ? " is-new" : "";

    if (!card.visible) return `<div class="card back${newClass}" aria-label="Face-down card"></div>`;
    const red = redSuits.has(card.suit) ? " red" : "";
    const symbol = suitSymbols[card.suit];
    return `
      <div class="card${red}${newClass}" aria-label="${card.rank} of ${card.suit}">
        <span class="rank corner"><span>${card.rank}</span><span>${symbol}</span></span>
        <span class="pip">${symbol}</span>
        <span class="rank bottom-rank corner"><span>${card.rank}</span><span>${symbol}</span></span>
      </div>
    `;
  }
}

function getPlayerSeatPosition(index, count) {
  if (count <= 1) return { x: 50, y: 82 };
  const positions = {
    2: [{ x: 32, y: 84 }, { x: 68, y: 84 }],
    3: [{ x: 18, y: 64 }, { x: 50, y: 90 }, { x: 82, y: 64 }],
    4: [{ x: 9, y: 48 }, { x: 34, y: 84 }, { x: 66, y: 84 }, { x: 91, y: 48 }],
    5: [{ x: 7, y: 38 }, { x: 25, y: 72 }, { x: 50, y: 92 }, { x: 75, y: 72 }, { x: 93, y: 38 }],
    6: [{ x: 6, y: 32 }, { x: 20, y: 58 }, { x: 39, y: 88 }, { x: 61, y: 88 }, { x: 80, y: 58 }, { x: 94, y: 32 }],
    7: [{ x: 5, y: 28 }, { x: 16, y: 51 }, { x: 31, y: 78 }, { x: 50, y: 94 }, { x: 69, y: 78 }, { x: 84, y: 51 }, { x: 95, y: 28 }]
  };
  return positions[count]?.[index] ?? { x: 50, y: 70 };
}

function renderShoeBoxes() {
  const totalCards = Math.max(1, state.settings.numberOfDecks * 52);
  const shoeCards = state.shoe?.cards.length ?? 0;
  const discardCards = state.shoe?.discardPile.length ?? 0;
  const mode = state.settings.shoeDisplayMode;

  if (mode === "hidden") {
    els.shoe.innerHTML = `<strong>Shoe</strong>`;
    els.discard.innerHTML = `<strong>Discard</strong>`;
    return;
  }

  if (mode === "graphic") {
    els.shoe.innerHTML = renderTrayGraphic("Shoe", shoeCards / totalCards, "shoe");
    els.discard.innerHTML = renderTrayGraphic("Discard", discardCards / totalCards, "discard");
    return;
  }

  if (mode === "numbers") {
    els.shoe.innerHTML = `<strong>Shoe</strong><span>${shoeCards} cards</span><span>${state.shoe?.cutReached ? "Cut reached" : "Cut live"}</span>`;
    els.discard.innerHTML = `<strong>Discard</strong><span>${discardCards} cards</span>`;
    return;
  }

  els.shoe.innerHTML = `<strong>Shoe</strong><span>${formatDecksLeft(shoeCards)} decks left</span><span>${state.shoe?.cutReached ? "Cut reached" : "Cut live"}</span>`;
  els.discard.innerHTML = `<strong>Discard</strong><span>${formatDecksLeft(discardCards)} decks</span>`;
}

function formatDecksLeft(cardCount) {
  return (Math.round((cardCount / 52) * 10) / 10).toFixed(1);
}

function renderTrayGraphic(label, fillRatio, kind) {
  const fillPercent = Math.max(0, Math.min(100, Math.round(fillRatio * 100)));
  return `
    <strong>${label}</strong>
    <div class="tray-graphic ${kind}" aria-label="${label} card stack">
      <span class="tray-stack" style="--fill:${fillPercent}%"></span>
    </div>
  `;
}

function applySettings() {
  state.settings = {
    numberOfDecks: Number(els.numberOfDecks.value),
    penetrationPercent: Number(els.penetrationPercent.value),
    dealerHitsSoft17: els.dealerHitsSoft17.value === "true",
    dealerPeek: els.dealerPeek.value === "true",
    blackjackPayout: els.blackjackPayout.value,
    surrenderAllowed: els.surrenderAllowed.checked,
    doubleAfterSplit: els.doubleAfterSplit.checked,
    resplitAces: els.resplitAces.checked,
    hitSplitAces: els.hitSplitAces.checked,
    maxSplitHands: 4,
    numberOfOtherPlayers: Number(els.numberOfOtherPlayers.value),
    shoeDisplayMode: els.shoeDisplayMode.value,
    dealerSpeed: els.dealerSpeed.value,
    dealDelayMs: Number(els.dealDelayMs.value),
    playerThinkDelayMs: Number(els.playerThinkDelayMs.value),
    dealerThinkDelayMs: Number(els.dealerThinkDelayMs.value),
    countPromptDelayMs: Number(els.countPromptDelayMs.value),
    countCheckMode: els.countCheckMode.value,
    countCheckCardInterval: Number(els.countCheckCardInterval.value),
    shuffleImmediately: els.shuffleImmediately.value === "true",
    sideBetsEnabled: els.sideBetsEnabled.checked,
    animationsEnabled: els.animationsEnabled.checked
  };
  saveSettings();
  toggleSettings(false);
  startNewShoe();
}

function loadSettings() {
  const saved = localStorage.getItem("blackjack-count-settings");
  if (saved) {
    try {
      state.settings = { ...defaultSettings, ...JSON.parse(saved) };
    } catch {
      state.settings = { ...defaultSettings };
    }
  }
  syncSettingsForm();
}

function syncSettingsForm() {
  for (const [key, value] of Object.entries(state.settings)) {
    if (!els[key]) continue;
    if (els[key].type === "checkbox") els[key].checked = Boolean(value);
    else els[key].value = String(value);
  }
  els.penetrationValue.textContent = `${state.settings.penetrationPercent}%`;
  els.dealDelayValue.textContent = `${state.settings.dealDelayMs} ms`;
  els.playerThinkDelayValue.textContent = `${state.settings.playerThinkDelayMs} ms`;
  els.dealerThinkDelayValue.textContent = `${state.settings.dealerThinkDelayMs} ms`;
  els.countPromptDelayValue.textContent = `${state.settings.countPromptDelayMs} ms`;
}

function toggleSettings(open) {
  els.settingsPanel.hidden = false;
  els.settingsPanel.classList.toggle("open", open);
  els.settingsPanel.setAttribute("aria-hidden", String(!open));
  if (!open) setTimeout(() => {
    if (!els.settingsPanel.classList.contains("open")) els.settingsPanel.hidden = true;
  }, 180);
}

function toggleAnalytics(open) {
  els.analyticsPanel.hidden = false;
  els.analyticsPanel.classList.toggle("open", open);
  els.analyticsPanel.setAttribute("aria-hidden", String(!open));
  if (open) loadAnalyticsDashboard();
  else setTimeout(() => {
    if (!els.analyticsPanel.classList.contains("open")) els.analyticsPanel.hidden = true;
  }, 180);
}

async function initAnalytics() {
  updateTrackingUi();
  try {
    await apiRequest("/api/analytics/summary");
    state.analytics.serverAvailable = true;
  } catch (error) {
    console.warn("Analytics unavailable", error);
    state.analytics.serverAvailable = false;
    state.analytics.trackingEnabled = false;
  }
  updateTrackingUi();
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function analyticsShouldTrack() {
  return state.analytics.serverAvailable && state.analytics.trackingEnabled;
}

function updateTrackingUi() {
  const available = state.analytics.serverAvailable || state.analytics.sessionId;
  els.trackingToggleButton.disabled = !available;
  els.trackingToggleButton.querySelector("span").textContent = state.analytics.trackingEnabled ? "Tracking On" : "Tracking Off";
  els.trackingToggleButton.classList.toggle("is-off", !state.analytics.trackingEnabled);
  if (!available) {
    els.trackingStatus.textContent = "Tracking unavailable until the local API starts.";
  } else if (state.analytics.trackingEnabled && state.analytics.sessionId) {
    els.trackingStatus.textContent = `Tracking session #${state.analytics.sessionId}`;
  } else if (state.analytics.trackingEnabled) {
    els.trackingStatus.textContent = "Tracking ready. Session starts on first visible card.";
  } else {
    els.trackingStatus.textContent = "Tracking paused. Practice continues without new data.";
  }
}

async function toggleTracking() {
  if (!state.analytics.serverAvailable) return;
  state.analytics.trackingEnabled = !state.analytics.trackingEnabled;
  updateTrackingUi();
  if (!state.analytics.sessionId) return;
  try {
    await apiRequest(`/api/sessions/${state.analytics.sessionId}`, {
      method: "PATCH",
      body: { trackingEnabled: state.analytics.trackingEnabled }
    });
  } catch (error) {
    console.warn("Could not update tracking state", error);
    state.analytics.trackingEnabled = !state.analytics.trackingEnabled;
    updateTrackingUi();
  }
}

function analyticsStartShoe() {
  state.analytics.currentShoeId = null;
  state.analytics.visibleOrder = 0;
  state.analytics.lastVisibleCardAt = null;
  state.analytics.shoePromise = null;
}

async function ensureAnalyticsSession() {
  if (!analyticsShouldTrack()) return null;
  if (state.analytics.sessionId) return state.analytics.sessionId;
  if (state.analytics.sessionPromise) return state.analytics.sessionPromise;
  state.analytics.sessionPromise = apiRequest("/api/sessions", {
    method: "POST",
    body: {
      appVersion: "0.1.0",
      userAgent: navigator.userAgent,
      settings: state.settings
    }
  }).then(data => {
    state.analytics.sessionId = data.id;
    state.analytics.trackingEnabled = data.trackingEnabled !== false;
    updateTrackingUi();
    return data.id;
  }).catch(error => {
    console.warn("Could not start analytics session", error);
    state.analytics.sessionPromise = null;
    return null;
  });
  return state.analytics.sessionPromise;
}

async function ensureAnalyticsShoe() {
  if (!analyticsShouldTrack()) return null;
  if (state.analytics.currentShoeId) return state.analytics.currentShoeId;
  if (state.analytics.shoePromise) return state.analytics.shoePromise;
  const sessionId = await ensureAnalyticsSession();
  if (!sessionId) return null;
  state.analytics.shoePromise = apiRequest("/api/events/shoe-started", {
    method: "POST",
    body: {
      sessionId,
      settings: state.settings
    }
  }).then(data => {
    state.analytics.currentShoeId = data.id;
    return data.id;
  }).catch(error => {
    console.warn("Could not record shoe start", error);
    return null;
  });
  return state.analytics.shoePromise;
}

function analyticsEndShoe() {
  if (!analyticsShouldTrack() || !state.analytics.sessionId || !state.analytics.currentShoeId || !state.shoe) return;
  apiRequest("/api/events/shoe-ended", {
    method: "PATCH",
    body: {
      shoeId: state.analytics.currentShoeId,
      cardsDealt: state.shoe.cardsDealt,
      cutCardReached: state.shoe.cutReached,
      finalRunningCount: state.runningCount
    }
  }).catch(error => console.warn("Could not record shoe end", error));
}

function analyticsRecordCard(card, seat, dealerHoleReveal) {
  if (!analyticsShouldTrack()) return;
  const payload = {
    handNumber: state.handNumber,
    visibleOrder: card.analytics?.visibleOrder,
    rank: card.rank,
    suit: card.suit,
    hiLoValue: card.analytics?.hiLoValue ?? getHiLoValue(card),
    runningCountAfter: card.analytics?.runningCountAfter ?? state.runningCount,
    seatRole: card.analytics?.seatRole || seat?.role || "unknown",
    seatName: card.analytics?.seatName || seat?.name || "Unknown",
    dealerHoleReveal,
    shoeDepthPercent: shoeDepthPercent(),
    decksRemaining: decksRemaining(),
    numberOfOtherPlayers: card.analytics?.numberOfOtherPlayers,
    shoeDisplayMode: card.analytics?.shoeDisplayMode,
    dealerSpeed: card.analytics?.dealerSpeed,
    dealDelayMs: card.analytics?.dealDelayMs,
    playerThinkDelayMs: card.analytics?.playerThinkDelayMs,
    dealerThinkDelayMs: card.analytics?.dealerThinkDelayMs,
    countPromptDelayMs: card.analytics?.countPromptDelayMs,
    msSincePreviousVisibleCard: card.analytics?.msSincePreviousVisibleCard
  };
  withCurrentShoeId().then(shoeId => {
    if (!shoeId) return;
    return apiRequest("/api/events/card-observed", {
      method: "POST",
      body: { ...payload, sessionId: state.analytics.sessionId, shoeId }
    });
  }).catch(error => console.warn("Could not record card", error));
}

function analyticsRecordHand(outcome) {
  if (!analyticsShouldTrack()) return;
  const payload = {
    handNumber: state.handNumber,
    durationMs: Date.now() - (state.analytics.currentHandStartedAt || Date.now()),
    outcome,
    cardsDealt: state.shoe.cardsDealt - state.analytics.currentHandCardsDealtStart,
    visibleCardsCounted: state.analytics.currentHandVisibleCards,
    runningCountBefore: state.analytics.currentHandRunningCountStart,
    runningCountAfter: state.runningCount,
    shoeDepthPercent: shoeDepthPercent(),
    decksRemaining: decksRemaining()
  };
  withCurrentShoeId().then(shoeId => {
    if (!shoeId || !state.analytics.sessionId) return;
    return apiRequest("/api/events/hand-completed", {
      method: "POST",
      body: { ...payload, sessionId: state.analytics.sessionId, shoeId }
    });
  }).catch(error => console.warn("Could not record hand", error));
}

function analyticsRecordCountCheck(details) {
  if (!analyticsShouldTrack() || details.cardsSincePreviousCheck <= 0) return;
  const responseTimeMs = Date.now() - (state.analytics.countPromptOpenedAt || Date.now());
  const signedError = details.answer - state.runningCount;
  const payload = {
    handNumber: state.handNumber,
    promptSource: state.analytics.countPromptSource,
    correctRunningCount: state.runningCount,
    userAnswer: details.answer,
    signedError,
    absoluteError: Math.abs(signedError),
    correct: details.correct,
    responseTimeMs,
    cardsSincePreviousCheck: details.cardsSincePreviousCheck,
    previousCount: details.previousCount,
    netCountDelta: details.delta,
    shoeDepthPercent: shoeDepthPercent(),
    decksRemaining: decksRemaining(),
    countCheckMode: state.settings.countCheckMode,
    dealerSpeed: state.settings.dealerSpeed,
    numberOfOtherPlayers: state.settings.numberOfOtherPlayers,
    shoeDisplayMode: state.settings.shoeDisplayMode,
    cards: state.visibleCardsSinceLastCheck.map(card => ({
      visibleOrder: card.analytics?.visibleOrder,
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
      msSincePreviousVisibleCard: card.analytics?.msSincePreviousVisibleCard
    }))
  };
  withCurrentShoeId().then(shoeId => {
    if (!shoeId || !state.analytics.sessionId) return;
    return apiRequest("/api/events/count-check-submitted", {
      method: "POST",
      body: { ...payload, sessionId: state.analytics.sessionId, shoeId }
    });
  }).then(() => {
    if (els.analyticsPanel.classList.contains("open")) loadAnalyticsDashboard();
  }).catch(error => console.warn("Could not record count check", error));
}

async function withCurrentShoeId() {
  if (state.analytics.currentShoeId) return state.analytics.currentShoeId;
  return ensureAnalyticsShoe();
}

function shoeDepthPercent() {
  if (!state.shoe) return 0;
  const total = Math.max(1, state.settings.numberOfDecks * 52);
  return Math.round((state.shoe.cardsDealt / total) * 1000) / 10;
}

function decksRemaining() {
  if (!state.shoe) return 0;
  return Math.round((state.shoe.cards.length / 52) * 10) / 10;
}

async function loadAnalyticsDashboard() {
  if (!state.analytics.serverAvailable) {
    renderEmptyAnalytics("Start the app with npm run dev to enable SQLite analytics.");
    return;
  }
  try {
    const [summary, trends] = await Promise.all([
      apiRequest("/api/analytics/summary"),
      apiRequest(`/api/analytics/trends?range=${encodeURIComponent(els.trendRange.value)}`)
    ]);
    renderAnalyticsSummary(summary);
    renderTrendChart(trends.days || []);
    state.analytics.dashboardLoaded = true;
  } catch (error) {
    console.warn("Could not load analytics", error);
    renderEmptyAnalytics("Analytics data could not be loaded.");
  }
}

function renderAnalyticsSummary(summary) {
  const hasChecks = (summary.totals?.checks || 0) > 0;
  els.masteryScore.textContent = hasChecks ? String(summary.masteryScore || 0) : "—";
  els.masteryLevel.textContent = hasChecks ? (summary.level || "No data yet") : "Needs count checks";
  els.recentAccuracy.textContent = hasChecks ? `${formatPercent(summary.recentAccuracy)}%` : "—";
  els.analyticsMetrics.innerHTML = hasChecks ? analyticsMetricSections(summary) : `<p class="empty-state">No count checks yet.</p>`;
  renderBreakdowns(summary);
  renderSessions(summary.sessions || []);
}

function analyticsMetricSections(summary) {
  return `
    <section class="analytics-priority" aria-label="What to focus on first">
      ${priorityCard("Accuracy", `${formatPercent(summary.recentAccuracy)}%`, "Last 50 checks", priorityStatus(summary.recentAccuracy, 90, 75))}
      ${priorityCard("Error control", formatNumber(summary.recentAvgError), "Recent average miss", errorStatus(summary.recentAvgError))}
      ${priorityCard("Self-check spacing", formatCards(summary.quizSpacing?.medianCardsPerCheck), "Cards between your count checks", selfCheckSpacingStatus(summary.quizSpacing))}
    </section>
    ${metricGroup("Performance", [
      metricTile("All-time accuracy", `${formatPercent(summary.accuracy)}%`, "Every count check"),
      metricTile("Average error", formatNumber(summary.avgError), "Absolute count miss"),
      metricTile("Median speed", formatMs(summary.medianResponse), "Typical answer time"),
      metricTile("P90 speed", formatMs(summary.p90Response), "Slower responses")
    ])}
    ${metricGroup("Consistency", [
      metricTile("Current streak", summary.currentStreak, "Correct checks"),
      metricTile("Best streak", summary.bestStreak, "Correct checks"),
      metricTile("No major miss", summary.noMajorErrorStreak, "Errors under 3")
    ])}
    ${metricGroup("Self-check spacing", [
      metricTile("Typical gap", formatCards(summary.quizSpacing?.medianCardsPerCheck), "Median cards per check"),
      metricTile("Average gap", formatCards(summary.quizSpacing?.avgCardsPerCheck), "Cards per check"),
      metricTile("Check rate", `${formatNumber(summary.quizSpacing?.checksPer100Cards)} / 100`, "Visible cards"),
      metricTile("Max recent gap", formatCards(summary.quizSpacing?.maxRecentGap), "Last 50 checks")
    ])}
    ${metricGroup("Practice volume", [
      metricTile("Cards counted", summary.totals?.cards || 0, "Visible cards"),
      metricTile("Count checks", summary.totals?.checks || 0, "Submitted answers"),
      metricTile("Hands played", summary.totals?.hands || 0, "Completed rounds"),
      metricTile("Sessions", summary.totals?.sessions || 0, "Tracked visits")
    ])}
  `;
}

function priorityCard(label, value, hint, status) {
  const subtitle = status.hint || hint;
  return `
    <div class="priority-card ${status.className}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${status.text} · ${subtitle}</small>
    </div>
  `;
}

function metricGroup(title, tiles) {
  return `
    <section class="metric-group">
      <h3>${title}</h3>
      <div class="metric-grid">${tiles.join("")}</div>
    </section>
  `;
}

function metricTile(label, value, hint) {
  return `
    <div class="metric-tile">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </div>
  `;
}

function renderTrendChart(days) {
  if (!days.length) {
    els.trendChart.innerHTML = `<p class="empty-state">No count checks yet.</p>`;
    return;
  }
  els.trendChart.innerHTML = days.slice(-18).map(day => {
    const height = Math.max(4, Math.round(day.accuracy));
    return `
      <div class="trend-bar" title="${day.day}: ${formatPercent(day.accuracy)}% accuracy">
        <span style="height:${height}%"></span>
        <small>${day.day.slice(5)}</small>
      </div>
    `;
  }).join("");
}

function renderBreakdowns(summary) {
  const groups = [
    ["Mistake patterns", [
      ["Error size", [
        { label: "Perfect", checks: summary.errorBuckets?.perfect || 0 },
        { label: "Off by 1", checks: summary.errorBuckets?.one || 0 },
        { label: "Off by 2", checks: summary.errorBuckets?.two || 0 },
        { label: "Major", checks: summary.errorBuckets?.major || 0 }
      ]],
      ["Likely error drivers", summary.errorDrivers || []]
    ]],
    ["Training pressure", [
      ["Self-check spacing", summary.quizSpacing?.buckets || []],
      ["Count pressure", summary.pressure || []],
      ["Prompt type", summary.promptTypes || []]
    ]],
    ["Table conditions", [
      ["Actual deal speed", summary.speedBreakdown || []],
      ["Other players", summary.otherPlayers || []],
      ["Shoe display", summary.shoeDisplayModes || []],
      ["Shoe depth", summary.depth || []]
    ]]
  ];
  els.breakdownGrid.innerHTML = groups.map(([title, sections]) => `
    <section class="breakdown-family">
      <h4>${title}</h4>
      <div class="breakdown-family-grid">
        ${sections.map(([sectionTitle, rows]) => breakdownBlock(sectionTitle, rows)).join("")}
      </div>
    </section>
  `).join("");
}

function breakdownBlock(title, rows) {
  return `
    <div class="breakdown-block">
      <h5>${title}</h5>
      ${rows.length ? rows.map(row => breakdownRow(row)).join("") : `<p class="empty-state">No data</p>`}
    </div>
  `;
}

function breakdownRow(row) {
  const value = row.accuracy === undefined ? row.checks : `${formatPercent(row.accuracy)}%`;
  const bar = row.accuracy === undefined ? Math.min(100, row.checks * 10) : row.accuracy;
  const risk = row.atRisk ? " · at risk" : "";
  const detail = row.avgError === undefined ? `${row.checks} checks${risk}` : `${row.checks} checks, ${formatNumber(row.avgError)} avg error${risk}`;
  return `
    <div class="breakdown-row">
      <div>
        <span>${row.label}</span>
        <small>${detail}</small>
      </div>
      <strong>${value}</strong>
      <span class="breakdown-meter"><span style="width:${Math.max(0, Math.min(100, bar))}%"></span></span>
    </div>
  `;
}

function renderSessions(sessions) {
  if (!sessions.length) {
    els.recentSessions.innerHTML = `<p class="empty-state">No practice sessions recorded yet.</p>`;
    return;
  }
  els.recentSessions.innerHTML = sessions.map(session => `
    <div class="session-row">
      <div>
        <strong>${formatDateTime(session.started_at)}</strong>
        <span>${session.hands || 0} hands · ${session.checks || 0} checks · ${session.shoes || 0} shoes</span>
      </div>
      <div>
        <strong>${session.checks ? `${formatPercent(session.accuracy)}%` : "—"}</strong>
        <span>${session.checks ? `${formatNumber(session.avg_error)} avg err · ${formatMs(session.avg_response_ms)}` : "No checks yet"}</span>
      </div>
    </div>
  `).join("");
}

function renderEmptyAnalytics(message) {
  els.masteryScore.textContent = "0";
  els.masteryLevel.textContent = "No data yet";
  els.recentAccuracy.textContent = "0%";
  els.analyticsMetrics.innerHTML = `<p class="empty-state">${message}</p>`;
  els.trendChart.innerHTML = `<p class="empty-state">${message}</p>`;
  els.breakdownGrid.innerHTML = "";
  els.recentSessions.innerHTML = "";
}

async function resetAnalyticsData() {
  if (!state.analytics.serverAvailable) return;
  const confirmed = window.confirm("Delete all recorded analytics data? This cannot be undone.");
  if (!confirmed) return;
  try {
    await apiRequest("/api/analytics", { method: "DELETE" });
    state.analytics.sessionId = null;
    state.analytics.sessionPromise = null;
    state.analytics.currentShoeId = null;
    state.analytics.shoePromise = null;
    await initAnalytics();
    if (state.shoe) analyticsStartShoe();
    loadAnalyticsDashboard();
  } catch (error) {
    console.warn("Could not reset analytics", error);
  }
}

function formatPercent(value) {
  return formatNumber(value || 0);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatCards(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0 cards";
  const rounded = Number.isInteger(number) ? String(number) : number.toFixed(1);
  return `${rounded} card${number === 1 ? "" : "s"}`;
}

function formatMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "0 ms";
  if (number >= 1000) return `${(number / 1000).toFixed(1)} s`;
  return `${Math.round(number)} ms`;
}

function priorityStatus(value, strong, watch) {
  const number = Number(value);
  if (!Number.isFinite(number)) return { className: "is-watch", text: "Needs data" };
  if (number >= strong) return { className: "is-strong", text: "Strong" };
  if (number >= watch) return { className: "is-watch", text: "Watch" };
  return { className: "is-risk", text: "Priority" };
}

function errorStatus(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return { className: "is-watch", text: "Needs data" };
  if (number <= 0.5) return { className: "is-strong", text: "Strong" };
  if (number <= 1.25) return { className: "is-watch", text: "Watch" };
  return { className: "is-risk", text: "Priority" };
}

function selfCheckSpacingStatus(quizSpacing) {
  const median = Number(quizSpacing?.medianCardsPerCheck);
  const p90 = Number(quizSpacing?.p90CardsPerCheck);
  if (!Number.isFinite(median) || !Number.isFinite(p90)) {
    return { className: "is-watch", text: "Needs data", hint: "Submit more count checks to see spacing" };
  }
  const longBuckets = ["11-15 cards", "16+ cards"];
  const hurting = (quizSpacing.buckets || []).find(bucket => bucket.atRisk && longBuckets.includes(bucket.label));
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

function formatDateTime(value) {
  if (!value) return "Unknown";
  return new Date(value.replace(" ", "T")).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function currentSpeedSnapshot() {
  return {
    numberOfOtherPlayers: state.settings.numberOfOtherPlayers,
    shoeDisplayMode: state.settings.shoeDisplayMode,
    dealerSpeed: state.settings.dealerSpeed,
    dealDelayMs: state.settings.dealDelayMs,
    playerThinkDelayMs: state.settings.playerThinkDelayMs,
    dealerThinkDelayMs: state.settings.dealerThinkDelayMs,
    countPromptDelayMs: state.settings.countPromptDelayMs
  };
}

function togglePause() {
  state.paused = !state.paused;
  els.pauseButton.querySelector("span").textContent = state.paused ? "Resume" : "Pause";
  if (state.paused) {
    setStatus("Paused. Press Resume to continue.");
  } else {
    setStatus("Resumed.");
    resumePausedWaits();
  }
}

function setStatus(text) {
  els.status.textContent = text;
}

function setControls(enabled) {
  els.newShoeButton.disabled = !enabled;
  els.nextButton.disabled = !enabled;
  els.manualCheckButton.disabled = !enabled;
  els.pauseButton.disabled = false;
}

function waitForSpeed() {
  if (state.settings.dealerSpeed === "manual") return waitForManualStep();
  return pauseAwareDelay(state.settings.dealDelayMs);
}

function waitForThink(actor) {
  if (state.settings.dealerSpeed === "manual") return waitForManualStep();
  const ms = actor === "dealer" ? state.settings.dealerThinkDelayMs : state.settings.playerThinkDelayMs;
  return pauseAwareDelay(ms);
}

async function pauseAwareDelay(ms) {
  let remaining = Math.max(0, Number(ms) || 0);
  while (remaining > 0) {
    await waitIfPaused();
    const slice = Math.min(remaining, 50);
    const startedAt = Date.now();
    await delay(slice);
    remaining -= Date.now() - startedAt;
  }
  await waitIfPaused();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function waitIfPaused() {
  if (!state.paused) return Promise.resolve();
  return new Promise(resolve => {
    state.pauseResolvers.push(resolve);
  });
}

function resumePausedWaits() {
  const resolvers = state.pauseResolvers.splice(0);
  for (const resolve of resolvers) resolve();
}

function applySpeedPresetToForm() {
  const presets = {
    fast: { deal: 250, player: 300, dealer: 250, quiz: 800 },
    normal: { deal: 800, player: 1200, dealer: 700, quiz: 1800 },
    slow: { deal: 1400, player: 2300, dealer: 1300, quiz: 3200 },
    learning: { deal: 2500, player: 4000, dealer: 2500, quiz: 5200 },
    firstLesson: { deal: 4000, player: 6500, dealer: 4000, quiz: 7800 }
  };
  const preset = presets[els.dealerSpeed.value];
  if (!preset) return;
  els.dealDelayMs.value = String(preset.deal);
  els.playerThinkDelayMs.value = String(preset.player);
  els.dealerThinkDelayMs.value = String(preset.dealer);
  els.countPromptDelayMs.value = String(preset.quiz);
  els.dealDelayValue.textContent = `${preset.deal} ms`;
  els.playerThinkDelayValue.textContent = `${preset.player} ms`;
  els.dealerThinkDelayValue.textContent = `${preset.dealer} ms`;
  els.countPromptDelayValue.textContent = `${preset.quiz} ms`;
}

function handleSpeedPresetChange() {
  applySpeedPresetToForm();
  applySpeedSettingsFromForm();
}

function applySpeedSettingsFromForm() {
  state.settings.dealerSpeed = els.dealerSpeed.value;
  state.settings.dealDelayMs = Number(els.dealDelayMs.value);
  state.settings.playerThinkDelayMs = Number(els.playerThinkDelayMs.value);
  state.settings.dealerThinkDelayMs = Number(els.dealerThinkDelayMs.value);
  state.settings.countPromptDelayMs = Number(els.countPromptDelayMs.value);
  saveSettings();
}

function applyShoeDisplayModeFromForm() {
  state.settings.shoeDisplayMode = els.shoeDisplayMode.value;
  saveSettings();
  renderShoeBoxes();
}

function saveSettings() {
  localStorage.setItem("blackjack-count-settings", JSON.stringify(state.settings));
}

function waitForManualStep() {
  setStatus("Manual step: tap Next hand for next action.");
  return new Promise(resolve => {
    const handler = () => {
      if (state.paused) {
        els.nextButton.addEventListener("click", handler, { once: true });
        return;
      }
      resolve();
    };
    els.nextButton.disabled = false;
    els.nextButton.addEventListener("click", handler, { once: true });
  });
}

function randomPromptDistance() {
  const base = Math.max(4, state.settings.countCheckCardInterval || 10);
  return Math.floor(base * 0.7 + Math.random() * base);
}

function cardLabel(card) {
  return `${card.rank}${suitSymbols[card.suit]}`;
}

function signed(number) {
  return number > 0 ? `+${number}` : String(number);
}
