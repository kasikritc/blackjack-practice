# Analytics Data Dictionary

This app stores one-user blackjack counting-practice analytics in local SQLite at `data/blackjack.sqlite`. The data is practice telemetry only; it is not sent to third-party analytics services.

## Tracking Control

Tracking starts on by default for each browser app session. A SQLite `sessions` row is not created at page load; it is created only when the practitioner sees the first visible card while tracking is enabled. When tracking is turned off, gameplay continues but no new sessions, shoes, hands, cards, or count checks are written until tracking is turned back on.

Sessions with visible cards but no count checks are valid and retained. They contribute to exposure and volume analytics, but accuracy and mastery metrics remain unavailable until at least one count check is submitted.

## Important Terminology

- `number_of_other_players` means the number of automated non-user player seats at the table.
- It does not include the practitioner/user seat.
- Total active table seats for non-dealer players is `number_of_other_players + 1`, because the user seat is always present.
- `shoe_display_mode` means the shoe/discard information visible to the practitioner: `decks`, `numbers`, `graphic`, or `hidden`.

## SQLite Tables

### `sessions`

One row per tracked practice session. A session starts on the first visible tracked card, not when the page loads.

Collected fields include:
- `started_at`, `ended_at`
- `tracking_enabled`
- `app_version`
- `user_agent`
- `initial_number_of_other_players`
- `initial_shoe_display_mode`
- `settings_json`

`settings_json` stores the full settings object at session start for auditability.

### `shoes`

One row per shuffled shoe.

Collected fields include:
- `session_id`
- `started_at`, `ended_at`
- `number_of_decks`
- `penetration_percent`
- `dealer_hits_soft_17`
- `dealer_peek`
- `blackjack_payout`
- `number_of_other_players`
- `shoe_display_mode`
- `count_check_mode`
- `dealer_speed`
- `cards_dealt`
- `cut_card_reached`
- `final_running_count`
- `settings_json`

The `number_of_other_players` value is the other-player count at shoe start. If table settings are applied, the app starts a new shoe.

### `hands`

One row per completed hand.

Collected fields include:
- `session_id`, `shoe_id`
- `hand_number`
- `duration_ms`
- `outcome`
- `cards_dealt`
- `visible_cards_counted`
- `running_count_before`, `running_count_after`
- `shoe_depth_percent`
- `decks_remaining`

### `card_observations`

One row per visible counted card.

Collected fields include:
- `session_id`, `shoe_id`, `hand_number`
- `visible_order`
- `rank`, `suit`
- `hi_lo_value`
- `running_count_after`
- `seat_role`, `seat_name`
- `dealer_hole_reveal`
- `shoe_depth_percent`
- `decks_remaining`
- `number_of_other_players`
- `shoe_display_mode`
- `dealer_speed`
- `deal_delay_ms`
- `player_think_delay_ms`
- `dealer_think_delay_ms`
- `count_prompt_delay_ms`
- `ms_since_previous_visible_card`

This table preserves mid-shoe setting changes at the card level, including shoe display mode and speed changes.

### `count_checks`

One row per submitted running-count quiz answer.

Collected fields include:
- `session_id`, `shoe_id`, `hand_number`
- `prompt_source`
- `correct_running_count`
- `user_answer`
- `signed_error`
- `absolute_error`
- `correct`
- `response_time_ms`
- `cards_since_previous_check`
- `previous_count`
- `net_count_delta`
- `shoe_depth_percent`
- `decks_remaining`
- `number_of_other_players`
- `shoe_display_mode`
- `count_check_mode`
- `dealer_speed`

The `number_of_other_players` and `shoe_display_mode` values are the active values at quiz submission time.

### `count_check_cards`

One row per card that belongs to a submitted count check.

Collected fields include:
- `count_check_id`
- `session_id`, `shoe_id`, `hand_number`
- `visible_order`
- `rank`, `suit`
- `hi_lo_value`
- `card_group`: `low`, `high`, `neutral`, or `dealerHole`
- `running_count_after`
- `seat_role`, `seat_name`
- `dealer_hole_reveal`
- `number_of_other_players`
- `shoe_display_mode`
- speed fields matching `card_observations`

This table is used to analyze whether errors correlate with low cards, high cards, neutral cards, dealer hole-card reveals, table size, shoe display mode, or actual deal speed.

## Dashboard Metrics

The dashboard derives:
- mastery score
- overall and recent accuracy
- average absolute error
- median and p90 response time
- correct streaks
- card/check/session/shoe volume
- error-size buckets
- likely error drivers by card group
- actual deal speed breakdown
- other-player-count breakdown
- shoe-display-mode breakdown
- shoe-depth breakdown
- count-pressure breakdown
- prompt-type breakdown
- recent session summaries

## Data Not Collected

The app does not collect:
- account identity, email, login data, or names
- real-money wagers, bankroll, financial data, or payouts
- location data
- third-party analytics or ad tracking
- audio, camera, microphone, clipboard, or unrelated keystrokes
