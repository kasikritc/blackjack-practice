const suits = ["hearts", "diamonds", "clubs", "spades"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const suitSymbols = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const redSuits = new Set(["hearts", "diamonds"]);
const strategyDealerUpcards = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
const strategyActions = ["hit", "stand", "double", "split", "surrender", "insurance"];
const strategyActionLabels = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
  insurance: "Insurance"
};
const strategyActionAbbreviations = {
  hit: "H",
  stand: "S",
  double: "D",
  split: "P",
  surrender: "R",
  insurance: "I"
};
const strategyActionKeys = { a: "hit", s: "stand", d: "double", f: "split", r: "surrender", e: "insurance" };
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
  countCheckMode: "everyRound",
  countCheckCardInterval: 10,
  shuffleImmediately: false,
  sideBetsEnabled: false,
  animationsEnabled: true,
  flashMinCards: 2,
  flashMaxCards: 5,
  flashDurationMs: 1500
};

const state = {
  mode: "home",
  flash: {
    cards: [],
    correctCount: 0,
    numCards: 0,
    minCards: 2,
    maxCards: 5,
    promptOpenedAt: null,
    active: false,
    sessionRange: "7d",
    sessionLimit: 10,
    sessionPageSize: 10
  },
  strategy: {
    profiles: [],
    charts: [],
    subsets: [],
    selectedProfileId: null,
    selectedChartId: null,
    selectedSubsetId: null,
    playerHand: [],
    dealerHand: [],
    handNumber: 0,
    promptOpenedAt: null,
    feedback: "Load a strategy chart to start.",
    feedbackType: "neutral",
    panelMode: "review",
    editingCell: null,
    highlightCriteria: null,
    currentDecision: null,
    insuranceResolved: false,
    serverAvailable: false
  },
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
    dashboardLoaded: false,
    sessionLimit: 10,
    sessionRange: "7d",
    sessionPageSize: 10
  }
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  loadSettings();
  bindEvents();
  await initAnalytics();
  await initStrategyData();
  setMode("home");
});

function bindElements() {
  for (const id of [
    "settingsButton", "closeSettingsButton", "settingsPanel", "applySettingsButton",
    "settingsEyebrow", "applySettingsLabel",
    "analyticsButton", "closeAnalyticsButton", "analyticsPanel", "trackingStatus", "trackingToggleButton",
    "masteryScore", "masteryLevel", "recentAccuracy", "analyticsMetrics", "trendRange",
    "trendChart", "breakdownGrid", "recentSessions", "sessionRangeSelect", "loadMoreSessionsButton", "refreshAnalyticsButton", "resetAnalyticsButton",
    "newShoeButton", "nextButton", "pauseButton", "manualCheckButton", "dealerSeat",
    "otherPlayers", "shoe", "discard", "status", "payoutLabel", "ruleLabel",
    "countDialog", "countDialogEyebrow", "countDialogTitle", "countForm", "countSignButton", "countInput", "countFeedback", "submitCountButton",
    "continueButton", "numberOfDecks", "penetrationPercent", "penetrationValue",
    "dealerHitsSoft17", "dealerPeek", "blackjackPayout", "numberOfOtherPlayers",
    "shoeDisplayMode", "dealerSpeed", "dealDelayMs", "dealDelayValue", "playerThinkDelayMs", "playerThinkDelayValue",
    "dealerThinkDelayMs", "dealerThinkDelayValue", "countPromptDelayMs", "countPromptDelayValue",
    "countCheckMode", "countCheckCardInterval", "shuffleImmediately",
    "surrenderAllowed", "doubleAfterSplit", "resplitAces", "hitSplitAces",
    "sideBetsEnabled", "animationsEnabled",
    "homeScreen", "tableScreen", "flashScreen", "basicStrategyScreen", "modeTableButton", "modeFlashButton", "modeStrategyButton",
    "tableHomeButton", "flashHomeButton", "flashAnalyticsButton", "flashSettingsButton",
    "strategyHomeButton", "strategyRulesButton", "strategyReviewButton", "strategyEditButton", "strategyNewHandButton",
    "strategyRuleProfileSelect", "strategyChartSelect", "strategySubsetSelect", "strategyRulesSummary",
    "strategyDealerSeat", "strategyPlayerSeat", "strategyPromptMeta", "strategyActionControls",
    "strategyRulesPanel", "closeStrategyRulesButton", "strategyRuleDecks", "strategyRuleSoft17",
    "strategyRulePeek", "strategyRuleHoleCard", "strategyRulePayout", "strategyRuleDouble", "strategyRuleSurrender",
    "strategyRuleMaxSplitHands", "strategyRuleDAS", "strategyRuleResplitAces", "strategyRuleHitSplitAces",
    "strategyRuleOneCardAces", "strategyRuleInsurance", "strategyRuleSplitTensByValue", "strategyRuleCustomJson",
    "strategyCreateProfileButton", "strategySaveRulesButton", "strategyPanel", "strategyPanelTitle", "closeStrategyPanelButton",
    "strategyChartName", "strategyCellActionSelect", "strategyCloneChartButton", "strategySaveChartButton",
    "strategySubsetName", "strategyClearHighlightsButton", "strategySaveSubsetButton", "strategyChartEditor",
    "flashStats", "flashCards", "flashStatus", "flashDealButton",
    "flashMinCards", "flashMaxCards", "flashDurationMs", "flashDurationValue",
    "flashAnalyticsPanel", "closeFlashAnalyticsButton", "flashMasteryScore", "flashMasteryLevel",
    "flashRecentAccuracy", "flashAnalyticsMetrics", "flashTrendRange", "flashTrendChart",
    "flashBreakdownGrid", "flashRecentSessions", "flashSessionRangeSelect",
    "flashLoadMoreSessionsButton", "flashRefreshAnalyticsButton", "flashResetAnalyticsButton"
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
  els.sessionRangeSelect.addEventListener("change", () => {
    state.analytics.sessionRange = els.sessionRangeSelect.value;
    state.analytics.sessionLimit = state.analytics.sessionPageSize;
    loadRecentSessions();
  });
  els.loadMoreSessionsButton.addEventListener("click", () => {
    state.analytics.sessionLimit += state.analytics.sessionPageSize;
    loadRecentSessions();
  });
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

  els.modeTableButton.addEventListener("click", () => setMode("table"));
  els.modeFlashButton.addEventListener("click", () => setMode("flash"));
  els.tableHomeButton.addEventListener("click", () => setMode("home"));
  els.flashHomeButton.addEventListener("click", () => setMode("home"));
  els.flashDealButton.addEventListener("click", flashDealRound);
  els.flashSettingsButton.addEventListener("click", () => toggleSettings(true));
  els.flashAnalyticsButton.addEventListener("click", () => toggleFlashAnalytics(true));
  els.closeFlashAnalyticsButton.addEventListener("click", () => toggleFlashAnalytics(false));
  els.flashRefreshAnalyticsButton.addEventListener("click", loadFlashAnalyticsDashboard);
  els.flashResetAnalyticsButton.addEventListener("click", resetFlashAnalyticsData);
  els.flashTrendRange.addEventListener("change", loadFlashAnalyticsDashboard);
  els.flashSessionRangeSelect.addEventListener("change", () => {
    state.flash.sessionRange = els.flashSessionRangeSelect.value;
    state.flash.sessionLimit = state.flash.sessionPageSize;
    loadFlashRecentSessions();
  });
  els.flashLoadMoreSessionsButton.addEventListener("click", () => {
    state.flash.sessionLimit += state.flash.sessionPageSize;
    loadFlashRecentSessions();
  });
  els.flashDurationMs.addEventListener("input", () => {
    els.flashDurationValue.textContent = `${els.flashDurationMs.value} ms`;
    state.settings.flashDurationMs = Number(els.flashDurationMs.value);
    saveSettings();
  });
  els.flashMinCards.addEventListener("change", () => {
    state.settings.flashMinCards = clampFlashCount(els.flashMinCards.value);
    els.flashMinCards.value = String(state.settings.flashMinCards);
    saveSettings();
  });
  els.flashMaxCards.addEventListener("change", () => {
    state.settings.flashMaxCards = clampFlashCount(els.flashMaxCards.value);
    els.flashMaxCards.value = String(state.settings.flashMaxCards);
    saveSettings();
  });

  els.modeStrategyButton.addEventListener("click", () => setMode("strategy"));
  els.strategyHomeButton.addEventListener("click", () => setMode("home"));
  els.strategyRulesButton.addEventListener("click", () => toggleStrategyRules(true));
  els.closeStrategyRulesButton.addEventListener("click", () => toggleStrategyRules(false));
  els.strategyReviewButton.addEventListener("click", () => openStrategyPanel("review"));
  els.strategyEditButton.addEventListener("click", () => openStrategyPanel("edit"));
  els.closeStrategyPanelButton.addEventListener("click", () => toggleStrategyPanel(false));
  els.strategyNewHandButton.addEventListener("click", dealStrategyPrompt);
  els.strategyRuleProfileSelect.addEventListener("change", handleStrategyProfileChange);
  els.strategyChartSelect.addEventListener("change", handleStrategyChartChange);
  els.strategySubsetSelect.addEventListener("change", handleStrategySubsetChange);
  els.strategyActionControls.addEventListener("click", event => {
    const button = event.target.closest("[data-strategy-action]");
    if (button && !button.disabled) submitStrategyAction(button.dataset.strategyAction);
  });
  els.strategyCellActionSelect.addEventListener("change", updateSelectedStrategyCell);
  els.strategySaveChartButton.addEventListener("click", saveCurrentStrategyChart);
  els.strategyCloneChartButton.addEventListener("click", cloneCurrentStrategyChart);
  els.strategyClearHighlightsButton.addEventListener("click", clearStrategyHighlights);
  els.strategySaveSubsetButton.addEventListener("click", saveStrategySubset);
  els.strategySaveRulesButton.addEventListener("click", saveStrategyRules);
  els.strategyCreateProfileButton.addEventListener("click", createStrategyProfile);
}

function handleKeyboardShortcut(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

  const key = event.key.toLowerCase();
  const target = event.target;
  const isTyping = isTextEntryTarget(target);

  if (els.countDialog.open) {
    if (key === "d") {
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

  if (els.strategyRulesPanel.classList.contains("open")) {
    if (key === "escape") {
      event.preventDefault();
      toggleStrategyRules(false);
    }
    return;
  }

  if (els.strategyPanel.classList.contains("open")) {
    if (key === "escape") {
      event.preventDefault();
      toggleStrategyPanel(false);
    }
    return;
  }

  if (isTyping) return;

  if (state.mode === "flash") {
    if (key === "n" || key === "enter") {
      event.preventDefault();
      if (!els.flashDealButton.disabled) els.flashDealButton.click();
    }
    return;
  }

  if (state.mode === "strategy") {
    if (key === "n" || key === "enter") {
      event.preventDefault();
      dealStrategyPrompt();
      return;
    }
    if (key === "c") {
      event.preventDefault();
      openStrategyPanel("review");
      return;
    }
    if (key === "v") {
      event.preventDefault();
      openStrategyPanel("edit");
      return;
    }
    const action = strategyActionKeys[key];
    if (action) {
      event.preventDefault();
      const button = els.strategyActionControls.querySelector(`[data-strategy-action="${action}"]`);
      if (button && !button.disabled) submitStrategyAction(action);
    }
    return;
  }

  if (state.mode !== "table") return;

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
    state.phase = "roundEnd";
    clearTable();
    render();

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
    if (source !== "flash" && state.mode !== "table") {
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
    applyCountDialogFraming(source);
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
  if (state.mode === "flash") {
    submitFlashAnswer();
    return;
  }
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

function applyCountDialogFraming(source) {
  const betweenRounds = source === "everyRound" || source === "cutCard";
  els.countDialog.classList.toggle("is-between-rounds", betweenRounds);
  if (source === "flash") {
    els.countDialogEyebrow.textContent = "Flash count";
    els.countDialogTitle.textContent = "What is the count for this hand?";
  } else if (source === "everyRound") {
    els.countDialogEyebrow.textContent = "Place your bet";
    els.countDialogTitle.textContent = "What is the running count?";
  } else if (source === "cutCard") {
    els.countDialogEyebrow.textContent = "Cut card reached";
    els.countDialogTitle.textContent = "Final running count?";
  } else {
    els.countDialogEyebrow.textContent = "Count check";
    els.countDialogTitle.textContent = "What is the running count?";
  }
}

function closeCountCheck() {
  if (els.countDialog.open) els.countDialog.close();
  els.countDialog.classList.remove("is-between-rounds");
  if (state.mode === "flash") {
    state.countPromptResolve = null;
    state.paused = false;
    els.flashStatus.textContent = "Press Deal for the next round.";
    return;
  }
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

function setMode(mode) {
  state.mode = mode;
  toggleSettings(false);
  toggleAnalytics(false);
  toggleFlashAnalytics(false);
  toggleStrategyRules(false);
  toggleStrategyPanel(false);
  if (els.countDialog.open) els.countDialog.close();
  state.paused = false;
  els.homeScreen.hidden = mode !== "home";
  els.tableScreen.hidden = mode !== "table";
  els.flashScreen.hidden = mode !== "flash";
  els.basicStrategyScreen.hidden = mode !== "strategy";
  document.body.dataset.mode = mode;
  if (mode === "table") {
    if (!state.shoe) startNewShoe();
  } else if (mode === "flash") {
    state.flash.active = false;
    els.flashDealButton.disabled = false;
    els.flashCards.innerHTML = "";
    els.flashStatus.textContent = "Press Deal to start a round.";
    refreshFlashStats();
  } else if (mode === "strategy") {
    renderStrategySetup();
    if (!state.strategy.playerHand.length) dealStrategyPrompt();
    else renderStrategyDrill();
  }
}

function clampFlashCount(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 2;
  return Math.max(1, Math.min(8, number));
}

function makeFlashCards(count) {
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    const suit = suits[Math.floor(Math.random() * suits.length)];
    cardSerial += 1;
    cards.push({ rank, suit, id: `flash-${suit}-${rank}-${cardSerial}`, visible: true, counted: false });
  }
  return cards;
}

function flashCardHtml(card, faceUp) {
  if (!faceUp || !card) return `<div class="card back" aria-label="Face-down card"></div>`;
  const red = redSuits.has(card.suit) ? " red" : "";
  const symbol = suitSymbols[card.suit];
  return `
    <div class="card${red} is-new" aria-label="${card.rank} of ${card.suit}">
      <span class="rank corner"><span>${card.rank}</span><span>${symbol}</span></span>
      <span class="pip">${symbol}</span>
      <span class="rank bottom-rank corner"><span>${card.rank}</span><span>${symbol}</span></span>
    </div>
  `;
}

async function flashDealRound() {
  if (state.mode !== "flash" || els.countDialog.open) return;
  const lo = clampFlashCount(state.settings.flashMinCards);
  const hi = clampFlashCount(state.settings.flashMaxCards);
  const min = Math.min(lo, hi);
  const max = Math.max(lo, hi);
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const cards = makeFlashCards(count);
  state.flash.cards = cards;
  state.flash.correctCount = cards.reduce((sum, card) => sum + getHiLoValue(card), 0);
  state.flash.numCards = count;
  state.flash.minCards = min;
  state.flash.maxCards = max;
  state.flash.active = true;
  els.flashCards.innerHTML = cards.map(card => flashCardHtml(card, true)).join("");
  els.flashStatus.textContent = "Memorize the cards…";
  els.flashDealButton.disabled = true;
  await delay(Math.max(300, Number(state.settings.flashDurationMs) || 1500));
  if (state.mode !== "flash" || !state.flash.active) return;
  els.flashCards.innerHTML = cards.map(() => flashCardHtml(null, false)).join("");
  els.flashStatus.textContent = "What is the count?";
  els.flashDealButton.disabled = false;
  state.flash.promptOpenedAt = Date.now();
  openCountCheck("flash");
}

function submitFlashAnswer() {
  const digits = els.countInput.value.replace(/\D/g, "");
  if (!digits) return;
  const sign = els.countSignButton.dataset.sign === "-1" ? -1 : 1;
  const answer = sign * Number.parseInt(digits, 10);
  const correct = answer === state.flash.correctCount;
  const signedError = answer - state.flash.correctCount;
  const responseTimeMs = Date.now() - (state.flash.promptOpenedAt || Date.now());
  analyticsRecordFlashRound({ answer, correct, signedError, responseTimeMs });
  const cards = state.flash.cards;
  els.flashCards.innerHTML = cards.map(card => flashCardHtml(card, true)).join("");
  const cardRows = cards.map(card => `
    <span class="count-card">
      <span>${cardLabel(card)}</span>
      <strong>${signed(getHiLoValue(card))}</strong>
    </span>
  `).join("");
  els.countFeedback.hidden = false;
  els.countFeedback.className = `feedback ${correct ? "correct" : "incorrect"}`;
  els.countFeedback.innerHTML = `
    <section class="feedback-section result-section">
      <strong>${correct ? "Correct" : "Incorrect"}</strong>
      <span>Count ${signed(state.flash.correctCount)}</span>
    </section>
    <section class="feedback-section">
      <h3>Cards This Round</h3>
      <div class="count-card-grid">${cardRows}</div>
    </section>
  `;
  els.submitCountButton.hidden = true;
  els.continueButton.hidden = false;
  els.flashStatus.textContent = correct ? "Correct! Deal again." : `Count was ${signed(state.flash.correctCount)}.`;
  state.flash.active = false;
  refreshFlashStats();
}

function analyticsRecordFlashRound(details) {
  if (!analyticsShouldTrack()) return;
  const payload = {
    numCards: state.flash.numCards,
    correctCount: state.flash.correctCount,
    userAnswer: details.answer,
    signedError: details.signedError,
    absoluteError: Math.abs(details.signedError),
    correct: details.correct,
    responseTimeMs: details.responseTimeMs,
    flashDurationMs: Number(state.settings.flashDurationMs),
    minCards: state.flash.minCards,
    maxCards: state.flash.maxCards,
    cards: state.flash.cards.map((card, index) => ({
      visibleOrder: index + 1,
      rank: card.rank,
      suit: card.suit,
      hiLoValue: getHiLoValue(card)
    }))
  };
  ensureAnalyticsSession().then(sessionId => {
    if (!sessionId) return;
    return apiRequest("/api/events/flash-round-submitted", {
      method: "POST",
      body: { ...payload, sessionId }
    });
  }).then(() => {
    if (els.flashAnalyticsPanel.classList.contains("open")) loadFlashAnalyticsDashboard();
  }).catch(error => console.warn("Could not record flash round", error));
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
    animationsEnabled: els.animationsEnabled.checked,
    flashMinCards: clampFlashCount(els.flashMinCards.value),
    flashMaxCards: clampFlashCount(els.flashMaxCards.value),
    flashDurationMs: Number(els.flashDurationMs.value)
  };
  saveSettings();
  toggleSettings(false);
  if (state.mode === "table") startNewShoe();
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
  els.flashDurationValue.textContent = `${state.settings.flashDurationMs} ms`;
}

function toggleSettings(open) {
  if (open) {
    const flash = state.mode === "flash";
    els.settingsEyebrow.textContent = flash ? "Flash Count" : "Table rules";
    els.applySettingsLabel.textContent = flash ? "Apply" : "Apply and shuffle";
  }
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
    state.analytics.sessionLimit = state.analytics.sessionPageSize;
    await loadRecentSessions();
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
}

async function loadRecentSessions() {
  if (!state.analytics.serverAvailable) return;
  const limit = state.analytics.sessionLimit;
  const range = state.analytics.sessionRange;
  try {
    const data = await apiRequest(`/api/analytics/sessions?limit=${limit + 1}&range=${encodeURIComponent(range)}`);
    const all = data.sessions || [];
    const hasMore = all.length > limit;
    renderSessions(all.slice(0, limit), hasMore);
  } catch (error) {
    console.warn("Could not load sessions", error);
    renderSessions([], false);
  }
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
      metricTile("Sessions", summary.totals?.sessions || 0, "Tracked visits"),
      metricTile("Total play time", formatDuration(summary.totals?.totalPlayMs), "Active time at the table")
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

function renderTrendChart(days, target = els.trendChart) {
  if (!days.length) {
    target.innerHTML = `<p class="empty-state">No data yet.</p>`;
    return;
  }
  target.innerHTML = days.slice(-18).map(day => {
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

function renderSessions(sessions, hasMore) {
  if (!sessions.length) {
    els.recentSessions.innerHTML = `<p class="empty-state">No sessions in this range.</p>`;
    els.loadMoreSessionsButton.hidden = true;
    return;
  }
  const groups = groupSessionsByDay(sessions);
  els.recentSessions.innerHTML = groups.map(group => `
    <div class="session-day-header">${group.label}</div>
    ${group.items.map(session => `
      <div class="session-row">
        <div>
          <strong>${formatTimeOnly(session.started_at)}</strong>
          <span>${formatMinSec(session.play_ms)} · ${session.hands || 0} hands · ${session.checks || 0} checks · ${session.shoes || 0} shoes</span>
        </div>
        <div>
          <strong>${session.checks ? `${formatPercent(session.accuracy)}%` : "—"}</strong>
          <span>${session.checks ? `${formatNumber(session.avg_error)} avg err · ${formatMs(session.avg_response_ms)}` : "No checks yet"}</span>
        </div>
      </div>
    `).join("")}
  `).join("");
  els.loadMoreSessionsButton.hidden = !hasMore;
}

function groupSessionsByDay(sessions) {
  const buckets = new Map();
  const order = [];
  for (const session of sessions) {
    const key = dayKey(session.started_at);
    if (!buckets.has(key)) {
      buckets.set(key, { label: formatDayHeader(session.started_at), items: [] });
      order.push(key);
    }
    buckets.get(key).items.push(session);
  }
  return order.map(key => buckets.get(key));
}

function dayKey(value) {
  const date = parseDate(value);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDayHeader(value) {
  const date = parseDate(value);
  if (!date) return "Unknown";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  const opts = { month: "short", day: "numeric" };
  if (date.getFullYear() !== today.getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString([], opts);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTimeOnly(value) {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

function toggleFlashAnalytics(open) {
  els.flashAnalyticsPanel.hidden = false;
  els.flashAnalyticsPanel.classList.toggle("open", open);
  els.flashAnalyticsPanel.setAttribute("aria-hidden", String(!open));
  if (open) loadFlashAnalyticsDashboard();
  else setTimeout(() => {
    if (!els.flashAnalyticsPanel.classList.contains("open")) els.flashAnalyticsPanel.hidden = true;
  }, 180);
}

async function refreshFlashStats() {
  if (!state.analytics.serverAvailable) {
    els.flashStats.innerHTML = `<span class="flash-stat"><strong>—</strong><small>Stats need the local API</small></span>`;
    return;
  }
  try {
    renderFlashStatsBar(await apiRequest("/api/analytics/flash-summary"));
  } catch (error) {
    console.warn("Could not load flash stats", error);
  }
}

function renderFlashStatsBar(summary) {
  const rounds = summary.totals?.rounds || 0;
  els.flashStats.innerHTML = `
    <span class="flash-stat"><strong>${rounds ? `${formatPercent(summary.recentAccuracy)}%` : "—"}</strong><small>Recent accuracy</small></span>
    <span class="flash-stat"><strong>${rounds}</strong><small>Rounds</small></span>
    <span class="flash-stat"><strong>${summary.currentStreak || 0}</strong><small>Streak</small></span>
    <span class="flash-stat"><strong>${summary.bestStreak || 0}</strong><small>Best</small></span>
    <span class="flash-stat"><strong>${rounds ? formatMs(summary.medianResponse) : "—"}</strong><small>Median time</small></span>
  `;
}

async function loadFlashAnalyticsDashboard() {
  if (!state.analytics.serverAvailable) {
    renderEmptyFlashAnalytics("Start the app with npm run dev to enable SQLite analytics.");
    return;
  }
  try {
    const [summary, trends] = await Promise.all([
      apiRequest("/api/analytics/flash-summary"),
      apiRequest(`/api/analytics/flash-trends?range=${encodeURIComponent(els.flashTrendRange.value)}`)
    ]);
    renderFlashSummary(summary);
    renderTrendChart(trends.days || [], els.flashTrendChart);
    state.flash.sessionLimit = state.flash.sessionPageSize;
    await loadFlashRecentSessions();
  } catch (error) {
    console.warn("Could not load flash analytics", error);
    renderEmptyFlashAnalytics("Analytics data could not be loaded.");
  }
}

function renderFlashSummary(summary) {
  const hasRounds = (summary.totals?.rounds || 0) > 0;
  els.flashMasteryScore.textContent = hasRounds ? String(summary.masteryScore || 0) : "—";
  els.flashMasteryLevel.textContent = hasRounds ? (summary.level || "No data yet") : "Needs rounds";
  els.flashRecentAccuracy.textContent = hasRounds ? `${formatPercent(summary.recentAccuracy)}%` : "—";
  els.flashAnalyticsMetrics.innerHTML = hasRounds ? flashMetricSections(summary) : `<p class="empty-state">No flash rounds yet.</p>`;
  renderFlashBreakdowns(summary);
}

function flashMetricSections(summary) {
  return `
    ${metricGroup("Performance", [
      metricTile("All-time accuracy", `${formatPercent(summary.accuracy)}%`, "Every round"),
      metricTile("Average error", formatNumber(summary.avgError), "Absolute count miss"),
      metricTile("Median speed", formatMs(summary.medianResponse), "Typical answer time"),
      metricTile("P90 speed", formatMs(summary.p90Response), "Slower responses")
    ])}
    ${metricGroup("Consistency", [
      metricTile("Current streak", summary.currentStreak, "Correct rounds"),
      metricTile("Best streak", summary.bestStreak, "Correct rounds"),
      metricTile("No major miss", summary.noMajorErrorStreak, "Errors under 3")
    ])}
    ${metricGroup("Practice volume", [
      metricTile("Rounds played", summary.totals?.rounds || 0, "Submitted answers"),
      metricTile("Cards seen", summary.totals?.cards || 0, "Across rounds"),
      metricTile("Avg hand size", formatCards(summary.avgCards), "Cards per round"),
      metricTile("Sessions", summary.totals?.sessions || 0, "Tracked visits")
    ])}
  `;
}

function renderFlashBreakdowns(summary) {
  const sections = [
    ["By hand size", summary.byCardCount || []],
    ["Error size", [
      { label: "Perfect", checks: summary.errorBuckets?.perfect || 0 },
      { label: "Off by 1", checks: summary.errorBuckets?.one || 0 },
      { label: "Off by 2", checks: summary.errorBuckets?.two || 0 },
      { label: "Major", checks: summary.errorBuckets?.major || 0 }
    ]]
  ];
  els.flashBreakdownGrid.innerHTML = `
    <section class="breakdown-family">
      <div class="breakdown-family-grid">
        ${sections.map(([title, rows]) => breakdownBlock(title, rows)).join("")}
      </div>
    </section>
  `;
}

function renderEmptyFlashAnalytics(message) {
  els.flashMasteryScore.textContent = "0";
  els.flashMasteryLevel.textContent = "No data yet";
  els.flashRecentAccuracy.textContent = "0%";
  els.flashAnalyticsMetrics.innerHTML = `<p class="empty-state">${message}</p>`;
  els.flashTrendChart.innerHTML = `<p class="empty-state">${message}</p>`;
  els.flashBreakdownGrid.innerHTML = "";
  els.flashRecentSessions.innerHTML = "";
}

async function loadFlashRecentSessions() {
  if (!state.analytics.serverAvailable) return;
  const limit = state.flash.sessionLimit;
  const range = state.flash.sessionRange;
  try {
    const data = await apiRequest(`/api/analytics/flash-sessions?limit=${limit + 1}&range=${encodeURIComponent(range)}`);
    const all = data.sessions || [];
    renderFlashSessions(all.slice(0, limit), all.length > limit);
  } catch (error) {
    console.warn("Could not load flash sessions", error);
    renderFlashSessions([], false);
  }
}

function renderFlashSessions(sessions, hasMore) {
  if (!sessions.length) {
    els.flashRecentSessions.innerHTML = `<p class="empty-state">No sessions in this range.</p>`;
    els.flashLoadMoreSessionsButton.hidden = true;
    return;
  }
  const groups = groupSessionsByDay(sessions);
  els.flashRecentSessions.innerHTML = groups.map(group => `
    <div class="session-day-header">${group.label}</div>
    ${group.items.map(session => `
      <div class="session-row">
        <div>
          <strong>${formatTimeOnly(session.started_at)}</strong>
          <span>${session.checks || 0} rounds · ${formatCards(session.avg_cards)} avg</span>
        </div>
        <div>
          <strong>${session.checks ? `${formatPercent(session.accuracy)}%` : "—"}</strong>
          <span>${session.checks ? `${formatNumber(session.avg_error)} avg err · ${formatMs(session.avg_response_ms)}` : "No rounds yet"}</span>
        </div>
      </div>
    `).join("")}
  `).join("");
  els.flashLoadMoreSessionsButton.hidden = !hasMore;
}

async function resetFlashAnalyticsData() {
  if (!state.analytics.serverAvailable) return;
  const confirmed = window.confirm("Delete all recorded Flash Count data? This cannot be undone.");
  if (!confirmed) return;
  try {
    await apiRequest("/api/analytics/flash", { method: "DELETE" });
    loadFlashAnalyticsDashboard();
    refreshFlashStats();
  } catch (error) {
    console.warn("Could not reset flash analytics", error);
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

function formatMinSec(ms) {
  const number = Number(ms);
  if (!Number.isFinite(number) || number <= 0) return "0m 0s";
  const totalSeconds = Math.round(number / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatDuration(ms) {
  const number = Number(ms);
  if (!Number.isFinite(number) || number <= 0) return "0m";
  const totalSeconds = Math.round(number / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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

function renderPlayingCard(card, faceUp = card?.visible !== false) {
  if (!faceUp || !card) return `<div class="card back" aria-label="Face-down card"></div>`;
  const red = redSuits.has(card.suit) ? " red" : "";
  const symbol = suitSymbols[card.suit];
  return `
    <div class="card${red}" aria-label="${card.rank} of ${card.suit}">
      <span class="rank corner"><span>${card.rank}</span><span>${symbol}</span></span>
      <span class="pip">${symbol}</span>
      <span class="rank bottom-rank corner"><span>${card.rank}</span><span>${symbol}</span></span>
    </div>
  `;
}

async function initStrategyData() {
  els.strategyCellActionSelect.innerHTML = strategyActions.map(action => `
    <option value="${action}">${strategyActionLabels[action]}</option>
  `).join("");
  try {
    const data = await apiRequest("/api/strategy");
    state.strategy.serverAvailable = true;
    applyStrategyData(data);
  } catch (error) {
    console.warn("Strategy data unavailable", error);
    state.strategy.serverAvailable = false;
    state.strategy.feedback = "Start the local server to load strategy profiles.";
  }
}

function applyStrategyData(data) {
  state.strategy.profiles = data.profiles || [];
  state.strategy.charts = data.charts || [];
  state.strategy.subsets = data.subsets || [];
  if (!state.strategy.selectedProfileId || !currentStrategyProfile()) {
    state.strategy.selectedProfileId = state.strategy.profiles[0]?.id || null;
  }
  const profileCharts = chartsForCurrentProfile();
  if (!state.strategy.selectedChartId || !profileCharts.some(chart => chart.id === state.strategy.selectedChartId)) {
    state.strategy.selectedChartId = profileCharts[0]?.id || state.strategy.charts[0]?.id || null;
  }
  const subsets = subsetsForCurrentChart();
  if (!state.strategy.selectedSubsetId || !subsets.some(subset => subset.id === state.strategy.selectedSubsetId)) {
    state.strategy.selectedSubsetId = subsets[0]?.id || null;
  }
  state.strategy.highlightCriteria = cloneCriteria(currentStrategySubset()?.criteria || defaultStrategyCriteria());
  renderStrategySetup();
}

function currentStrategyProfile() {
  return state.strategy.profiles.find(profile => profile.id === state.strategy.selectedProfileId) || null;
}

function currentStrategyChart() {
  return state.strategy.charts.find(chart => chart.id === state.strategy.selectedChartId) || null;
}

function currentStrategySubset() {
  return state.strategy.subsets.find(subset => subset.id === state.strategy.selectedSubsetId) || null;
}

function chartsForCurrentProfile() {
  return state.strategy.charts.filter(chart => chart.ruleProfileId === state.strategy.selectedProfileId);
}

function subsetsForCurrentChart() {
  const chartId = state.strategy.selectedChartId;
  return state.strategy.subsets.filter(subset => subset.chartId === chartId || subset.isDefault);
}

function defaultStrategyCriteria() {
  return { categories: ["hard", "soft", "pair"], dealerUpcards: [...strategyDealerUpcards], rows: [], cells: [] };
}

function cloneCriteria(criteria) {
  return {
    categories: [...(criteria?.categories || ["hard", "soft", "pair"])],
    dealerUpcards: [...(criteria?.dealerUpcards || strategyDealerUpcards)],
    rows: [...(criteria?.rows || [])],
    cells: [...(criteria?.cells || [])]
  };
}

function renderStrategySetup() {
  renderStrategySelects();
  syncStrategyRulesForm();
  renderStrategyRulesSummary();
  renderStrategyDrill();
  if (els.strategyPanel.classList.contains("open")) renderStrategyChartEditor();
}

function renderStrategySelects() {
  els.strategyRuleProfileSelect.innerHTML = state.strategy.profiles.map(profile => `
    <option value="${profile.id}" ${profile.id === state.strategy.selectedProfileId ? "selected" : ""}>${escapeHtml(profile.name)}</option>
  `).join("");
  const charts = chartsForCurrentProfile();
  els.strategyChartSelect.innerHTML = charts.length
    ? charts.map(chart => `<option value="${chart.id}" ${chart.id === state.strategy.selectedChartId ? "selected" : ""}>${escapeHtml(chart.name)}</option>`).join("")
    : `<option value="">No chart for this profile</option>`;
  const subsets = subsetsForCurrentChart();
  els.strategySubsetSelect.innerHTML = subsets.length
    ? subsets.map(subset => `<option value="${subset.id}" ${subset.id === state.strategy.selectedSubsetId ? "selected" : ""}>${escapeHtml(subset.name)}</option>`).join("")
    : `<option value="">No subsets</option>`;
  els.strategyNewHandButton.disabled = !currentStrategyChart();
}

function handleStrategyProfileChange() {
  state.strategy.selectedProfileId = Number(els.strategyRuleProfileSelect.value) || null;
  const charts = chartsForCurrentProfile();
  state.strategy.selectedChartId = charts[0]?.id || null;
  state.strategy.selectedSubsetId = subsetsForCurrentChart()[0]?.id || null;
  state.strategy.highlightCriteria = cloneCriteria(currentStrategySubset()?.criteria || defaultStrategyCriteria());
  state.strategy.playerHand = [];
  renderStrategySetup();
  dealStrategyPrompt();
}

function handleStrategyChartChange() {
  state.strategy.selectedChartId = Number(els.strategyChartSelect.value) || null;
  state.strategy.selectedSubsetId = subsetsForCurrentChart()[0]?.id || null;
  state.strategy.highlightCriteria = cloneCriteria(currentStrategySubset()?.criteria || defaultStrategyCriteria());
  state.strategy.playerHand = [];
  renderStrategySetup();
  dealStrategyPrompt();
}

function handleStrategySubsetChange() {
  state.strategy.selectedSubsetId = Number(els.strategySubsetSelect.value) || null;
  state.strategy.highlightCriteria = cloneCriteria(currentStrategySubset()?.criteria || defaultStrategyCriteria());
  renderStrategySetup();
  dealStrategyPrompt();
}

function renderStrategyRulesSummary() {
  const profile = currentStrategyProfile();
  if (!profile) {
    els.strategyRulesSummary.textContent = "No rule profile loaded.";
    return;
  }
  const rules = normalizedStrategyRules(profile.rules);
  const chips = [
    `${rules.decks} decks`,
    rules.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands soft 17",
    `Blackjack pays ${rules.blackjackPayout}`,
    doubleRuleLabel(rules.doubleRule),
    rules.doubleAfterSplit ? "Double after split" : "No double after split",
    surrenderLabel(rules.surrender),
    `Maximum split hands ${rules.maxSplitHands}`,
    rules.resplitAces ? "Resplit aces" : "No resplit aces",
    rules.hitSplitAces ? "Hit split aces" : "No hit split aces",
    rules.insurance ? "Insurance" : "No insurance"
  ];
  els.strategyRulesSummary.innerHTML = chips.map(chip => `<span>${escapeHtml(chip)}</span>`).join("");
}

function formatStrategyRuleName(rules) {
  const normalized = normalizedStrategyRules(rules);
  return [
    `${normalized.decks} ${normalized.decks === 1 ? "deck" : "decks"}`,
    normalized.dealerHitsSoft17 ? "dealer hits soft 17" : "dealer stands soft 17",
    normalized.doubleAfterSplit ? "double after split" : "no double after split",
    surrenderLabel(normalized.surrender).toLowerCase()
  ].join(", ");
}

function findMatchingStrategyProfile(rules) {
  const signature = strategyRuleSignature(rules);
  return state.strategy.profiles.find(profile => strategyRuleSignature(profile.rules) === signature) || null;
}

function strategyRuleSignature(rules) {
  const normalized = normalizedStrategyRules(rules);
  return JSON.stringify({
    decks: normalized.decks,
    dealerHitsSoft17: normalized.dealerHitsSoft17,
    blackjackPayout: normalized.blackjackPayout,
    doubleRule: normalized.doubleRule,
    doubleAfterSplit: normalized.doubleAfterSplit,
    surrender: normalized.surrender,
    maxSplitHands: normalized.maxSplitHands,
    resplitAces: normalized.resplitAces,
    hitSplitAces: normalized.hitSplitAces,
    oneCardSplitAces: normalized.oneCardSplitAces,
    insurance: normalized.insurance,
    splitTensByValue: normalized.splitTensByValue,
    customRules: normalized.customRules
  });
}

function doubleRuleLabel(rule) {
  return ({ anyTwo: "Double any two", hardOnly: "Double hard only", nineToEleven: "Double 9-11", tenToEleven: "Double 10-11", none: "No double" })[rule] || "Double custom";
}

function surrenderLabel(rule) {
  return ({ none: "No surrender", late: "Late surrender", early: "Early surrender" })[rule] || "Surrender custom";
}

function normalizedStrategyRules(rules = {}) {
  return {
    decks: Number(rules.decks) || 6,
    dealerHitsSoft17: rules.dealerHitsSoft17 !== false,
    dealerPeek: rules.dealerPeek !== false,
    dealerHoleCard: rules.dealerHoleCard !== false,
    blackjackPayout: rules.blackjackPayout || "3:2",
    doubleRule: rules.doubleRule || "anyTwo",
    doubleAfterSplit: rules.doubleAfterSplit !== false,
    surrender: rules.surrender || "none",
    maxSplitHands: Math.max(1, Number(rules.maxSplitHands) || 4),
    resplitAces: Boolean(rules.resplitAces),
    hitSplitAces: Boolean(rules.hitSplitAces),
    oneCardSplitAces: rules.oneCardSplitAces !== false,
    insurance: rules.insurance !== false,
    splitTensByValue: Boolean(rules.splitTensByValue),
    customRules: rules.customRules || {}
  };
}

function syncStrategyRulesForm() {
  const profile = currentStrategyProfile();
  if (!profile) return;
  const rules = normalizedStrategyRules(profile.rules);
  els.strategyRuleDecks.value = String(rules.decks);
  els.strategyRuleSoft17.value = String(rules.dealerHitsSoft17);
  els.strategyRulePeek.value = String(rules.dealerPeek);
  els.strategyRuleHoleCard.value = String(rules.dealerHoleCard);
  els.strategyRulePayout.value = rules.blackjackPayout;
  els.strategyRuleDouble.value = rules.doubleRule;
  els.strategyRuleSurrender.value = rules.surrender;
  els.strategyRuleMaxSplitHands.value = String(rules.maxSplitHands);
  els.strategyRuleDAS.checked = rules.doubleAfterSplit;
  els.strategyRuleResplitAces.checked = rules.resplitAces;
  els.strategyRuleHitSplitAces.checked = rules.hitSplitAces;
  els.strategyRuleOneCardAces.checked = rules.oneCardSplitAces;
  els.strategyRuleInsurance.checked = rules.insurance;
  els.strategyRuleSplitTensByValue.checked = rules.splitTensByValue;
  els.strategyRuleCustomJson.value = JSON.stringify(rules.customRules || {}, null, 2);
}

function collectStrategyRulesForm() {
  let customRules = {};
  try {
    customRules = els.strategyRuleCustomJson.value.trim() ? JSON.parse(els.strategyRuleCustomJson.value) : {};
  } catch {
    throw new Error("Custom rule notes must be valid JSON.");
  }
  const rules = {
      decks: Number(els.strategyRuleDecks.value),
      dealerHitsSoft17: els.strategyRuleSoft17.value === "true",
      dealerPeek: els.strategyRulePeek.value === "true",
      dealerHoleCard: els.strategyRuleHoleCard.value === "true",
      blackjackPayout: els.strategyRulePayout.value,
      doubleRule: els.strategyRuleDouble.value,
      doubleAfterSplit: els.strategyRuleDAS.checked,
      surrender: els.strategyRuleSurrender.value,
      maxSplitHands: Number(els.strategyRuleMaxSplitHands.value),
      resplitAces: els.strategyRuleResplitAces.checked,
      hitSplitAces: els.strategyRuleHitSplitAces.checked,
      oneCardSplitAces: els.strategyRuleOneCardAces.checked,
      insurance: els.strategyRuleInsurance.checked,
      splitTensByValue: els.strategyRuleSplitTensByValue.checked,
      customRules
  };
  return { name: formatStrategyRuleName(rules), rules };
}

async function saveStrategyRules() {
  const profile = currentStrategyProfile();
  if (!profile) return;
  try {
    const body = collectStrategyRulesForm();
    const data = await apiRequest(`/api/strategy/rule-profiles/${profile.id}`, { method: "PATCH", body });
    applyStrategyData(data);
    state.strategy.selectedProfileId = profile.id;
    state.strategy.feedback = "Rules saved.";
    renderStrategyDrill();
  } catch (error) {
    state.strategy.feedback = error.message || "Could not save rules.";
    renderStrategyDrill();
  }
}

async function createStrategyProfile() {
  try {
    const currentChart = currentStrategyChart();
    const body = collectStrategyRulesForm();
    const existing = findMatchingStrategyProfile(body.rules);
    if (existing) {
      state.strategy.selectedProfileId = existing.id;
      const charts = chartsForCurrentProfile();
      state.strategy.selectedChartId = charts[0]?.id || state.strategy.selectedChartId;
      state.strategy.selectedSubsetId = subsetsForCurrentChart()[0]?.id || state.strategy.selectedSubsetId;
      state.strategy.highlightCriteria = cloneCriteria(currentStrategySubset()?.criteria || defaultStrategyCriteria());
      renderStrategySetup();
      dealStrategyPrompt();
      return;
    }
    const data = await apiRequest("/api/strategy/rule-profiles", { method: "POST", body });
    const profileId = data.id;
    const chartData = await apiRequest("/api/strategy/charts", {
      method: "POST",
      body: {
        ruleProfileId: profileId,
        cloneFromChartId: currentChart?.id,
        name: currentChart ? `${currentChart.name} copy` : "Default strategy"
      }
    });
    applyStrategyData(chartData);
    state.strategy.selectedProfileId = profileId;
    state.strategy.selectedChartId = chartData.id;
    renderStrategySetup();
    dealStrategyPrompt();
  } catch (error) {
    state.strategy.feedback = error.message || "Could not create profile.";
    renderStrategyDrill();
  }
}

function toggleStrategyRules(open) {
  els.strategyRulesPanel.hidden = false;
  els.strategyRulesPanel.classList.toggle("open", open);
  els.strategyRulesPanel.setAttribute("aria-hidden", String(!open));
  if (open) syncStrategyRulesForm();
  else setTimeout(() => {
    if (!els.strategyRulesPanel.classList.contains("open")) els.strategyRulesPanel.hidden = true;
  }, 180);
}

function openStrategyPanel(mode) {
  state.strategy.panelMode = mode;
  els.strategyPanelTitle.textContent = mode === "edit" ? "Edit Strategy" : "Review Strategy";
  els.strategyPanel.classList.toggle("is-review", mode === "review");
  els.strategyPanel.classList.toggle("is-edit", mode === "edit");
  toggleStrategyPanel(true);
}

function toggleStrategyPanel(open) {
  els.strategyPanel.hidden = false;
  els.strategyPanel.classList.toggle("open", open);
  els.strategyPanel.setAttribute("aria-hidden", String(!open));
  if (open) renderStrategyChartEditor();
  else setTimeout(() => {
    if (!els.strategyPanel.classList.contains("open")) els.strategyPanel.hidden = true;
  }, 180);
}

function renderStrategyChartEditor() {
  const chart = currentStrategyChart();
  if (!chart) {
    els.strategyChartEditor.innerHTML = `<p class="empty-state">No strategy chart loaded.</p>`;
    return;
  }
  els.strategyChartName.value = chart.name || "";
  const criteria = state.strategy.highlightCriteria || defaultStrategyCriteria();
  const sections = strategyChartSections();
  if (state.strategy.panelMode === "review") {
    renderCompactStrategyReview(chart, criteria, sections);
    return;
  }
  els.strategyChartEditor.classList.remove("is-compact-review");
  els.strategyChartEditor.innerHTML = sections.map(([category, title, rows]) => `
    <section class="strategy-chart-section">
      <div class="section-title">
        <h3>${title}</h3>
        <button type="button" class="strategy-row-toggle ${criteria.categories.includes(category) && !criteria.cells.length ? "is-included" : ""}" data-strategy-category="${category}">${criteria.categories.includes(category) ? "Included" : "Include"}</button>
      </div>
      <div class="strategy-table-wrap">
        <table class="strategy-table" data-category="${category}">
          <thead>
            <tr>
              <th>Hand</th>
              ${strategyDealerUpcards.map(dealer => `<th><button type="button" class="strategy-column-toggle ${criteria.dealerUpcards.includes(dealer) && !criteria.cells.length ? "is-included" : ""}" data-strategy-dealer="${dealer}">${dealer}</button></th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <th><button type="button" class="strategy-row-toggle ${isStrategyRowIncluded(criteria, category, row.key) ? "is-included" : ""}" data-strategy-row="${category}:${row.key}">${row.label}</button></th>
                ${strategyDealerUpcards.map(dealer => strategyCellHtml(chart.chart, criteria, category, row.key, dealer)).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `).join("");
  els.strategyChartEditor.onclick = handleStrategyChartClick;
}

function strategyChartSections() {
  return [
    ["hard", "Hard Totals", strategyHardRows()],
    ["soft", "Soft Totals", strategySoftRows()],
    ["pair", "Pairs", strategyPairRows()]
  ];
}

function renderCompactStrategyReview(chart, criteria, sections) {
  const hard = sections.find(([category]) => category === "hard");
  const soft = sections.find(([category]) => category === "soft");
  const pair = sections.find(([category]) => category === "pair");
  els.strategyChartEditor.classList.add("is-compact-review");
  els.strategyChartEditor.innerHTML = `
    <div class="strategy-review-layout">
      <div class="strategy-review-main-chart">
        ${compactStrategyTableHtml(chart.chart, criteria, hard)}
      </div>
      <div class="strategy-review-chart-stack">
        ${compactStrategyTableHtml(chart.chart, criteria, soft)}
        ${compactStrategyTableHtml(chart.chart, criteria, pair)}
      </div>
    </div>
    <div class="strategy-review-footer">
      <section>
        <h3>Actions</h3>
        <div class="strategy-action-legend" aria-label="Strategy abbreviations">
          ${strategyActions.map(action => `<span class="strategy-legend-chip action-${action}"><strong>${strategyActionAbbreviations[action]}</strong>${strategyActionLabels[action]}</span>`).join("")}
        </div>
      </section>
      <section>
        <h3>Practice Include</h3>
        <p>Crossed-out cells are excluded from the drill. Click rows, columns, sections, or cells to adjust the current subset.</p>
      </section>
    </div>
  `;
  els.strategyChartEditor.onclick = handleStrategyChartClick;
}

function compactStrategyTableHtml(chart, criteria, section) {
  if (!section) return "";
  const [category, title, rows] = section;
  return `
    <div class="strategy-table-wrap compact-strategy-table-wrap">
      <table class="strategy-table compact-strategy-table" data-category="${category}">
        <thead>
          <tr class="strategy-section-row">
            <th colspan="${strategyDealerUpcards.length + 1}">
              <button type="button" class="strategy-row-toggle ${criteria.categories.includes(category) && !criteria.cells.length ? "is-included" : ""}" data-strategy-category="${category}">${title}</button>
            </th>
          </tr>
          <tr>
            <th>Hand</th>
            ${strategyDealerUpcards.map(dealer => `<th><button type="button" class="strategy-column-toggle ${criteria.dealerUpcards.includes(dealer) && !criteria.cells.length ? "is-included" : ""}" data-strategy-dealer="${dealer}">${dealer}</button></th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <th><button type="button" class="strategy-row-toggle ${isStrategyRowIncluded(criteria, category, row.key) ? "is-included" : ""}" data-strategy-row="${category}:${row.key}">${row.label}</button></th>
              ${strategyDealerUpcards.map(dealer => strategyCellHtml(chart, criteria, category, row.key, dealer)).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function strategyCellHtml(chart, criteria, category, rowKey, dealer) {
  const action = getStrategyCellAction(chart, category, rowKey, dealer);
  const cellId = strategyCellId(category, rowKey, dealer);
  const included = isStrategyCellIncluded(criteria, category, rowKey, dealer);
  const includedClass = included ? " is-included" : " is-excluded";
  const actionClass = action ? ` action-${action}` : "";
  const label = strategyActionAbbreviations[action] || action || "-";
  const inclusionLabel = included ? "Included in drill" : "Excluded from drill";
  return `<td><button type="button" class="strategy-cell${actionClass}${includedClass}" data-strategy-cell="${cellId}" title="${strategyActionLabels[action] || action || "Unset"} - ${inclusionLabel}">${label}</button></td>`;
}

function handleStrategyChartClick(event) {
  const cellButton = event.target.closest("[data-strategy-cell]");
  if (cellButton) {
    const cellId = cellButton.dataset.strategyCell;
    const cell = parseStrategyCellId(cellId);
    state.strategy.editingCell = cellId;
    els.strategyCellActionSelect.value = getStrategyCellAction(currentStrategyChart().chart, cell.category, cell.rowKey, cell.dealer);
    toggleStrategyCellHighlight(cell.category, cell.rowKey, cell.dealer);
    renderStrategyChartEditor();
    return;
  }
  const rowButton = event.target.closest("[data-strategy-row]");
  if (rowButton) {
    const [category, rowKey] = rowButton.dataset.strategyRow.split(":");
    toggleStrategyRowHighlight(category, rowKey);
    renderStrategyChartEditor();
    return;
  }
  const categoryButton = event.target.closest("[data-strategy-category]");
  if (categoryButton) {
    toggleArrayValue(state.strategy.highlightCriteria.categories, categoryButton.dataset.strategyCategory);
    state.strategy.highlightCriteria.cells = [];
    renderStrategyChartEditor();
    return;
  }
  const dealerButton = event.target.closest("[data-strategy-dealer]");
  if (dealerButton) {
    toggleArrayValue(state.strategy.highlightCriteria.dealerUpcards, dealerButton.dataset.strategyDealer);
    state.strategy.highlightCriteria.cells = [];
    renderStrategyChartEditor();
  }
}

function updateSelectedStrategyCell() {
  const chart = currentStrategyChart();
  const selected = state.strategy.editingCell;
  if (!chart || !selected) return;
  const cell = parseStrategyCellId(selected);
  chart.chart[cell.category] ||= {};
  chart.chart[cell.category][cell.rowKey] ||= {};
  chart.chart[cell.category][cell.rowKey][cell.dealer] = els.strategyCellActionSelect.value;
  renderStrategyChartEditor();
}

async function saveCurrentStrategyChart() {
  const chart = currentStrategyChart();
  if (!chart) return;
  try {
    const data = await apiRequest(`/api/strategy/charts/${chart.id}`, {
      method: "PATCH",
      body: { name: els.strategyChartName.value.trim() || chart.name, chart: chart.chart, ruleProfileId: chart.ruleProfileId }
    });
    applyStrategyData(data);
    state.strategy.feedback = "Strategy chart saved.";
    renderStrategyDrill();
  } catch (error) {
    state.strategy.feedback = error.message || "Could not save chart.";
    renderStrategyDrill();
  }
}

async function cloneCurrentStrategyChart() {
  const chart = currentStrategyChart();
  const profile = currentStrategyProfile();
  if (!chart || !profile) return;
  try {
    const data = await apiRequest("/api/strategy/charts", {
      method: "POST",
      body: { ruleProfileId: profile.id, cloneFromChartId: chart.id, name: `${chart.name} copy` }
    });
    applyStrategyData(data);
    state.strategy.selectedChartId = data.id;
    renderStrategySetup();
  } catch (error) {
    state.strategy.feedback = error.message || "Could not clone chart.";
    renderStrategyDrill();
  }
}

function clearStrategyHighlights() {
  state.strategy.highlightCriteria = defaultStrategyCriteria();
  renderStrategyChartEditor();
}

async function saveStrategySubset() {
  const chart = currentStrategyChart();
  if (!chart) return;
  try {
    const name = els.strategySubsetName.value.trim() || "Custom subset";
    const data = await apiRequest("/api/strategy/subsets", {
      method: "POST",
      body: { chartId: chart.id, name, criteria: state.strategy.highlightCriteria || defaultStrategyCriteria() }
    });
    applyStrategyData(data);
    state.strategy.selectedSubsetId = data.id;
    renderStrategySetup();
  } catch (error) {
    state.strategy.feedback = error.message || "Could not save subset.";
    renderStrategyDrill();
  }
}

function toggleStrategyCellHighlight(category, rowKey, dealer) {
  const criteria = state.strategy.highlightCriteria ||= defaultStrategyCriteria();
  const cellId = strategyCellId(category, rowKey, dealer);
  criteria.cells ||= [];
  toggleArrayValue(criteria.cells, cellId);
}

function toggleStrategyRowHighlight(category, rowKey) {
  const criteria = state.strategy.highlightCriteria ||= defaultStrategyCriteria();
  criteria.rows ||= [];
  criteria.cells = [];
  toggleArrayValue(criteria.rows, `${category}:${rowKey}`);
}

function toggleArrayValue(values, value) {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
  else values.push(value);
}

function isStrategyCellIncluded(criteria, category, rowKey, dealer) {
  if ((criteria.cells || []).length) return criteria.cells.includes(strategyCellId(category, rowKey, dealer));
  const rowMatch = !(criteria.rows || []).length || criteria.rows.includes(`${category}:${rowKey}`);
  return (criteria.categories || []).includes(category) && (criteria.dealerUpcards || []).includes(dealer) && rowMatch;
}

function isStrategyRowIncluded(criteria, category, rowKey) {
  if ((criteria.cells || []).length) return strategyDealerUpcards.some(dealer => criteria.cells.includes(strategyCellId(category, rowKey, dealer)));
  return (criteria.categories || []).includes(category) && (!(criteria.rows || []).length || criteria.rows.includes(`${category}:${rowKey}`));
}

function strategyCellId(category, rowKey, dealer) {
  return `${category}:${rowKey}:${dealer}`;
}

function parseStrategyCellId(id) {
  const [category, rowKey, dealer] = id.split(":");
  return { category, rowKey, dealer };
}

function strategyHardRows() {
  const rows = [];
  for (let total = 4; total <= 21; total += 1) rows.push({ key: `h${total}`, label: String(total) });
  return rows;
}

function strategySoftRows() {
  const rows = [];
  for (let total = 13; total <= 21; total += 1) rows.push({ key: `s${total}`, label: `A,${total - 11}` });
  return rows;
}

function strategyPairRows() {
  return ["A", "10", "9", "8", "7", "6", "5", "4", "3", "2"].map(rank => ({ key: `p${rank}`, label: `${rank},${rank}` }));
}

function dealStrategyPrompt() {
  const chart = currentStrategyChart();
  if (!chart) {
    state.strategy.feedback = state.strategy.serverAvailable ? "Create or select a strategy chart first." : "Strategy database unavailable.";
    renderStrategyDrill();
    return;
  }
  state.strategy.insuranceResolved = false;
  const cell = randomStrategyPracticeCell();
  if (!cell) {
    state.strategy.feedback = "No legal starting hands match this subset and chart. Adjust the highlighted cells.";
    renderStrategyDrill();
    return;
  }
  const playerHand = cardsForStrategyRow(cell.category, cell.rowKey);
  const dealerUpcard = makeStrategyCard(cell.dealer, true);
  const dealerHole = makeStrategyCard(randomRank(), false);
  state.strategy.handNumber += 1;
  state.strategy.playerHand = playerHand;
  state.strategy.dealerHand = [dealerUpcard, dealerHole];
  state.strategy.feedback = "";
  state.strategy.feedbackType = "neutral";
  state.strategy.promptOpenedAt = Date.now();
  renderStrategyDrill();
}

function randomStrategyPracticeCell() {
  const chart = currentStrategyChart()?.chart;
  const rules = normalizedStrategyRules(currentStrategyProfile()?.rules);
  const criteria = state.strategy.highlightCriteria || currentStrategySubset()?.criteria || defaultStrategyCriteria();
  const cells = [];
  for (const category of ["pair", "soft", "hard"]) {
    const rows = category === "pair" ? strategyPairRows() : category === "soft" ? strategySoftRows() : strategyHardRows();
    for (const row of rows) {
      if (!isLegalStartingStrategyRow(category, row.key)) continue;
      for (const dealer of strategyDealerUpcards) {
        const action = getStrategyCellAction(chart, category, row.key, dealer);
        if (!action) continue;
        const sampleHand = sampleCardsForStrategyRow(category, row.key);
        if (!isStrategyActionLegal(action, rules, sampleHand, dealer)) continue;
        if (isStrategyCellIncluded(criteria, category, row.key, dealer)) cells.push({ category, rowKey: row.key, dealer });
      }
    }
  }
  return cells[Math.floor(Math.random() * cells.length)] || null;
}

function isLegalStartingStrategyRow(category, rowKey) {
  if (category === "pair") return true;
  if (category === "soft") return Number(rowKey.slice(1)) < 21;
  return Boolean(hardStartingCombos(Number(rowKey.slice(1))).length);
}

function sampleCardsForStrategyRow(category, rowKey) {
  if (category === "pair") {
    const rank = rowKey.slice(1);
    return [{ rank, suit: "spades", visible: true }, { rank, suit: "clubs", visible: true }];
  }
  if (category === "soft") {
    return [{ rank: "A", suit: "spades", visible: true }, { rank: String(Number(rowKey.slice(1)) - 11), suit: "clubs", visible: true }];
  }
  const combo = hardStartingCombos(Number(rowKey.slice(1)))[0] || ["10", "6"];
  return [{ rank: combo[0], suit: "spades", visible: true }, { rank: combo[1], suit: "clubs", visible: true }];
}

function cardsForStrategyRow(category, rowKey) {
  if (category === "pair") {
    const rank = rowKey.slice(1);
    return [makeStrategyCard(rank, true), makeStrategyCard(rank, true)];
  }
  if (category === "soft") {
    return [makeStrategyCard("A", true), makeStrategyCard(String(Number(rowKey.slice(1)) - 11), true)];
  }
  const combos = hardStartingCombos(Number(rowKey.slice(1)));
  const combo = combos[Math.floor(Math.random() * combos.length)] || ["10", "6"];
  return [makeStrategyCard(combo[0], true), makeStrategyCard(combo[1], true)];
}

function hardStartingCombos(total) {
  const rankPool = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const combos = [];
  for (const first of rankPool) {
    for (const second of rankPool) {
      if (first === second) continue;
      if (rankBlackjackValue(first) + rankBlackjackValue(second) === total) combos.push([first, second]);
    }
  }
  return combos;
}

function makeStrategyCard(rank, visible) {
  const suit = suits[Math.floor(Math.random() * suits.length)];
  cardSerial += 1;
  return { rank, suit, visible, counted: false, id: `strategy-${rank}-${suit}-${cardSerial}` };
}

function randomRank() {
  return ranks[Math.floor(Math.random() * ranks.length)];
}

function renderStrategyDrill() {
  renderStrategyRulesSummary();
  renderStrategySeat(els.strategyDealerSeat, "Dealer", state.strategy.dealerHand);
  renderStrategySeat(els.strategyPlayerSeat, "You", state.strategy.playerHand);
  const decision = currentStrategyDecision();
  const rules = normalizedStrategyRules(currentStrategyProfile()?.rules);
  state.strategy.currentDecision = decision;
  renderStrategyTableSignage(rules);
  for (const button of els.strategyActionControls.querySelectorAll("[data-strategy-action]")) {
    const action = button.dataset.strategyAction;
    const legal = decision ? isStrategyActionLegal(action, rules, state.strategy.playerHand, decision.dealer) : false;
    button.disabled = !legal;
    button.classList.toggle("is-expected", decision?.expectedAction === action);
    button.title = legal ? `${strategyActionLabels[action]} (${button.querySelector("kbd")?.textContent || ""})` : `${strategyActionLabels[action]} is not available under these rules`;
  }
}

function renderStrategyTableSignage(rules) {
  const insuranceText = rules.insurance ? "Insurance pays" : "Insurance";
  const insuranceValue = rules.insurance ? "2:1" : "Not offered";
  els.strategyPromptMeta.innerHTML = `
    <span>Blackjack pays <strong>${escapeHtml(rules.blackjackPayout)}</strong></span>
    <span>${insuranceText} <strong>${insuranceValue}</strong></span>
  `;
}

function renderStrategySeat(container, name, hand) {
  container.innerHTML = `
    <div class="seat-label"><span>${name}</span></div>
    <div class="hand">${(hand || []).map(card => renderPlayingCard(card, card.visible)).join("")}</div>
  `;
}

function currentStrategyDecision() {
  const chart = currentStrategyChart()?.chart;
  const dealer = normalizeDealerRank(state.strategy.dealerHand[0]?.rank);
  if (!chart || !dealer || !state.strategy.playerHand.length) return null;
  const classified = classifyStrategyHand(state.strategy.playerHand, normalizedStrategyRules(currentStrategyProfile()?.rules));
  if (!classified || classified.total > 21) return null;
  const expectedAction = getStrategyCellAction(chart, classified.category, classified.rowKey, dealer) || "stand";
  return { ...classified, dealer, expectedAction };
}

function classifyStrategyHand(hand, rules) {
  const value = handValue(hand);
  if (value.total > 21) return { category: "hard", rowKey: "bust", label: "Bust", total: value.total };
  if (hand.length === 2 && isStrategyPair(hand, rules)) {
    const rank = normalizePairRank(hand[0].rank);
    return { category: "pair", rowKey: `p${rank}`, label: `${rank},${rank}`, total: value.total };
  }
  if (value.soft) {
    return { category: "soft", rowKey: `s${value.total}`, label: `Soft ${value.total}`, total: value.total };
  }
  return { category: "hard", rowKey: `h${value.total}`, label: `Hard ${value.total}`, total: value.total };
}

function getStrategyCellAction(chart, category, rowKey, dealer) {
  return chart?.[category]?.[rowKey]?.[dealer] || null;
}

function submitStrategyAction(action) {
  const decision = currentStrategyDecision();
  if (!decision) return;
  const correct = action === decision.expectedAction;
  recordStrategyAttempt(action, decision, correct);
  if (!correct) {
    state.strategy.feedback = "Incorrect. Try again.";
    state.strategy.feedbackType = "incorrect";
    renderStrategyDrill();
    return;
  }
  applyCorrectStrategyAction(action, decision);
}

function applyCorrectStrategyAction(action, decision) {
  if (action === "hit") {
    state.strategy.playerHand.push(makeStrategyCard(randomRank(), true));
    const value = handValue(state.strategy.playerHand);
    if (value.total > 21) {
      state.strategy.feedback = "Correct. Bust.";
      state.strategy.feedbackType = "correct";
      renderStrategyDrill();
      setTimeout(dealStrategyPrompt, 650);
      return;
    }
    if (value.total === 21) {
      state.strategy.feedback = "Correct. 21.";
      state.strategy.feedbackType = "correct";
      renderStrategyDrill();
      setTimeout(dealStrategyPrompt, 650);
      return;
    }
    state.strategy.feedback = "";
    state.strategy.feedbackType = "correct";
    state.strategy.promptOpenedAt = Date.now();
    renderStrategyDrill();
    return;
  }
  if (action === "double") state.strategy.playerHand.push(makeStrategyCard(randomRank(), true));
  state.strategy.feedback = `Correct: ${strategyActionLabels[action]}.`;
  state.strategy.feedbackType = "correct";
  renderStrategyDrill();
  setTimeout(dealStrategyPrompt, 650);
}

function recordStrategyAttempt(action, decision, correct) {
  if (!state.strategy.serverAvailable) return;
  apiRequest("/api/events/strategy-attempt", {
    method: "POST",
    body: {
      ruleProfileId: state.strategy.selectedProfileId,
      chartId: state.strategy.selectedChartId,
      subsetId: state.strategy.selectedSubsetId,
      handNumber: state.strategy.handNumber,
      category: decision.category,
      rowKey: decision.rowKey,
      dealerUpcard: decision.dealer,
      playerCards: state.strategy.playerHand.map(card => ({ rank: card.rank, suit: card.suit })),
      action,
      expectedAction: decision.expectedAction,
      correct,
      responseTimeMs: Date.now() - (state.strategy.promptOpenedAt || Date.now())
    }
  }).catch(error => console.warn("Could not record strategy attempt", error));
}

function isStrategyActionLegal(action, rules, hand, dealer) {
  const value = handValue(hand);
  if (value.total > 21) return false;
  if (action === "hit") return value.total < 21;
  if (action === "stand") return value.total <= 21;
  if (action === "surrender") return hand.length === 2 && rules.surrender !== "none";
  if (action === "insurance") return dealer === "A" && rules.insurance && !state.strategy.insuranceResolved;
  if (action === "split") return hand.length === 2 && rules.maxSplitHands > 1 && isStrategyPair(hand, rules);
  if (action === "double") return hand.length === 2 && strategyDoubleAllowed(rules, hand);
  return false;
}

function strategyDoubleAllowed(rules, hand) {
  if (rules.doubleRule === "none") return false;
  const value = handValue(hand);
  if (rules.doubleRule === "anyTwo") return true;
  if (rules.doubleRule === "hardOnly") return !value.soft;
  if (rules.doubleRule === "nineToEleven") return [9, 10, 11].includes(value.total);
  if (rules.doubleRule === "tenToEleven") return [10, 11].includes(value.total);
  return true;
}

function isStrategyPair(hand, rules) {
  if (hand.length !== 2) return false;
  const first = normalizePairRank(hand[0].rank);
  const second = normalizePairRank(hand[1].rank);
  if (rules.splitTensByValue && first === "10" && second === "10") return true;
  return hand[0].rank === hand[1].rank;
}

function normalizePairRank(rank) {
  return ["10", "J", "Q", "K"].includes(rank) ? "10" : rank;
}

function normalizeDealerRank(rank) {
  return ["10", "J", "Q", "K"].includes(rank) ? "10" : rank;
}

function rankBlackjackValue(rank) {
  if (rank === "A") return 11;
  if (["10", "J", "Q", "K"].includes(rank)) return 10;
  return Number(rank);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
