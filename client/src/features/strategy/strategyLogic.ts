import {
  STRATEGY_DEALER_UPCARDS,
  type StrategyChart,
  type StrategyRules,
  type StrategySubsetCriteria
} from "@blackjack/shared";
import {
  handValue,
  makeCard,
  randomSuit,
  rankBlackjackValue,
  type GameCard
} from "../../lib/cards";

export const STRATEGY_DEALERS = [...STRATEGY_DEALER_UPCARDS];

export const STRATEGY_ACTION_LABELS: Record<string, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
  insurance: "Insurance"
};

export const STRATEGY_ACTION_KEYS: Record<string, string> = {
  a: "hit",
  s: "stand",
  d: "double",
  f: "split",
  r: "surrender",
  e: "insurance"
};

export const STRATEGY_ACTION_ABBREVIATIONS: Record<string, string> = {
  hit: "H",
  stand: "S",
  double: "D",
  split: "P",
  surrender: "R",
  insurance: "I"
};

export const STRATEGY_ACTIONS_ORDER = [
  "hit",
  "stand",
  "double",
  "split",
  "surrender",
  "insurance"
] as const;

/** Mutable subset criteria, including the row dimension used by the studio. */
export type StrategyCriteria = StrategySubsetCriteria & { rows: string[] };

export function cloneCriteria(criteria?: Partial<StrategyCriteria>): StrategyCriteria {
  return {
    categories: [...(criteria?.categories || ["hard", "soft", "pair"])],
    dealerUpcards: [...(criteria?.dealerUpcards || STRATEGY_DEALERS)],
    rows: [...(criteria?.rows || [])],
    cells: [...(criteria?.cells || [])]
  };
}

export function strategyCellId(category: string, rowKey: string, dealer: string): string {
  return `${category}:${rowKey}:${dealer}`;
}

export function parseStrategyCellId(id: string): {
  category: string;
  rowKey: string;
  dealer: string;
} {
  const [category, rowKey, dealer] = id.split(":");
  return { category, rowKey, dealer };
}

export function toggleArrayValue<T>(values: T[], value: T): T[] {
  const index = values.indexOf(value);
  if (index >= 0) return values.filter((_, i) => i !== index);
  return [...values, value];
}

export function strategyChartSections(): Array<
  [string, string, Array<{ key: string; label: string }>]
> {
  return [
    ["hard", "Hard Totals", strategyHardRows()],
    ["soft", "Soft Totals", strategySoftRows()],
    ["pair", "Pairs", strategyPairRows()]
  ];
}

export function isStrategyRowIncluded(
  criteria: StrategyCriteria,
  category: string,
  rowKey: string
): boolean {
  if ((criteria.cells || []).length)
    return STRATEGY_DEALERS.some(dealer =>
      criteria.cells.includes(strategyCellId(category, rowKey, dealer))
    );
  return (
    (criteria.categories || []).includes(category as never) &&
    (!(criteria.rows || []).length || criteria.rows.includes(`${category}:${rowKey}`))
  );
}

export function formatStrategyRuleName(rules: Partial<StrategyRules>): string {
  const normalized = normalizedStrategyRules(rules);
  return [
    `${normalized.decks} ${normalized.decks === 1 ? "deck" : "decks"}`,
    normalized.dealerHitsSoft17 ? "dealer hits soft 17" : "dealer stands soft 17",
    normalized.doubleAfterSplit ? "double after split" : "no double after split",
    surrenderLabel(normalized.surrender).toLowerCase()
  ].join(", ");
}

export function strategyRuleSignature(rules: Partial<StrategyRules>): string {
  const n = normalizedStrategyRules(rules);
  return JSON.stringify({
    decks: n.decks,
    dealerHitsSoft17: n.dealerHitsSoft17,
    blackjackPayout: n.blackjackPayout,
    doubleRule: n.doubleRule,
    doubleAfterSplit: n.doubleAfterSplit,
    surrender: n.surrender,
    maxSplitHands: n.maxSplitHands,
    resplitAces: n.resplitAces,
    hitSplitAces: n.hitSplitAces,
    oneCardSplitAces: n.oneCardSplitAces,
    insurance: n.insurance,
    splitTensByValue: n.splitTensByValue,
    customRules: n.customRules
  });
}

export function normalizedStrategyRules(rules: Partial<StrategyRules> = {}): StrategyRules {
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

export function normalizePairRank(rank: string): string {
  return ["10", "J", "Q", "K"].includes(rank) ? "10" : rank;
}

export function normalizeDealerRank(rank: string | undefined): string | undefined {
  if (!rank) return rank;
  return ["10", "J", "Q", "K"].includes(rank) ? "10" : rank;
}

export function isStrategyPair(hand: GameCard[], rules: StrategyRules): boolean {
  if (hand.length !== 2) return false;
  const first = normalizePairRank(hand[0].rank);
  const second = normalizePairRank(hand[1].rank);
  if (rules.splitTensByValue && first === "10" && second === "10") return true;
  return hand[0].rank === hand[1].rank;
}

export function strategyDoubleAllowed(rules: StrategyRules, hand: GameCard[]): boolean {
  if (rules.doubleRule === "none") return false;
  const value = handValue(hand);
  if (rules.doubleRule === "anyTwo") return true;
  if (rules.doubleRule === "hardOnly") return !value.soft;
  if (rules.doubleRule === "nineToEleven") return [9, 10, 11].includes(value.total);
  if (rules.doubleRule === "tenToEleven") return [10, 11].includes(value.total);
  return true;
}

export function isStrategyActionLegal(
  action: string,
  rules: StrategyRules,
  hand: GameCard[],
  dealer: string | undefined,
  insuranceResolved: boolean
): boolean {
  const value = handValue(hand);
  if (value.total > 21) return false;
  if (action === "hit") return value.total < 21;
  if (action === "stand") return value.total <= 21;
  if (action === "surrender") return hand.length === 2 && rules.surrender !== "none";
  if (action === "insurance") return dealer === "A" && rules.insurance && !insuranceResolved;
  if (action === "split")
    return hand.length === 2 && rules.maxSplitHands > 1 && isStrategyPair(hand, rules);
  if (action === "double") return hand.length === 2 && strategyDoubleAllowed(rules, hand);
  return false;
}

export interface StrategyClassification {
  category: "hard" | "soft" | "pair";
  rowKey: string;
  label: string;
  total: number;
}

export function classifyStrategyHand(
  hand: GameCard[],
  rules: StrategyRules
): StrategyClassification {
  const value = handValue(hand);
  if (value.total > 21)
    return { category: "hard", rowKey: "bust", label: "Bust", total: value.total };
  if (hand.length === 2 && isStrategyPair(hand, rules)) {
    const rank = normalizePairRank(hand[0].rank);
    return { category: "pair", rowKey: `p${rank}`, label: `${rank},${rank}`, total: value.total };
  }
  if (value.soft)
    return {
      category: "soft",
      rowKey: `s${value.total}`,
      label: `Soft ${value.total}`,
      total: value.total
    };
  return {
    category: "hard",
    rowKey: `h${value.total}`,
    label: `Hard ${value.total}`,
    total: value.total
  };
}

export function getStrategyCellAction(
  chart: StrategyChart | undefined,
  category: string,
  rowKey: string,
  dealer: string
): string | null {
  return (chart as any)?.[category]?.[rowKey]?.[dealer] || null;
}

export interface StrategyDecision extends StrategyClassification {
  dealer: string;
  expectedAction: string;
}

export function currentStrategyDecision(
  chart: StrategyChart | undefined,
  playerHand: GameCard[],
  dealerHand: GameCard[],
  rules: StrategyRules
): StrategyDecision | null {
  const dealer = normalizeDealerRank(dealerHand[0]?.rank);
  if (!chart || !dealer || !playerHand.length) return null;
  const classified = classifyStrategyHand(playerHand, rules);
  if (classified.total > 21) return null;
  const expectedAction =
    getStrategyCellAction(chart, classified.category, classified.rowKey, dealer) || "stand";
  return { ...classified, dealer, expectedAction };
}

export function strategyHardRows(): Array<{ key: string; label: string }> {
  const rows = [];
  for (let total = 4; total <= 21; total += 1)
    rows.push({ key: `h${total}`, label: String(total) });
  return rows;
}

export function strategySoftRows(): Array<{ key: string; label: string }> {
  const rows = [];
  for (let total = 13; total <= 21; total += 1)
    rows.push({ key: `s${total}`, label: `A,${total - 11}` });
  return rows;
}

export function strategyPairRows(): Array<{ key: string; label: string }> {
  return ["A", "10", "9", "8", "7", "6", "5", "4", "3", "2"].map(rank => ({
    key: `p${rank}`,
    label: `${rank},${rank}`
  }));
}

function hardStartingCombos(total: number): string[][] {
  const rankPool = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const combos: string[][] = [];
  for (const first of rankPool) {
    for (const second of rankPool) {
      if (first === second) continue;
      if (rankBlackjackValue(first) + rankBlackjackValue(second) === total)
        combos.push([first, second]);
    }
  }
  return combos;
}

export function isLegalStartingStrategyRow(category: string, rowKey: string): boolean {
  if (category === "pair") return true;
  if (category === "soft") return Number(rowKey.slice(1)) < 21;
  return Boolean(hardStartingCombos(Number(rowKey.slice(1))).length);
}

export function sampleCardsForStrategyRow(category: string, rowKey: string): GameCard[] {
  const card = (rank: string) => makeCard(rank as never, "spades", "sample", true);
  if (category === "pair") {
    const rank = rowKey.slice(1);
    return [card(rank), card(rank)];
  }
  if (category === "soft") return [card("A"), card(String(Number(rowKey.slice(1)) - 11))];
  const combo = hardStartingCombos(Number(rowKey.slice(1)))[0] || ["10", "6"];
  return [card(combo[0]), card(combo[1])];
}

export function cardsForStrategyRow(category: string, rowKey: string): GameCard[] {
  if (category === "pair") {
    const rank = rowKey.slice(1);
    return [makeStrategyCard(rank, true), makeStrategyCard(rank, true)];
  }
  if (category === "soft")
    return [
      makeStrategyCard("A", true),
      makeStrategyCard(String(Number(rowKey.slice(1)) - 11), true)
    ];
  const combos = hardStartingCombos(Number(rowKey.slice(1)));
  const combo = combos[Math.floor(Math.random() * combos.length)] || ["10", "6"];
  return [makeStrategyCard(combo[0], true), makeStrategyCard(combo[1], true)];
}

export function makeStrategyCard(rank: string, visible: boolean): GameCard {
  return makeCard(rank as never, randomSuit(), "strategy", visible);
}

export function defaultStrategyCriteria(): StrategySubsetCriteria & { rows: string[] } {
  return {
    categories: ["hard", "soft", "pair"],
    dealerUpcards: [...STRATEGY_DEALERS],
    rows: [],
    cells: []
  };
}

export function isStrategyCellIncluded(
  criteria: StrategySubsetCriteria & { rows?: string[] },
  category: string,
  rowKey: string,
  dealer: string
): boolean {
  if ((criteria.cells || []).length)
    return criteria.cells.includes(`${category}:${rowKey}:${dealer}`);
  const rowMatch =
    !(criteria.rows || []).length || (criteria.rows || []).includes(`${category}:${rowKey}`);
  return (
    (criteria.categories || []).includes(category as never) &&
    (criteria.dealerUpcards || []).includes(dealer) &&
    rowMatch
  );
}

export function randomStrategyPracticeCell(
  chart: StrategyChart | undefined,
  rules: StrategyRules,
  criteria: StrategySubsetCriteria & { rows?: string[] }
): { category: string; rowKey: string; dealer: string } | null {
  const cells: Array<{ category: string; rowKey: string; dealer: string }> = [];
  for (const category of ["pair", "soft", "hard"]) {
    const rows =
      category === "pair"
        ? strategyPairRows()
        : category === "soft"
          ? strategySoftRows()
          : strategyHardRows();
    for (const row of rows) {
      if (!isLegalStartingStrategyRow(category, row.key)) continue;
      for (const dealer of STRATEGY_DEALERS) {
        const action = getStrategyCellAction(chart, category, row.key, dealer);
        if (!action) continue;
        const sampleHand = sampleCardsForStrategyRow(category, row.key);
        if (!isStrategyActionLegal(action, rules, sampleHand, dealer, false)) continue;
        if (isStrategyCellIncluded(criteria, category, row.key, dealer))
          cells.push({ category, rowKey: row.key, dealer });
      }
    }
  }
  return cells[Math.floor(Math.random() * cells.length)] || null;
}

export function doubleRuleLabel(rule: string): string {
  return (
    (
      {
        anyTwo: "Double any two",
        hardOnly: "Double hard only",
        nineToEleven: "Double 9-11",
        tenToEleven: "Double 10-11",
        none: "No double"
      } as Record<string, string>
    )[rule] || "Double custom"
  );
}

export function surrenderLabel(rule: string): string {
  return (
    (
      { none: "No surrender", late: "Late surrender", early: "Early surrender" } as Record<
        string,
        string
      >
    )[rule] || "Surrender custom"
  );
}
