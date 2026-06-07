import { Router } from "express";
import { insert, update } from "../db/client.js";
import { cardGroup } from "../services/metrics.js";
import { nowIso } from "../util.js";

export const eventsRouter = Router();

eventsRouter.post("/events/strategy-attempt", (req, res) => {
  const body = req.body || {};
  const row = insert("strategy_attempts", {
    rule_profile_id: body.ruleProfileId,
    chart_id: body.chartId,
    subset_id: body.subsetId,
    hand_number: body.handNumber,
    category: body.category,
    row_key: body.rowKey,
    dealer_upcard: body.dealerUpcard,
    player_cards_json: JSON.stringify(body.playerCards || []),
    action: body.action,
    expected_action: body.expectedAction,
    correct: body.correct ? 1 : 0,
    response_time_ms: body.responseTimeMs
  });
  res.status(201).json({ id: row.id });
});

eventsRouter.post("/events/shoe-started", (req, res) => {
  const body = req.body || {};
  const settings = body.settings || {};
  const row = insert("shoes", {
    session_id: body.sessionId,
    number_of_decks: settings.numberOfDecks,
    penetration_percent: settings.penetrationPercent,
    dealer_hits_soft_17: settings.dealerHitsSoft17 ? 1 : 0,
    dealer_peek: settings.dealerPeek ? 1 : 0,
    blackjack_payout: settings.blackjackPayout,
    number_of_other_players: settings.numberOfOtherPlayers,
    shoe_display_mode: settings.shoeDisplayMode,
    count_check_mode: settings.countCheckMode,
    dealer_speed: settings.dealerSpeed,
    settings_json: JSON.stringify(settings)
  });
  res.status(201).json({ id: row.id });
});

eventsRouter.patch("/events/shoe-ended", (req, res) => {
  const body = req.body || {};
  update("shoes", body.shoeId, {
    ended_at: nowIso(),
    cards_dealt: body.cardsDealt,
    cut_card_reached: body.cutCardReached ? 1 : 0,
    final_running_count: body.finalRunningCount
  });
  res.status(200).json({ ok: true });
});

eventsRouter.post("/events/hand-completed", (req, res) => {
  const body = req.body || {};
  const row = insert("hands", {
    session_id: body.sessionId,
    shoe_id: body.shoeId,
    hand_number: body.handNumber,
    duration_ms: body.durationMs,
    outcome: body.outcome,
    cards_dealt: body.cardsDealt,
    visible_cards_counted: body.visibleCardsCounted,
    running_count_before: body.runningCountBefore,
    running_count_after: body.runningCountAfter,
    shoe_depth_percent: body.shoeDepthPercent,
    decks_remaining: body.decksRemaining
  });
  res.status(201).json({ id: row.id });
});

eventsRouter.post("/events/card-observed", (req, res) => {
  const body = req.body || {};
  const row = insert("card_observations", {
    session_id: body.sessionId,
    shoe_id: body.shoeId,
    hand_number: body.handNumber,
    visible_order: body.visibleOrder,
    rank: body.rank,
    suit: body.suit,
    hi_lo_value: body.hiLoValue,
    running_count_after: body.runningCountAfter,
    seat_role: body.seatRole,
    seat_name: body.seatName,
    dealer_hole_reveal: body.dealerHoleReveal ? 1 : 0,
    shoe_depth_percent: body.shoeDepthPercent,
    decks_remaining: body.decksRemaining,
    number_of_other_players: body.numberOfOtherPlayers,
    shoe_display_mode: body.shoeDisplayMode,
    dealer_speed: body.dealerSpeed,
    deal_delay_ms: body.dealDelayMs,
    player_think_delay_ms: body.playerThinkDelayMs,
    dealer_think_delay_ms: body.dealerThinkDelayMs,
    count_prompt_delay_ms: body.countPromptDelayMs,
    ms_since_previous_visible_card: body.msSincePreviousVisibleCard
  });
  res.status(201).json({ id: row.id });
});

eventsRouter.post("/events/count-check-submitted", (req, res) => {
  const body = req.body || {};
  const row = insert("count_checks", {
    session_id: body.sessionId,
    shoe_id: body.shoeId,
    hand_number: body.handNumber,
    prompt_source: body.promptSource,
    correct_running_count: body.correctRunningCount,
    user_answer: body.userAnswer,
    signed_error: body.signedError,
    absolute_error: body.absoluteError,
    correct: body.correct ? 1 : 0,
    response_time_ms: body.responseTimeMs,
    cards_since_previous_check: body.cardsSincePreviousCheck,
    previous_count: body.previousCount,
    net_count_delta: body.netCountDelta,
    shoe_depth_percent: body.shoeDepthPercent,
    decks_remaining: body.decksRemaining,
    number_of_other_players: body.numberOfOtherPlayers,
    shoe_display_mode: body.shoeDisplayMode,
    count_check_mode: body.countCheckMode,
    dealer_speed: body.dealerSpeed
  });
  for (const card of body.cards || []) {
    insert("count_check_cards", {
      count_check_id: row.id,
      session_id: body.sessionId,
      shoe_id: body.shoeId,
      hand_number: body.handNumber,
      visible_order: card.visibleOrder,
      rank: card.rank,
      suit: card.suit,
      hi_lo_value: card.hiLoValue,
      card_group: cardGroup(card.hiLoValue, card.dealerHoleReveal),
      running_count_after: card.runningCountAfter,
      seat_role: card.seatRole,
      seat_name: card.seatName,
      dealer_hole_reveal: card.dealerHoleReveal ? 1 : 0,
      number_of_other_players: card.numberOfOtherPlayers,
      shoe_display_mode: card.shoeDisplayMode,
      dealer_speed: card.dealerSpeed,
      deal_delay_ms: card.dealDelayMs,
      player_think_delay_ms: card.playerThinkDelayMs,
      dealer_think_delay_ms: card.dealerThinkDelayMs,
      count_prompt_delay_ms: card.countPromptDelayMs,
      ms_since_previous_visible_card: card.msSincePreviousVisibleCard
    });
  }
  res.status(201).json({ id: row.id });
});

eventsRouter.post("/events/flash-round-submitted", (req, res) => {
  const body = req.body || {};
  const row = insert("flash_rounds", {
    session_id: body.sessionId,
    num_cards: body.numCards,
    correct_count: body.correctCount,
    user_answer: body.userAnswer,
    signed_error: body.signedError,
    absolute_error: body.absoluteError,
    correct: body.correct ? 1 : 0,
    response_time_ms: body.responseTimeMs,
    flash_duration_ms: body.flashDurationMs,
    min_cards: body.minCards,
    max_cards: body.maxCards
  });
  for (const card of body.cards || []) {
    insert("flash_round_cards", {
      flash_round_id: row.id,
      session_id: body.sessionId,
      visible_order: card.visibleOrder,
      rank: card.rank,
      suit: card.suit,
      hi_lo_value: card.hiLoValue,
      card_group: cardGroup(card.hiLoValue, false)
    });
  }
  res.status(201).json({ id: row.id });
});

eventsRouter.post("/events/deck-countdown-round-submitted", (req, res) => {
  const body = req.body || {};
  const row = insert("deck_countdown_rounds", {
    session_id: body.sessionId,
    deck_count: body.deckCount,
    total_cards: body.totalCards,
    omitted_card_count: body.omittedCardCount,
    cards_per_flip: body.cardsPerFlip,
    flip_mode: body.flipMode,
    auto_interval_ms: body.autoIntervalMs,
    stopwatch_shown: body.stopwatchShown ? 1 : 0,
    correct_count: body.correctCount,
    user_answer: body.userAnswer,
    signed_error: body.signedError,
    absolute_error: body.absoluteError,
    correct: body.correct ? 1 : 0,
    response_time_ms: body.responseTimeMs
  });
  res.status(201).json({ id: row.id });
});
