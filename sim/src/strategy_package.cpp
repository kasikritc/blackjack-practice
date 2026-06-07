#include "strategy_package.hpp"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <nlohmann/json.hpp>
#include <set>
#include <stdexcept>
#include <tuple>
#include <utility>

namespace blackjack_sim {
namespace {
using json = nlohmann::json;

void reject_unknown(const json& value, const std::set<std::string>& allowed,
                    const std::string& context) {
  if (!value.is_object()) throw std::invalid_argument(context + " must be an object");
  for (const auto& [key, ignored] : value.items()) {
    (void)ignored;
    if (!allowed.contains(key)) throw std::invalid_argument("unknown " + context + " field: " + key);
  }
}

template <typename T> T required(const json& value, const char* key, const std::string& context) {
  if (!value.contains(key)) throw std::invalid_argument("missing " + context + " field: " + key);
  return value.at(key).get<T>();
}

Action parse_action(const std::string& value) {
  if (value == "stand") return Action::Stand;
  if (value == "hit") return Action::Hit;
  if (value == "double") return Action::Double;
  if (value == "surrender") return Action::Surrender;
  if (value == "split") return Action::Split;
  throw std::invalid_argument("unknown strategy action: " + value);
}

InsuranceDecision parse_side_decision(const std::string& value) {
  if (value == "decline") return InsuranceDecision::Decline;
  if (value == "take") return InsuranceDecision::Take;
  throw std::invalid_argument("side decision must be take or decline");
}

ThresholdComparison parse_comparison(const std::string& value) {
  if (value == "atOrAbove") return ThresholdComparison::AtOrAbove;
  if (value == "atOrBelow") return ThresholdComparison::AtOrBelow;
  throw std::invalid_argument("comparison must be atOrAbove or atOrBelow");
}

Rules parse_rules(const json& value) {
  reject_unknown(value,
    {"decks", "dealerHitsSoft17", "dealerPeek", "dealerHoleCard", "blackjackPayout",
     "doubleRule", "doubleAfterSplit", "surrender", "maxSplitHands", "resplitAces",
     "hitSplitAces", "oneCardSplitAces", "insurance", "splitTensByValue", "customRules"},
    "rules");
  Rules rules;
  rules.decks = required<int>(value, "decks", "rules");
  rules.dealer_hits_soft_17 = required<bool>(value, "dealerHitsSoft17", "rules");
  rules.dealer_peek = required<bool>(value, "dealerPeek", "rules");
  rules.dealer_hole_card = required<bool>(value, "dealerHoleCard", "rules");
  rules.blackjack_payout = required<std::string>(value, "blackjackPayout", "rules");
  rules.double_rule = required<std::string>(value, "doubleRule", "rules");
  rules.double_after_split = required<bool>(value, "doubleAfterSplit", "rules");
  rules.surrender = required<std::string>(value, "surrender", "rules");
  rules.max_split_hands = required<int>(value, "maxSplitHands", "rules");
  rules.resplit_aces = required<bool>(value, "resplitAces", "rules");
  rules.hit_split_aces = required<bool>(value, "hitSplitAces", "rules");
  rules.one_card_split_aces = required<bool>(value, "oneCardSplitAces", "rules");
  rules.insurance = required<bool>(value, "insurance", "rules");
  rules.split_tens_by_value = required<bool>(value, "splitTensByValue", "rules");
  const json custom = required<json>(value, "customRules", "rules");
  if (!custom.is_object() || !custom.empty()) throw std::invalid_argument("customRules must be empty");
  return rules;
}

StrategyChartMap parse_chart(const json& value, bool complete, const std::string& context) {
  reject_unknown(value, {"hard", "soft", "pair"}, context);
  StrategyChartMap chart;
  for (const std::string category : {"hard", "soft", "pair"}) {
    if (!value.contains(category)) {
      if (complete) throw std::invalid_argument("missing " + context + " category: " + category);
      continue;
    }
    const json& rows = value.at(category);
    if (!rows.is_object()) throw std::invalid_argument(context + "." + category + " must be an object");
    for (const auto& [row, dealers] : rows.items()) {
      if (!dealers.is_object()) throw std::invalid_argument(context + " row must be an object: " + row);
      for (const auto& [dealer, action] : dealers.items())
        chart[category][row][dealer] = parse_action(action.get<std::string>());
    }
  }
  return chart;
}

SideDecisionPolicy parse_side_policy(const json& value, const std::string& context) {
  reject_unknown(value, {"base", "deviations"}, context);
  SideDecisionPolicy policy;
  policy.base = parse_side_decision(required<std::string>(value, "base", context));
  const json deviations = required<json>(value, "deviations", context);
  if (!deviations.is_array()) throw std::invalid_argument(context + ".deviations must be an array");
  for (const auto& item : deviations) {
    reject_unknown(item, {"comparison", "trueCount", "decision"}, context + " deviation");
    policy.deviations.push_back({
      parse_comparison(required<std::string>(item, "comparison", context + " deviation")),
      required<int>(item, "trueCount", context + " deviation"),
      parse_side_decision(required<std::string>(item, "decision", context + " deviation"))
    });
  }
  return policy;
}

std::vector<std::string> expected_rows(const std::string& category) {
  std::vector<std::string> rows;
  if (category == "hard") for (int total = 4; total <= 21; ++total) rows.push_back("h" + std::to_string(total));
  else if (category == "soft") for (int total = 13; total <= 21; ++total) rows.push_back("s" + std::to_string(total));
  else rows = {"pA", "p10", "p9", "p8", "p7", "p6", "p5", "p4", "p3", "p2"};
  return rows;
}

const std::vector<std::string> kDealers{"2", "3", "4", "5", "6", "7", "8", "9", "10", "A"};

bool requires_fallback(Action action) {
  return action == Action::Double || action == Action::Surrender || action == Action::Split;
}

void validate_side_policy(const SideDecisionPolicy& policy, const std::string& label) {
  if (policy.deviations.empty()) return;
  const auto comparison = policy.deviations.front().comparison;
  std::set<int> seen;
  int previous = comparison == ThresholdComparison::AtOrAbove ? -1000000 : 1000000;
  for (const auto& deviation : policy.deviations) {
    if (deviation.comparison != comparison) throw std::invalid_argument(label + " mixes threshold directions");
    if (!seen.insert(deviation.true_count).second) throw std::invalid_argument(label + " has duplicate threshold");
    if (comparison == ThresholdComparison::AtOrAbove && deviation.true_count <= previous)
      throw std::invalid_argument(label + " atOrAbove thresholds must be ascending");
    if (comparison == ThresholdComparison::AtOrBelow && deviation.true_count >= previous)
      throw std::invalid_argument(label + " atOrBelow thresholds must be descending");
    previous = deviation.true_count;
  }
}

std::string dealer_label(Rank rank) {
  return rank == Rank::Ace ? "A" : std::to_string(rank_value(rank));
}

std::pair<std::string, std::string> classify(const HandState& hand, const Rules& rules) {
  const auto value = hand_value(hand.cards);
  if (hand.cards.size() == 2 && is_pair(hand, rules)) {
    const int rank = rank_value(hand.cards.front());
    return {"pair", rank == 1 ? "pA" : "p" + std::to_string(rank)};
  }
  return {value.soft ? "soft" : "hard", (value.soft ? "s" : "h") + std::to_string(value.total)};
}

Action lookup(const StrategyChartMap& chart, const std::string& category,
              const std::string& row, const std::string& dealer, const std::string& context) {
  const auto category_it = chart.find(category);
  if (category_it == chart.end()) throw std::invalid_argument("missing " + context + " category: " + category);
  const auto row_it = category_it->second.find(row);
  if (row_it == category_it->second.end()) throw std::invalid_argument("missing " + context + " row: " + row);
  const auto dealer_it = row_it->second.find(dealer);
  if (dealer_it == row_it->second.end()) throw std::invalid_argument("missing " + context + " cell: " + category + ":" + row + ":" + dealer);
  return dealer_it->second;
}

InsuranceDecision side_decision(const SideDecisionPolicy& policy, int true_count) {
  InsuranceDecision decision = policy.base;
  if (policy.deviations.empty()) return decision;
  if (policy.deviations.front().comparison == ThresholdComparison::AtOrAbove) {
    for (const auto& deviation : policy.deviations)
      if (true_count >= deviation.true_count) decision = deviation.decision;
  } else {
    for (const auto& deviation : policy.deviations)
      if (true_count <= deviation.true_count) decision = deviation.decision;
  }
  return decision;
}

}  // namespace

StrategyPackage parse_strategy_package(const std::string& path) {
  std::ifstream input(path);
  if (!input) throw std::runtime_error("unable to read strategy package: " + path);
  json value; input >> value;
  reject_unknown(value, {"schemaVersion", "id", "name", "rules", "trueCountRounding", "chart",
                         "fallbacks", "deviations", "insurance", "evenMoney", "bettingRamp"},
                 "strategy package");
  StrategyPackage package;
  package.schema_version = required<int>(value, "schemaVersion", "strategy package");
  package.id = required<std::string>(value, "id", "strategy package");
  package.name = required<std::string>(value, "name", "strategy package");
  package.rules = parse_rules(required<json>(value, "rules", "strategy package"));
  package.true_count_rounding = required<std::string>(value, "trueCountRounding", "strategy package");
  package.chart = parse_chart(required<json>(value, "chart", "strategy package"), true, "chart");
  package.fallbacks = parse_chart(required<json>(value, "fallbacks", "strategy package"), false, "fallbacks");
  const json deviations = required<json>(value, "deviations", "strategy package");
  if (!deviations.is_array()) throw std::invalid_argument("deviations must be an array");
  for (const auto& item : deviations) {
    reject_unknown(item, {"category", "rowKey", "dealerUpcard", "comparison", "trueCount", "action", "fallback"}, "deviation");
    CountDeviation deviation;
    deviation.category = required<std::string>(item, "category", "deviation");
    deviation.row_key = required<std::string>(item, "rowKey", "deviation");
    deviation.dealer = required<std::string>(item, "dealerUpcard", "deviation");
    deviation.comparison = parse_comparison(required<std::string>(item, "comparison", "deviation"));
    deviation.true_count = required<int>(item, "trueCount", "deviation");
    deviation.action = parse_action(required<std::string>(item, "action", "deviation"));
    if (item.contains("fallback")) { deviation.fallback = parse_action(item.at("fallback").get<std::string>()); deviation.has_fallback = true; }
    package.deviations.push_back(deviation);
  }
  package.insurance = parse_side_policy(required<json>(value, "insurance", "strategy package"), "insurance");
  package.even_money = parse_side_policy(required<json>(value, "evenMoney", "strategy package"), "evenMoney");
  const json ramp = required<json>(value, "bettingRamp", "strategy package");
  if (!ramp.is_array()) throw std::invalid_argument("bettingRamp must be an array");
  for (const auto& item : ramp) {
    reject_unknown(item, {"atOrAbove", "units"}, "betting ramp step");
    package.betting_ramp.push_back({required<int>(item, "atOrAbove", "betting ramp step"),
                                    required<double>(item, "units", "betting ramp step")});
  }
  validate_strategy_package(package);
  return package;
}

void validate_strategy_package(const StrategyPackage& package) {
  if (package.schema_version != 1) throw std::invalid_argument("unsupported strategy schemaVersion");
  if (package.id.empty() || package.name.empty()) throw std::invalid_argument("strategy id and name cannot be empty");
  if (!package.rules.dealer_peek || !package.rules.dealer_hole_card)
    throw std::invalid_argument("only American hole-card peek rules are supported");
  if (package.rules.decks < 1 || package.rules.decks > 8) throw std::invalid_argument("decks must be between 1 and 8");
  if (package.rules.hit_split_aces && package.rules.one_card_split_aces)
    throw std::invalid_argument("contradictory split-ace rules");
  if (!std::set<std::string>{"none", "late", "early"}.contains(package.rules.surrender))
    throw std::invalid_argument("unsupported surrender rule");
  if (!std::set<std::string>{"none", "anyTwo", "hardOnly", "nineToEleven", "tenToEleven"}.contains(package.rules.double_rule))
    throw std::invalid_argument("unsupported doubleRule");
  (void)natural_payout(package.rules);
  if (package.true_count_rounding != "nearest" && package.true_count_rounding != "truncate" &&
      package.true_count_rounding != "floor")
    throw std::invalid_argument("trueCountRounding must be nearest, truncate, or floor");

  for (const std::string category : {"hard", "soft", "pair"}) {
    const auto expected = expected_rows(category);
    const auto found = package.chart.find(category);
    if (found == package.chart.end() || found->second.size() != expected.size())
      throw std::invalid_argument("chart has incomplete or unexpected " + category + " rows");
    for (const auto& row : expected) {
      const auto row_it = found->second.find(row);
      if (row_it == found->second.end() || row_it->second.size() != kDealers.size())
        throw std::invalid_argument("chart has incomplete dealer cells: " + category + ":" + row);
      for (const auto& dealer : kDealers) {
        const Action action = lookup(package.chart, category, row, dealer, "chart");
        if (action == Action::Split && category != "pair")
          throw std::invalid_argument("split action outside pair chart");
        if (action == Action::Surrender && package.rules.surrender == "none")
          throw std::invalid_argument("surrender action under no-surrender rules");
        if (action == Action::Double && package.rules.double_rule == "none")
          throw std::invalid_argument("double action under no-double rules");
        if (requires_fallback(action)) {
          const Action fallback = lookup(package.fallbacks, category, row, dealer, "fallback");
          if (fallback != Action::Hit && fallback != Action::Stand)
            throw std::invalid_argument("fallback must be hit or stand");
        }
      }
    }
  }

  std::map<std::tuple<std::string, std::string, std::string>, ThresholdComparison> directions;
  std::map<std::tuple<std::string, std::string, std::string>, std::set<int>> thresholds;
  std::map<std::tuple<std::string, std::string, std::string>, int> previous_thresholds;
  for (const auto& deviation : package.deviations) {
    (void)lookup(package.chart, deviation.category, deviation.row_key, deviation.dealer, "deviation target");
    if (deviation.action == Action::Split && deviation.category != "pair")
      throw std::invalid_argument("split deviation outside pair chart");
    if (requires_fallback(deviation.action) && !deviation.has_fallback)
      throw std::invalid_argument("double, surrender, and split deviations require fallback");
    if (deviation.has_fallback && deviation.fallback != Action::Hit && deviation.fallback != Action::Stand)
      throw std::invalid_argument("deviation fallback must be hit or stand");
    const auto key = std::make_tuple(deviation.category, deviation.row_key, deviation.dealer);
    const auto found = directions.find(key);
    if (found != directions.end() && found->second != deviation.comparison)
      throw std::invalid_argument("deviations for a cell mix threshold directions");
    directions[key] = deviation.comparison;
    if (!thresholds[key].insert(deviation.true_count).second)
      throw std::invalid_argument("duplicate deviation threshold");
    const auto previous = previous_thresholds.find(key);
    if (previous != previous_thresholds.end()) {
      if (deviation.comparison == ThresholdComparison::AtOrAbove && deviation.true_count <= previous->second)
        throw std::invalid_argument("atOrAbove deviations for a cell must be ascending");
      if (deviation.comparison == ThresholdComparison::AtOrBelow && deviation.true_count >= previous->second)
        throw std::invalid_argument("atOrBelow deviations for a cell must be descending");
    }
    previous_thresholds[key] = deviation.true_count;
  }
  validate_side_policy(package.insurance, "insurance deviations");
  validate_side_policy(package.even_money, "even-money deviations");

  if (package.betting_ramp.empty() || package.betting_ramp.front().at_or_above > -100)
    throw std::invalid_argument("bettingRamp must cover true counts from -100");
  int previous = -1000000;
  for (const auto& step : package.betting_ramp) {
    if (step.at_or_above <= previous) throw std::invalid_argument("bettingRamp thresholds must be ascending");
    if (!std::isfinite(step.units) || step.units < 0) throw std::invalid_argument("bettingRamp units must be finite and nonnegative");
    previous = step.at_or_above;
  }
}

int strategy_true_count(double exact, const std::string& rounding) {
  if (rounding == "nearest") return static_cast<int>(std::round(exact));
  if (rounding == "floor") return static_cast<int>(std::floor(exact));
  return static_cast<int>(exact);
}

ChartPolicy::ChartPolicy(StrategyPackage package) : package_(std::move(package)) {
  validate_strategy_package(package_);
}

Action ChartPolicy::choose_action(const DecisionContext& context) const {
  if (context.legal_actions.size() == 1) return context.legal_actions.front();
  const auto [category, row] = classify(context.hand, context.rules);
  const std::string dealer = dealer_label(context.dealer_upcard);
  Action action = lookup(package_.chart, category, row, dealer, "chart");
  Action fallback = Action::Stand;
  bool has_fallback = false;
  if (requires_fallback(action)) {
    fallback = lookup(package_.fallbacks, category, row, dealer, "fallback");
    has_fallback = true;
  }
  const int tc = strategy_true_count(context.exact_true_count, package_.true_count_rounding);
  for (const auto& deviation : package_.deviations) {
    if (deviation.category != category || deviation.row_key != row || deviation.dealer != dealer) continue;
    const bool matches = deviation.comparison == ThresholdComparison::AtOrAbove
      ? tc >= deviation.true_count : tc <= deviation.true_count;
    if (matches) {
      action = deviation.action;
      fallback = deviation.fallback;
      has_fallback = deviation.has_fallback;
    }
  }
  if (std::find(context.legal_actions.begin(), context.legal_actions.end(), action) != context.legal_actions.end())
    return action;
  if (has_fallback && std::find(context.legal_actions.begin(), context.legal_actions.end(), fallback) != context.legal_actions.end())
    return fallback;
  throw std::invalid_argument("strategy action is illegal without a valid fallback: " + category + ":" + row + ":" + dealer);
}

InsuranceDecision ChartPolicy::choose_insurance(const InsuranceContext& context) const {
  const int tc = strategy_true_count(context.exact_true_count, package_.true_count_rounding);
  return side_decision(context.player_natural ? package_.even_money : package_.insurance, tc);
}

double ChartPolicy::wager_units(int running_count, int cards_remaining) const {
  if (cards_remaining <= 0) throw std::invalid_argument("cards remaining must be positive");
  const double exact = running_count / (cards_remaining / 52.0);
  const int tc = strategy_true_count(exact, package_.true_count_rounding);
  double units = package_.betting_ramp.front().units;
  for (const auto& step : package_.betting_ramp)
    if (tc >= step.at_or_above) units = step.units;
  return units;
}

}  // namespace blackjack_sim
