import { queryAll, runSql } from "./client.js";

const schema = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  tracking_enabled INTEGER NOT NULL DEFAULT 1,
  app_version TEXT,
  user_agent TEXT,
  initial_number_of_other_players INTEGER,
  initial_shoe_display_mode TEXT,
  settings_json TEXT
);
CREATE TABLE IF NOT EXISTS shoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  number_of_decks INTEGER,
  penetration_percent INTEGER,
  dealer_hits_soft_17 INTEGER,
  dealer_peek INTEGER,
  blackjack_payout TEXT,
  number_of_other_players INTEGER,
  shoe_display_mode TEXT,
  count_check_mode TEXT,
  dealer_speed TEXT,
  cards_dealt INTEGER DEFAULT 0,
  cut_card_reached INTEGER DEFAULT 0,
  final_running_count INTEGER DEFAULT 0,
  settings_json TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE TABLE IF NOT EXISTS hands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  shoe_id INTEGER,
  hand_number INTEGER,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_ms INTEGER,
  outcome TEXT,
  cards_dealt INTEGER,
  visible_cards_counted INTEGER,
  running_count_before INTEGER,
  running_count_after INTEGER,
  shoe_depth_percent REAL,
  decks_remaining REAL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (shoe_id) REFERENCES shoes(id)
);
CREATE TABLE IF NOT EXISTS card_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  shoe_id INTEGER,
  hand_number INTEGER,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visible_order INTEGER,
  rank TEXT,
  suit TEXT,
  hi_lo_value INTEGER,
  running_count_after INTEGER,
  seat_role TEXT,
  seat_name TEXT,
  dealer_hole_reveal INTEGER DEFAULT 0,
  shoe_depth_percent REAL,
  decks_remaining REAL,
  number_of_other_players INTEGER,
  shoe_display_mode TEXT,
  dealer_speed TEXT,
  deal_delay_ms INTEGER,
  player_think_delay_ms INTEGER,
  dealer_think_delay_ms INTEGER,
  count_prompt_delay_ms INTEGER,
  ms_since_previous_visible_card INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (shoe_id) REFERENCES shoes(id)
);
CREATE TABLE IF NOT EXISTS count_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  shoe_id INTEGER,
  hand_number INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prompt_source TEXT,
  correct_running_count INTEGER,
  user_answer INTEGER,
  signed_error INTEGER,
  absolute_error INTEGER,
  correct INTEGER,
  response_time_ms INTEGER,
  cards_since_previous_check INTEGER,
  previous_count INTEGER,
  net_count_delta INTEGER,
  shoe_depth_percent REAL,
  decks_remaining REAL,
  number_of_other_players INTEGER,
  shoe_display_mode TEXT,
  count_check_mode TEXT,
  dealer_speed TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (shoe_id) REFERENCES shoes(id)
);
CREATE TABLE IF NOT EXISTS count_check_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_check_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  shoe_id INTEGER,
  hand_number INTEGER,
  visible_order INTEGER,
  rank TEXT,
  suit TEXT,
  hi_lo_value INTEGER,
  card_group TEXT,
  running_count_after INTEGER,
  seat_role TEXT,
  seat_name TEXT,
  dealer_hole_reveal INTEGER DEFAULT 0,
  number_of_other_players INTEGER,
  shoe_display_mode TEXT,
  dealer_speed TEXT,
  deal_delay_ms INTEGER,
  player_think_delay_ms INTEGER,
  dealer_think_delay_ms INTEGER,
  count_prompt_delay_ms INTEGER,
  ms_since_previous_visible_card INTEGER,
  FOREIGN KEY (count_check_id) REFERENCES count_checks(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (shoe_id) REFERENCES shoes(id)
);
CREATE TABLE IF NOT EXISTS flash_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  num_cards INTEGER,
  correct_count INTEGER,
  user_answer INTEGER,
  signed_error INTEGER,
  absolute_error INTEGER,
  correct INTEGER,
  response_time_ms INTEGER,
  flash_duration_ms INTEGER,
  min_cards INTEGER,
  max_cards INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE TABLE IF NOT EXISTS flash_round_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flash_round_id INTEGER NOT NULL,
  session_id INTEGER,
  visible_order INTEGER,
  rank TEXT,
  suit TEXT,
  hi_lo_value INTEGER,
  card_group TEXT,
  FOREIGN KEY (flash_round_id) REFERENCES flash_rounds(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE TABLE IF NOT EXISTS strategy_rule_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL,
  rules_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_charts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_profile_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL,
  chart_json TEXT NOT NULL,
  FOREIGN KEY (rule_profile_id) REFERENCES strategy_rule_profiles(id)
);
CREATE TABLE IF NOT EXISTS strategy_subsets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL,
  criteria_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (chart_id) REFERENCES strategy_charts(id)
);
CREATE TABLE IF NOT EXISTS strategy_chart_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  simulator_run_id TEXT,
  seed TEXT,
  true_count REAL,
  artifact_path TEXT,
  source_json TEXT,
  FOREIGN KEY (chart_id) REFERENCES strategy_charts(id)
);
CREATE TABLE IF NOT EXISTS strategy_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rule_profile_id INTEGER,
  chart_id INTEGER,
  subset_id INTEGER,
  hand_number INTEGER,
  category TEXT,
  row_key TEXT,
  dealer_upcard TEXT,
  player_cards_json TEXT,
  action TEXT,
  expected_action TEXT,
  correct INTEGER,
  response_time_ms INTEGER,
  FOREIGN KEY (rule_profile_id) REFERENCES strategy_rule_profiles(id),
  FOREIGN KEY (chart_id) REFERENCES strategy_charts(id),
  FOREIGN KEY (subset_id) REFERENCES strategy_subsets(id)
);
`;

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = queryAll(`PRAGMA table_info(${table});`).map(row => row.name);
  if (!columns.includes(column)) {
    runSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

function ensureSchemaColumns(): void {
  ensureColumn("sessions", "initial_number_of_other_players", "INTEGER");
  ensureColumn("sessions", "initial_shoe_display_mode", "TEXT");
  ensureColumn("shoes", "number_of_other_players", "INTEGER");
  ensureColumn("shoes", "shoe_display_mode", "TEXT");
  ensureColumn("count_checks", "number_of_other_players", "INTEGER");
  ensureColumn("count_checks", "shoe_display_mode", "TEXT");
  for (const table of ["card_observations", "count_check_cards"]) {
    ensureColumn(table, "number_of_other_players", "INTEGER");
    ensureColumn(table, "shoe_display_mode", "TEXT");
    ensureColumn(table, "dealer_speed", "TEXT");
    ensureColumn(table, "deal_delay_ms", "INTEGER");
    ensureColumn(table, "player_think_delay_ms", "INTEGER");
    ensureColumn(table, "dealer_think_delay_ms", "INTEGER");
    ensureColumn(table, "count_prompt_delay_ms", "INTEGER");
    ensureColumn(table, "ms_since_previous_visible_card", "INTEGER");
  }
  ensureColumn("strategy_subsets", "is_default", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("strategy_attempts", "hand_number", "INTEGER");
}

export function cleanupEmptySessions(): void {
  const emptySessionWhere = `
    NOT EXISTS (SELECT 1 FROM card_observations co WHERE co.session_id = sessions.id)
    AND NOT EXISTS (SELECT 1 FROM count_checks cc WHERE cc.session_id = sessions.id)
    AND NOT EXISTS (SELECT 1 FROM hands h WHERE h.session_id = sessions.id)
    AND NOT EXISTS (SELECT 1 FROM flash_rounds fr WHERE fr.session_id = sessions.id)
  `;
  runSql(`
    DELETE FROM shoes
    WHERE session_id IN (SELECT id FROM sessions WHERE ${emptySessionWhere});
    DELETE FROM sessions WHERE ${emptySessionWhere};
  `);
}

/** Apply the schema and run column migrations. */
export function migrate(): void {
  runSql(schema);
  ensureSchemaColumns();
}
