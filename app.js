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
  handNumber: 0
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  loadSettings();
  bindEvents();
  startNewShoe();
});

function bindElements() {
  for (const id of [
    "settingsButton", "closeSettingsButton", "settingsPanel", "applySettingsButton",
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
  state.phase = "dealing";
  setStatus(`Hand ${state.handNumber}: dealing.`);
  render();

  try {
    await dealInitialCards();
    markNaturals();
    if (state.settings.dealerPeek && dealerHasBlackjackPeek()) {
      await revealDealerHole();
      setStatus("Dealer blackjack. Round ends.");
    } else {
      await playPlayers();
      await playDealer();
      setStatus(resolveSummary());
    }

    moveHandsToDiscard();
    if (state.shoe.cutReached) {
      state.pendingShuffle = true;
      setStatus("Cut card reached. Shuffling after this round.");
      if (state.settings.countCheckMode === "random" || state.settings.countCheckMode === "everyRound") {
        await maybePrompt(true);
      }
    } else if (state.settings.countCheckMode === "everyRound") {
      await openCountCheck();
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
  if (visible) countCard(card);
  render();
  await maybePrompt(false);
  await waitForSpeed();
}

async function revealDealerHole() {
  await waitIfPaused();
  const hole = state.dealer.hand.find(card => !card.visible);
  if (!hole) return;
  hole.visible = true;
  countCard(hole);
  render();
  await maybePrompt(false);
  await waitForSpeed();
}

function countCard(card) {
  if (!card.visible || card.counted) return;
  card.counted = true;
  state.runningCount += getHiLoValue(card);
  state.visibleCardsSinceLastCheck.push(card);
  state.visibleCardsSincePrompt += 1;
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
    await openAutomaticCountCheck();
    return;
  }
  if (state.settings.countCheckMode === "everyNCards" && state.visibleCardsSincePrompt >= state.settings.countCheckCardInterval) {
    await openAutomaticCountCheck();
  }
  if (state.settings.countCheckMode === "random" && state.visibleCardsSincePrompt >= state.nextRandomPromptAt) {
    await openAutomaticCountCheck();
  }
}

async function openAutomaticCountCheck() {
  await waitForCountPrompt();
  if (state.paused || els.countDialog.open) return;
  await openCountCheck();
}

function waitForCountPrompt() {
  if (state.settings.dealerSpeed === "manual") return Promise.resolve();
  return pauseAwareDelay(state.settings.countPromptDelayMs);
}

function openCountCheck() {
  return new Promise(resolve => {
    if (els.countDialog.open) {
      resolve();
      return;
    }
    state.paused = true;
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
  els.settingsPanel.classList.toggle("open", open);
  els.settingsPanel.setAttribute("aria-hidden", String(!open));
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
