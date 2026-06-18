#include "config.hpp"

#include <fstream>
#include <nlohmann/json.hpp>
#include <set>
#include <stdexcept>

namespace blackjack_sim {
namespace {
using json = nlohmann::json;

template <typename T> T required(const json& object, const char* key) {
  if (!object.contains(key)) throw std::invalid_argument(std::string("missing config field: ") + key);
  return object.at(key).get<T>();
}

void reject_unknown(const json& object, const std::set<std::string>& allowed,
                    const std::string& context) {
  for (const auto& [key, ignored] : object.items()) {
    (void)ignored;
    if (!allowed.contains(key)) throw std::invalid_argument("unknown " + context + " field: " + key);
  }
}

Rules parse_rules(const json& value) {
  reject_unknown(value,
    {"decks", "dealerHitsSoft17", "dealerPeek", "dealerHoleCard", "blackjackPayout",
     "doubleRule", "doubleAfterSplit", "surrender", "maxSplitHands", "resplitAces",
     "hitSplitAces", "oneCardSplitAces", "insurance", "splitTensByValue", "customRules"}, "rules");
  Rules rules;
  rules.decks = required<int>(value, "decks");
  rules.dealer_hits_soft_17 = required<bool>(value, "dealerHitsSoft17");
  rules.dealer_peek = required<bool>(value, "dealerPeek");
  rules.dealer_hole_card = required<bool>(value, "dealerHoleCard");
  rules.blackjack_payout = required<std::string>(value, "blackjackPayout");
  rules.double_rule = required<std::string>(value, "doubleRule");
  rules.double_after_split = required<bool>(value, "doubleAfterSplit");
  rules.surrender = required<std::string>(value, "surrender");
  rules.max_split_hands = required<int>(value, "maxSplitHands");
  rules.resplit_aces = required<bool>(value, "resplitAces");
  rules.hit_split_aces = required<bool>(value, "hitSplitAces");
  rules.one_card_split_aces = required<bool>(value, "oneCardSplitAces");
  rules.insurance = required<bool>(value, "insurance");
  rules.split_tens_by_value = required<bool>(value, "splitTensByValue");
  const json custom = required<json>(value, "customRules");
  if (!rules.dealer_peek || !rules.dealer_hole_card)
    throw std::invalid_argument("only American hole-card peek games are supported");
  if (!custom.is_object() || !custom.empty()) throw std::invalid_argument("customRules must be empty");
  if (rules.decks < 1 || rules.decks > 8) throw std::invalid_argument("decks must be between 1 and 8");
  if (rules.max_split_hands < 1 || rules.max_split_hands > 8)
    throw std::invalid_argument("maxSplitHands must be between 1 and 8");
  if (rules.hit_split_aces && rules.one_card_split_aces)
    throw std::invalid_argument("hitSplitAces and oneCardSplitAces cannot both be true");
  if (!std::set<std::string>{"none", "late", "early"}.contains(rules.surrender))
    throw std::invalid_argument("unsupported surrender rule");
  if (!std::set<std::string>{"none", "anyTwo", "hardOnly", "nineToEleven", "tenToEleven"}.contains(rules.double_rule))
    throw std::invalid_argument("unsupported doubleRule");
  (void)natural_payout(rules);
  return rules;
}
}  // namespace

Config parse_config(const std::string& path) {
  std::ifstream input(path);
  if (!input) throw std::runtime_error("unable to read config: " + path);
  json value;
  input >> value;
  reject_unknown(value,
    {"name", "seed", "rules", "minSamplesPerAction", "maxSamplesPerAction", "batchSize",
     "shoeSamplesPerBucket", "maxPolicyIterations", "minimumEvMargin", "confidenceZ",
     "trueCountBuckets", "decksRemainingBuckets", "trueCountRounding"}, "config");
  Config config;
  config.name = required<std::string>(value, "name");
  config.seed = required<std::string>(value, "seed");
  config.rules = parse_rules(required<json>(value, "rules"));
  config.min_samples_per_action = required<int>(value, "minSamplesPerAction");
  config.max_samples_per_action = required<int>(value, "maxSamplesPerAction");
  config.batch_size = required<int>(value, "batchSize");
  config.shoe_samples_per_bucket = required<int>(value, "shoeSamplesPerBucket");
  config.max_policy_iterations = required<int>(value, "maxPolicyIterations");
  config.minimum_ev_margin = required<double>(value, "minimumEvMargin");
  config.confidence_z = required<double>(value, "confidenceZ");
  config.true_count_buckets = required<std::vector<int>>(value, "trueCountBuckets");
  config.decks_remaining_buckets = required<std::vector<double>>(value, "decksRemainingBuckets");
  config.true_count_rounding = required<std::string>(value, "trueCountRounding");
  if (config.name.empty() || config.seed.empty()) throw std::invalid_argument("name and seed cannot be empty");
  if (config.min_samples_per_action <= 0 || config.max_samples_per_action < config.min_samples_per_action)
    throw std::invalid_argument("invalid sample limits");
  if (config.batch_size <= 0 || config.max_samples_per_action % config.batch_size != 0)
    throw std::invalid_argument("batchSize must be positive and divide maxSamplesPerAction");
  if (config.shoe_samples_per_bucket <= 0 || config.max_policy_iterations <= 0)
    throw std::invalid_argument("shoeSamplesPerBucket and maxPolicyIterations must be positive");
  if (config.minimum_ev_margin < 0 || config.confidence_z <= 0)
    throw std::invalid_argument("invalid convergence settings");
  if (config.true_count_buckets.empty() || config.decks_remaining_buckets.empty())
    throw std::invalid_argument("bucket arrays cannot be empty");
  if (config.true_count_rounding != "nearest" && config.true_count_rounding != "truncate")
    throw std::invalid_argument("trueCountRounding must be nearest or truncate");
  for (double decks : config.decks_remaining_buckets)
    if (decks <= 0 || decks > config.rules.decks)
      throw std::invalid_argument("decksRemainingBuckets outside configured shoe");
  return config;
}

}  // namespace blackjack_sim
