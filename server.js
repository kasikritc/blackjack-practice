const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "blackjack.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

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
`;

runSql(schema);
ensureSchemaColumns();
cleanupEmptySessions();

startServer(PORT);

function startServer(port) {
  const server = createHttpServer();
  server.once("error", error => {
    throw error;
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Blackjack Practice running at http://0.0.0.0:${port}`);
    console.log(`Analytics database: ${DB_PATH}`);
  });
}

function createHttpServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }
      serveStatic(req, res, url);
    } catch (error) {
      sendJson(res, 500, { error: "Internal server error", detail: error.message });
    }
  });
}

function ensureSchemaColumns() {
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
}

function ensureColumn(table, column, definition) {
  const columns = queryAll(`PRAGMA table_info(${table});`).map(row => row.name);
  if (!columns.includes(column)) {
    runSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

function cleanupEmptySessions() {
  const emptySessionWhere = `
    NOT EXISTS (SELECT 1 FROM card_observations co WHERE co.session_id = sessions.id)
    AND NOT EXISTS (SELECT 1 FROM count_checks cc WHERE cc.session_id = sessions.id)
    AND NOT EXISTS (SELECT 1 FROM hands h WHERE h.session_id = sessions.id)
  `;
  runSql(`
    DELETE FROM shoes
    WHERE session_id IN (SELECT id FROM sessions WHERE ${emptySessionWhere});
    DELETE FROM sessions WHERE ${emptySessionWhere};
  `);
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/sessions") {
    const body = await readJson(req);
    const row = insert("sessions", {
      tracking_enabled: 1,
      app_version: body.appVersion || "0.1.0",
      user_agent: body.userAgent || "",
      initial_number_of_other_players: body.settings?.numberOfOtherPlayers,
      initial_shoe_display_mode: body.settings?.shoeDisplayMode,
      settings_json: JSON.stringify(body.settings || {})
    });
    sendJson(res, 201, { id: row.id, trackingEnabled: true });
    return;
  }

  const sessionPatch = url.pathname.match(/^\/api\/sessions\/(\d+)$/);
  if (req.method === "PATCH" && sessionPatch) {
    const body = await readJson(req);
    const values = {};
    if (typeof body.trackingEnabled === "boolean") values.tracking_enabled = body.trackingEnabled ? 1 : 0;
    if (body.ended) values.ended_at = nowIso();
    update("sessions", Number(sessionPatch[1]), values);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/events/shoe-started") {
    const body = await readJson(req);
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
    sendJson(res, 201, { id: row.id });
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/events/shoe-ended") {
    const body = await readJson(req);
    update("shoes", body.shoeId, {
      ended_at: nowIso(),
      cards_dealt: body.cardsDealt,
      cut_card_reached: body.cutCardReached ? 1 : 0,
      final_running_count: body.finalRunningCount
    });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/events/hand-completed") {
    const body = await readJson(req);
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
    sendJson(res, 201, { id: row.id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/events/card-observed") {
    const body = await readJson(req);
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
    sendJson(res, 201, { id: row.id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/events/count-check-submitted") {
    const body = await readJson(req);
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
    sendJson(res, 201, { id: row.id });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/analytics/summary") {
    sendJson(res, 200, buildSummary());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/analytics/trends") {
    sendJson(res, 200, buildTrends(url.searchParams.get("range") || "all"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/analytics/sessions") {
    sendJson(res, 200, { sessions: recentSessions() });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/analytics") {
    runSql("DELETE FROM count_check_cards; DELETE FROM count_checks; DELETE FROM card_observations; DELETE FROM hands; DELETE FROM shoes; DELETE FROM sessions;");
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function buildSummary() {
  const checks = queryAll("SELECT * FROM count_checks ORDER BY created_at ASC");
  const recent = checks.slice(-50);
  const correct = checks.filter(row => row.correct === 1).length;
  const recentCorrect = recent.filter(row => row.correct === 1).length;
  const avgError = average(checks.map(row => row.absolute_error));
  const recentAvgError = average(recent.map(row => row.absolute_error));
  const medianResponse = percentile(checks.map(row => row.response_time_ms), 0.5);
  const p90Response = percentile(checks.map(row => row.response_time_ms), 0.9);
  const currentStreak = trailingStreak(checks);
  const bestStreak = bestCorrectStreak(checks);
  const noMajorErrorStreak = trailingNoMajorErrorStreak(checks);
  const masteryScore = calculateMasteryScore(recent.length ? recent : checks);
  const cards = firstValue("SELECT COUNT(*) AS value FROM card_observations");
  const sessions = firstValue("SELECT COUNT(*) AS value FROM sessions");
  const shoes = firstValue("SELECT COUNT(*) AS value FROM shoes");
  const hands = firstValue("SELECT COUNT(*) AS value FROM hands");
  const depth = groupedMetric(checks, row => {
    if (row.shoe_depth_percent < 33) return "Early shoe";
    if (row.shoe_depth_percent < 67) return "Middle shoe";
    return "Late shoe";
  });
  const pressure = groupedMetric(checks, row => {
    const magnitude = Math.abs(Number(row.correct_running_count) || 0);
    if (magnitude <= 2) return "Count 0-2";
    if (magnitude <= 5) return "Count 3-5";
    return "Count 6+";
  });
  const promptTypes = groupedMetric(checks, row => row.prompt_source || "unknown");
  const otherPlayers = groupedMetric(checks, row => otherPlayersLabel(row.number_of_other_players));
  const shoeDisplayModes = groupedMetric(checks, row => shoeDisplayLabel(row.shoe_display_mode));
  const errorDrivers = buildErrorDrivers();
  const speedBreakdown = buildSpeedBreakdown();

  return {
    masteryScore,
    level: masteryLevel(masteryScore, checks.length),
    totals: { sessions, shoes, hands, cards, checks: checks.length },
    accuracy: percent(correct, checks.length),
    recentAccuracy: percent(recentCorrect, recent.length),
    avgError,
    recentAvgError,
    medianResponse,
    p90Response,
    currentStreak,
    bestStreak,
    noMajorErrorStreak,
    errorBuckets: {
      perfect: checks.filter(row => row.absolute_error === 0).length,
      one: checks.filter(row => row.absolute_error === 1).length,
      two: checks.filter(row => row.absolute_error === 2).length,
      major: checks.filter(row => row.absolute_error >= 3).length
    },
    depth,
    pressure,
    promptTypes,
    otherPlayers,
    shoeDisplayModes,
    errorDrivers,
    speedBreakdown,
    sessions: recentSessions()
  };
}

function buildErrorDrivers() {
  const rows = queryAll(`
    SELECT
      c.id AS check_id,
      c.correct,
      c.signed_error,
      c.absolute_error,
      cc.card_group,
      COUNT(*) AS card_count
    FROM count_checks c
    JOIN count_check_cards cc ON cc.count_check_id = c.id
    GROUP BY c.id, cc.card_group
    ORDER BY c.created_at ASC
  `);
  const labels = {
    low: "Low cards",
    high: "High cards",
    neutral: "Neutral cards",
    dealerHole: "Dealer hole reveals"
  };
  return Object.entries(labels).map(([key, label]) => {
    const groupRows = rows.filter(row => row.card_group === key);
    const missedRows = groupRows.filter(row => row.correct !== 1);
    return {
      label,
      checks: groupRows.length,
      missedChecks: missedRows.length,
      accuracy: percent(groupRows.length - missedRows.length, groupRows.length),
      avgError: average(groupRows.map(row => row.absolute_error)),
      avgSignedError: average(groupRows.map(row => row.signed_error)),
      cardsOnMisses: missedRows.reduce((sum, row) => sum + (Number(row.card_count) || 0), 0)
    };
  });
}

function buildSpeedBreakdown() {
  const rows = queryAll(`
    SELECT
      c.id AS check_id,
      c.correct,
      c.absolute_error,
      cc.dealer_speed,
      cc.deal_delay_ms,
      AVG(cc.ms_since_previous_visible_card) AS avg_visible_gap_ms
    FROM count_checks c
    JOIN count_check_cards cc ON cc.count_check_id = c.id
    GROUP BY c.id, cc.dealer_speed, cc.deal_delay_ms
    ORDER BY c.created_at ASC
  `);
  return groupedMetric(rows, row => speedLabel(row.dealer_speed, row.deal_delay_ms)).map(group => {
    const matching = rows.filter(row => speedLabel(row.dealer_speed, row.deal_delay_ms) === group.label);
    return {
      ...group,
      avgVisibleGapMs: Math.round(average(matching.map(row => row.avg_visible_gap_ms)))
    };
  });
}

function buildTrends(range) {
  const rows = queryAll("SELECT date(created_at) AS day, correct, absolute_error, response_time_ms FROM count_checks ORDER BY created_at ASC");
  const cutoff = range === "7d" ? 7 : range === "30d" ? 30 : null;
  const now = Date.now();
  const filtered = cutoff
    ? rows.filter(row => (now - new Date(`${row.day}T00:00:00Z`).getTime()) / 86400000 <= cutoff)
    : rows;
  const byDay = new Map();
  for (const row of filtered) {
    const bucket = byDay.get(row.day) || [];
    bucket.push(row);
    byDay.set(row.day, bucket);
  }
  return {
    range,
    days: [...byDay.entries()].map(([day, checks]) => ({
      day,
      checks: checks.length,
      accuracy: percent(checks.filter(row => row.correct === 1).length, checks.length),
      avgError: average(checks.map(row => row.absolute_error)),
      medianResponse: percentile(checks.map(row => row.response_time_ms), 0.5)
    }))
  };
}

function recentSessions() {
  return queryAll(`
    SELECT
      s.id,
      s.started_at,
      s.ended_at,
      COUNT(DISTINCT sh.id) AS shoes,
      COUNT(DISTINCT h.id) AS hands,
      COUNT(c.id) AS checks,
      ROUND(100.0 * AVG(CASE WHEN c.correct = 1 THEN 1 ELSE 0 END), 1) AS accuracy,
      ROUND(AVG(c.absolute_error), 2) AS avg_error,
      ROUND(AVG(c.response_time_ms)) AS avg_response_ms
    FROM sessions s
    LEFT JOIN shoes sh ON sh.session_id = s.id
    LEFT JOIN hands h ON h.session_id = s.id
    LEFT JOIN count_checks c ON c.session_id = s.id
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT 12
  `);
}

function groupedMetric(rows, getKey) {
  const groups = new Map();
  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([label, group]) => ({
    label,
    checks: group.length,
    accuracy: percent(group.filter(row => row.correct === 1).length, group.length),
    avgError: average(group.map(row => row.absolute_error)),
    medianResponse: percentile(group.map(row => row.response_time_ms), 0.5)
  }));
}

function cardGroup(hiLoValue, dealerHoleReveal) {
  if (dealerHoleReveal) return "dealerHole";
  const value = Number(hiLoValue) || 0;
  if (value > 0) return "low";
  if (value < 0) return "high";
  return "neutral";
}

function speedLabel(dealerSpeed, dealDelayMs) {
  const label = dealerSpeed || "custom";
  const delay = Number(dealDelayMs);
  if (!Number.isFinite(delay)) return label;
  return `${label} · ${delay} ms`;
}

function otherPlayersLabel(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return "Unknown other players";
  return `${count} other players`;
}

function shoeDisplayLabel(mode) {
  const labels = {
    decks: "Decks left",
    numbers: "Card numbers",
    graphic: "Tray graphic",
    hidden: "Hidden"
  };
  return labels[mode] || mode || "Unknown display";
}

function calculateMasteryScore(rows) {
  if (!rows.length) return 0;
  const accuracyScore = percent(rows.filter(row => row.correct === 1).length, rows.length);
  const errorScore = Math.max(0, 100 - average(rows.map(row => row.absolute_error)) * 24);
  const speed = percentile(rows.map(row => row.response_time_ms), 0.5);
  const speedScore = Math.max(0, Math.min(100, 100 - ((speed - 2500) / 70)));
  const majorPenalty = Math.min(35, rows.filter(row => row.absolute_error >= 3).length * 7);
  return Math.max(0, Math.min(100, Math.round((accuracyScore * 0.52) + (errorScore * 0.33) + (speedScore * 0.15) - majorPenalty)));
}

function masteryLevel(score, checks) {
  if (!checks) return "No data yet";
  if (score >= 92) return "Expert target";
  if (score >= 82) return "Advanced";
  if (score >= 65) return "Developing";
  return "Beginner";
}

function trailingStreak(rows) {
  let count = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].correct !== 1) break;
    count += 1;
  }
  return count;
}

function bestCorrectStreak(rows) {
  let best = 0;
  let current = 0;
  for (const row of rows) {
    current = row.correct === 1 ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

function trailingNoMajorErrorStreak(rows) {
  let count = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].absolute_error >= 3) break;
    count += 1;
  }
  return count;
}

function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function insert(table, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key).join(", ");
  const sqlValues = entries.map(([, value]) => sqlValue(value)).join(", ");
  const rows = queryAll(`INSERT INTO ${table} (${columns}) VALUES (${sqlValues}); SELECT last_insert_rowid() AS id;`);
  return rows[0] || { id: null };
}

function update(table, id, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const assignments = entries.map(([key, value]) => `${key} = ${sqlValue(value)}`).join(", ");
  runSql(`UPDATE ${table} SET ${assignments} WHERE id = ${Number(id)};`);
}

function firstValue(sql) {
  const rows = queryAll(sql);
  return Number(rows[0]?.value || 0);
}

function queryAll(sql) {
  const output = execFileSync("sqlite3", ["-json", DB_PATH, sql], { encoding: "utf8" }).trim();
  return output ? JSON.parse(output) : [];
}

function runSql(sql) {
  execFileSync("sqlite3", [DB_PATH, sql], { encoding: "utf8" });
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  return round(nums.reduce((sum, value) => sum + value, 0) / nums.length, 2);
}

function percentile(values, p) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const index = Math.min(nums.length - 1, Math.max(0, Math.ceil(nums.length * p) - 1));
  return Math.round(nums[index]);
}

function percent(value, total) {
  if (!total) return 0;
  return round((value / total) * 100, 1);
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function nowIso() {
  return new Date().toISOString();
}
