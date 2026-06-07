#include "simulator.hpp"

#include "blackjack.hpp"
#include "config.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <omp.h>
#include <random>
#include <sstream>
#include <stdexcept>
#include <tuple>
#include <unordered_map>
#include <vector>
#include <nlohmann/json.hpp>

namespace blackjack_sim {
namespace {

using json = nlohmann::json;
constexpr const char* kSimulatorVersion = "0.3.0";

struct RunningStats {
  long long samples = 0;
  double sum = 0;
  double sum_sq = 0;
  long long wins = 0;
  long long losses = 0;
  long long pushes = 0;
  long long blackjacks = 0;
  long long busts = 0;
  long long surrenders = 0;
  long long doubles = 0;
  long long splits = 0;
  long long split_hands = 0;

  void add(const RoundOutcome& outcome) {
    ++samples;
    sum += outcome.profit;
    sum_sq += outcome.profit * outcome.profit;
    wins += outcome.profit > 0 ? 1 : 0;
    losses += outcome.profit < 0 ? 1 : 0;
    pushes += outcome.profit == 0 ? 1 : 0;
    blackjacks += outcome.player_blackjack ? 1 : 0;
    busts += outcome.busts > 0 ? 1 : 0;
    surrenders += outcome.surrenders > 0 ? 1 : 0;
    doubles += outcome.doubles > 0 ? 1 : 0;
    splits += outcome.hands > 1 ? 1 : 0;
    split_hands += outcome.hands;
  }

  void add_value(double value) {
    ++samples;
    sum += value;
    sum_sq += value * value;
  }

  double mean() const { return samples ? sum / static_cast<double>(samples) : 0.0; }
  double standard_error() const {
    if (samples <= 1) return 0.0;
    const double m = mean();
    const double variance = std::max(0.0, sum_sq / static_cast<double>(samples) - m * m);
    return std::sqrt(variance / static_cast<double>(samples));
  }
  double rate(long long value) const {
    return samples ? static_cast<double>(value) / static_cast<double>(samples) : 0.0;
  }
};

struct Composition {
  std::vector<Rank> cards;
  std::string key;
  double weight = 1.0;
};

struct ShoeSample {
  Shoe shoe;
  int running_count = 0;
  double exact_true_count = 0;
};

struct ActionResult {
  Action action = Action::Stand;
  RunningStats stats;
  std::map<std::string, RunningStats> compositions;
  std::map<int, RunningStats> running_counts;
};

struct CellResult {
  std::string category;
  std::string row_key;
  std::string dealer;
  int true_count = 0;
  double decks_remaining = 0;
  std::vector<ActionResult> actions;
  Action best_action = Action::Stand;
  Action fallback_action = Action::Stand;
  bool has_fallback = false;
  bool converged = false;
  std::string confidence = "low";
  std::string stop_reason = "sample-cap";
  double winner_margin = 0;
  double paired_standard_error = 0;
  double paired_confidence_low = 0;
  double paired_confidence_high = 0;
  int policy_iteration = 1;
  double mean_exact_true_count = 0;
};

uint64_t hash_seed(const std::string& value) {
  uint64_t hash = 1469598103934665603ull;
  for (unsigned char c : value) { hash ^= c; hash *= 1099511628211ull; }
  return hash;
}

std::mt19937_64 make_rng(const Config& config, const std::string& label, long long sample) {
  return std::mt19937_64(hash_seed(config.seed + ":" + label + ":" + std::to_string(sample)));
}

std::string now_compact() {
  const auto now = std::chrono::system_clock::now();
  const auto time = std::chrono::system_clock::to_time_t(now);
  std::tm tm{};
  gmtime_r(&time, &tm);
  std::ostringstream out;
  out << std::put_time(&tm, "%Y%m%dT%H%M%SZ");
  return out.str();
}

std::string slug(std::string value) {
  for (char& c : value) {
    if (!std::isalnum(static_cast<unsigned char>(c))) c = '-';
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  }
  while (value.find("--") != std::string::npos) value.replace(value.find("--"), 2, "-");
  while (!value.empty() && value.back() == '-') value.pop_back();
  return value.empty() ? "strategy-sim" : value;
}

std::string dealer_label(Rank rank) { return rank == Rank::Ace ? "A" : std::to_string(rank_value(rank)); }

int rounded_true_count(double value, const std::string& mode) {
  return mode == "truncate" ? static_cast<int>(value) : static_cast<int>(std::round(value));
}

std::string composition_key(const std::vector<Rank>& cards) {
  std::vector<std::string> names;
  names.reserve(cards.size());
  for (Rank rank : cards) names.push_back(rank_name(rank));
  std::sort(names.begin(), names.end());
  std::ostringstream out;
  for (size_t i = 0; i < names.size(); ++i) out << (i ? "+" : "") << names[i];
  return out.str();
}

bool pair_for_rules(Rank a, Rank b, const Rules& rules) {
  if (rules.split_tens_by_value && rank_value(a) == 10 && rank_value(b) == 10) return true;
  return a == b;
}

std::vector<Composition> hard_compositions(int total, const Rules& rules) {
  if (total == 4) return {{{Rank::Two, Rank::Two}, "2+2", 1.0}};
  if (total == 21) return {{{Rank::Five, Rank::Six, Rank::Ten}, "5+6+10", 1.0}};
  std::vector<Composition> out;
  const Shoe shoe = full_shoe(rules.decks);
  for (int ai = 1; ai < 13; ++ai) {
    for (int bi = ai; bi < 13; ++bi) {
      const Rank a = static_cast<Rank>(ai);
      const Rank b = static_cast<Rank>(bi);
      if (rank_value(a) + rank_value(b) != total || pair_for_rules(a, b, rules)) continue;
      const double weight = ai == bi
        ? shoe.counts[ai] * (shoe.counts[ai] - 1) / 2.0
        : shoe.counts[ai] * shoe.counts[bi];
      out.push_back({{a, b}, composition_key({a, b}), weight});
    }
  }
  if (out.empty()) throw std::logic_error("no hard composition for total " + std::to_string(total));
  return out;
}

std::vector<Composition> soft_compositions(int total, const Rules&) {
  if (total == 21) return {{{Rank::Ace, Rank::Five, Rank::Five}, "A+5+5", 1.0}};
  const Rank other = static_cast<Rank>(total - 11 - 1);
  return {{{Rank::Ace, other}, composition_key({Rank::Ace, other}), 1.0}};
}

std::vector<Composition> pair_compositions(const std::string& row_key, const Rules& rules) {
  const std::string label = row_key.substr(1);
  if (label != "10") {
    const Rank rank = parse_rank(label);
    return {{{rank, rank}, composition_key({rank, rank}), 1.0}};
  }
  std::vector<Composition> out;
  const std::vector<Rank> tens{Rank::Ten, Rank::Jack, Rank::Queen, Rank::King};
  for (size_t i = 0; i < tens.size(); ++i) {
    for (size_t j = i; j < tens.size(); ++j) {
      if (!rules.split_tens_by_value && i != j) continue;
      out.push_back({{tens[i], tens[j]}, composition_key({tens[i], tens[j]}), i == j ? 6.0 : 16.0});
    }
  }
  return out;
}

std::vector<Composition> compositions_for(const std::string& category, const std::string& row_key,
                                          const Rules& rules) {
  if (category == "pair") return pair_compositions(row_key, rules);
  const int total = std::stoi(row_key.substr(1));
  return category == "soft" ? soft_compositions(total, rules) : hard_compositions(total, rules);
}

std::vector<std::tuple<std::string, std::string>> rows() {
  std::vector<std::tuple<std::string, std::string>> out;
  for (int total = 4; total <= 21; ++total) out.emplace_back("hard", "h" + std::to_string(total));
  for (int total = 13; total <= 21; ++total) out.emplace_back("soft", "s" + std::to_string(total));
  for (const std::string& rank : {"A", "10", "9", "8", "7", "6", "5", "4", "3", "2"})
    out.emplace_back("pair", "p" + rank);
  return out;
}

std::vector<Rank> dealer_ranks() {
  return {Rank::Two, Rank::Three, Rank::Four, Rank::Five, Rank::Six, Rank::Seven,
          Rank::Eight, Rank::Nine, Rank::Ten, Rank::Ace};
}

std::string classify_key(const HandState& hand, const Rules& rules, Rank dealer) {
  std::string category;
  std::string row;
  const auto value = hand_value(hand.cards);
  if (hand.cards.size() == 2 && is_pair(hand, rules)) {
    category = "pair";
    row = rank_value(hand.cards[0]) == 10 ? "p10" : "p" + rank_name(hand.cards[0]);
  } else if (value.soft) {
    category = "soft";
    row = "s" + std::to_string(value.total);
  } else {
    category = "hard";
    row = "h" + std::to_string(value.total);
  }
  return category + ":" + row + ":" + dealer_label(dealer);
}

Action baseline_action(const HandState& hand, Rank dealer, const Rules& rules, int total_hands) {
  const auto legal = legal_actions(hand, rules, total_hands, false);
  auto has = [&](Action action) { return std::find(legal.begin(), legal.end(), action) != legal.end(); };
  const int up = dealer == Rank::Ace ? 11 : rank_value(dealer);
  const auto value = hand_value(hand.cards);
  if (has(Action::Split)) {
    const int pair = rank_value(hand.cards[0]);
    if (pair == 1 || pair == 8) return Action::Split;
    if (pair == 9 && ((up >= 2 && up <= 6) || up == 8 || up == 9)) return Action::Split;
    if (pair == 7 && up <= 7) return Action::Split;
    if (pair == 6 && up <= 6) return Action::Split;
    if (pair == 4 && (up == 5 || up == 6)) return Action::Split;
    if ((pair == 2 || pair == 3) && up <= 7) return Action::Split;
  }
  if (has(Action::Double)) {
    if (!value.soft && value.total == 9 && up >= 3 && up <= 6) return Action::Double;
    if (!value.soft && value.total == 10 && up >= 2 && up <= 9) return Action::Double;
    if (!value.soft && value.total == 11 && (up != 11 || rules.dealer_hits_soft_17)) return Action::Double;
    if (value.soft && value.total <= 15 && up >= 4 && up <= 6) return Action::Double;
    if (value.soft && value.total >= 16 && value.total <= 17 && up >= 3 && up <= 6) return Action::Double;
    if (value.soft && value.total == 18 && up >= 3 && up <= 6) return Action::Double;
    if (value.soft && value.total == 19 && up == 6 && rules.dealer_hits_soft_17) return Action::Double;
  }
  if (value.soft) {
    if (value.total >= 19 || (value.total == 18 && (up == 2 || up == 7 || up == 8))) return Action::Stand;
    return has(Action::Hit) ? Action::Hit : Action::Stand;
  }
  if (value.total >= 17) return Action::Stand;
  if (value.total >= 13 && up >= 2 && up <= 6) return Action::Stand;
  if (value.total == 12 && up >= 4 && up <= 6) return Action::Stand;
  return has(Action::Hit) ? Action::Hit : Action::Stand;
}

class FrozenPolicy final : public Policy {
 public:
  explicit FrozenPolicy(std::unordered_map<std::string, Action> actions) : actions_(std::move(actions)) {}
  Action choose(const HandState& hand, Rank dealer, const Rules& rules, int total_hands) const override {
    const auto legal = legal_actions(hand, rules, total_hands, false);
    const auto found = actions_.find(classify_key(hand, rules, dealer));
    if (found != actions_.end() && std::find(legal.begin(), legal.end(), found->second) != legal.end())
      return found->second;
    return baseline_action(hand, dealer, rules, total_hands);
  }
 private:
  std::unordered_map<std::string, Action> actions_;
};

std::vector<Action> first_actions(const std::string& category, const std::string& row_key,
                                  const Composition& composition, const Rules& rules) {
  HandState hand{composition.cards};
  auto actions = legal_actions(hand, rules, 1, true);
  if (category != "pair")
    actions.erase(std::remove(actions.begin(), actions.end(), Action::Split), actions.end());
  if (row_key == "h4") {
    actions.erase(std::remove(actions.begin(), actions.end(), Action::Double), actions.end());
    actions.erase(std::remove(actions.begin(), actions.end(), Action::Surrender), actions.end());
  }
  if (row_key == "h21" || row_key == "s21") return {Action::Stand};
  return actions;
}

ShoeSample sample_reachable_shoe(const Config& config, const std::vector<Rank>& player,
                                 Rank upcard, int tc_bucket, double decks_remaining,
                                 std::mt19937_64& rng) {
  const int target_cards = std::max(15, static_cast<int>(std::round(decks_remaining * 52.0)));
  const int full_cards = config.rules.decks * 52;
  const int visible_cards = static_cast<int>(player.size()) + 1;
  const int prior_removed = full_cards - target_cards - visible_cards;
  if (prior_removed < 0) throw std::invalid_argument("decksRemaining leaves no room for visible cards");
  for (int attempt = 0; attempt < 200000; ++attempt) {
    Shoe shoe = full_shoe(config.rules.decks);
    int running_count = 0;
    bool valid = true;
    for (Rank rank : player) { valid = remove_card(shoe, rank) && valid; running_count += hi_lo_value(rank); }
    valid = remove_card(shoe, upcard) && valid;
    running_count += hi_lo_value(upcard);
    if (!valid) continue;
    for (int i = 0; i < prior_removed; ++i) running_count += hi_lo_value(draw_card(shoe, rng));
    const double exact_tc = running_count / (target_cards / 52.0);
    if (rounded_true_count(exact_tc, config.true_count_rounding) != tc_bucket) continue;
    for (Rank rank : player) { ++shoe.counts[static_cast<int>(rank)]; ++shoe.total; }
    ++shoe.counts[static_cast<int>(upcard)];
    ++shoe.total;
    return {shoe, running_count, exact_tc};
  }
  throw std::runtime_error("unable to sample reachable shoe for requested count bucket");
}

size_t choose_composition(const std::vector<Composition>& compositions, std::mt19937_64& rng) {
  std::vector<double> weights;
  for (const auto& composition : compositions) weights.push_back(composition.weight);
  return std::discrete_distribution<size_t>(weights.begin(), weights.end())(rng);
}

CellResult simulate_cell(const Config& config, const std::string& category,
                         const std::string& row_key, Rank dealer, int true_count,
                         double decks_remaining, const FrozenPolicy& policy, int iteration) {
  CellResult cell;
  cell.category = category;
  cell.row_key = row_key;
  cell.dealer = dealer_label(dealer);
  cell.true_count = true_count;
  cell.decks_remaining = decks_remaining;
  cell.policy_iteration = iteration;
  const auto compositions = compositions_for(category, row_key, config.rules);
  const auto actions = first_actions(category, row_key, compositions.front(), config.rules);
  for (Action action : actions) cell.actions.push_back({action});
  if (actions.size() == 1) {
    cell.best_action = actions.front();
    cell.converged = true;
    cell.confidence = "high";
    cell.stop_reason = "single-legal-action";
    return cell;
  }

  std::vector<std::vector<ShoeSample>> shoes(compositions.size());
  double exact_tc_sum = 0;
  long long exact_tc_count = 0;
  for (size_t ci = 0; ci < compositions.size(); ++ci) {
    auto rng = make_rng(config, category + row_key + cell.dealer + ":shoe:" + std::to_string(ci) +
                        ":" + std::to_string(true_count) + ":" + std::to_string(decks_remaining), 0);
    for (int i = 0; i < config.shoe_samples_per_bucket; ++i) {
      auto sample = sample_reachable_shoe(config, compositions[ci].cards, dealer, true_count,
                                          decks_remaining, rng);
      exact_tc_sum += sample.exact_true_count;
      ++exact_tc_count;
      shoes[ci].push_back(std::move(sample));
    }
  }
  cell.mean_exact_true_count = exact_tc_count ? exact_tc_sum / exact_tc_count : true_count;

  std::vector<std::vector<RunningStats>> paired(actions.size(),
                                                std::vector<RunningStats>(actions.size()));
  long long completed = 0;
  while (completed < config.max_samples_per_action) {
    const int batch = std::min(config.batch_size,
                               config.max_samples_per_action - static_cast<int>(completed));
    for (int offset = 0; offset < batch; ++offset) {
      const long long sample_index = completed + offset;
      auto selector = make_rng(config, category + row_key + cell.dealer + ":select:" +
                               std::to_string(true_count) + ":" + std::to_string(decks_remaining), sample_index);
      const size_t ci = choose_composition(compositions, selector);
      const auto& composition = compositions[ci];
      const auto& shoe_sample = shoes[ci][static_cast<size_t>(sample_index) % shoes[ci].size()];
      std::vector<double> profits(actions.size());
      for (size_t ai = 0; ai < actions.size(); ++ai) {
        auto rng = make_rng(config, category + row_key + cell.dealer + ":paired:" +
                            std::to_string(true_count) + ":" + std::to_string(decks_remaining), sample_index);
        const auto outcome = simulate_round(config.rules, composition.cards, dealer, actions[ai],
                                            policy, shoe_sample.shoe, rng);
        profits[ai] = outcome.profit;
        cell.actions[ai].stats.add(outcome);
        cell.actions[ai].compositions[composition.key].add(outcome);
        cell.actions[ai].running_counts[shoe_sample.running_count].add(outcome);
      }
      for (size_t i = 0; i < actions.size(); ++i)
        for (size_t j = 0; j < actions.size(); ++j)
          if (i != j) paired[i][j].add_value(profits[i] - profits[j]);
    }
    completed += batch;
    std::vector<size_t> order(actions.size());
    std::iota(order.begin(), order.end(), 0);
    std::sort(order.begin(), order.end(), [&](size_t a, size_t b) {
      return cell.actions[a].stats.mean() > cell.actions[b].stats.mean();
    });
    const auto& difference = paired[order[0]][order[1]];
    cell.winner_margin = difference.mean();
    cell.paired_standard_error = difference.standard_error();
    cell.paired_confidence_low = cell.winner_margin - config.confidence_z * cell.paired_standard_error;
    cell.paired_confidence_high = cell.winner_margin + config.confidence_z * cell.paired_standard_error;
    if (completed >= config.min_samples_per_action &&
        cell.paired_confidence_low > config.minimum_ev_margin) {
      cell.converged = true;
      cell.confidence = "high";
      cell.stop_reason = "paired-confidence";
      break;
    }
  }

  std::sort(cell.actions.begin(), cell.actions.end(), [](const ActionResult& a, const ActionResult& b) {
    return a.stats.mean() > b.stats.mean();
  });
  cell.best_action = cell.actions.front().action;
  if (!cell.converged) { cell.confidence = "low"; cell.stop_reason = "sample-cap"; }
  if (cell.best_action == Action::Double || cell.best_action == Action::Surrender) {
    for (const auto& result : cell.actions) {
      if (result.action != cell.best_action) {
        cell.fallback_action = result.action;
        cell.has_fallback = true;
        break;
      }
    }
  }
  return cell;
}

bool validated_profile(const Rules& rules) {
  return rules.decks == 6 && rules.dealer_hits_soft_17 && rules.dealer_peek &&
    rules.dealer_hole_card && rules.blackjack_payout == "3:2" &&
    rules.double_rule == "anyTwo" && rules.double_after_split &&
    rules.surrender == "late" && rules.max_split_hands == 4 &&
    !rules.resplit_aces && !rules.hit_split_aces && rules.one_card_split_aces &&
    !rules.split_tens_by_value;
}

json rules_json(const Rules& rules) {
  return {{"decks", rules.decks}, {"dealerHitsSoft17", rules.dealer_hits_soft_17},
          {"dealerPeek", rules.dealer_peek}, {"dealerHoleCard", rules.dealer_hole_card},
          {"blackjackPayout", rules.blackjack_payout}, {"doubleRule", rules.double_rule},
          {"doubleAfterSplit", rules.double_after_split}, {"surrender", rules.surrender},
          {"maxSplitHands", rules.max_split_hands}, {"resplitAces", rules.resplit_aces},
          {"hitSplitAces", rules.hit_split_aces}, {"oneCardSplitAces", rules.one_card_split_aces},
          {"insurance", rules.insurance}, {"splitTensByValue", rules.split_tens_by_value},
          {"customRules", json::object()}};
}

json config_json(const Config& config) {
  return {{"name", config.name}, {"seed", config.seed}, {"rules", rules_json(config.rules)},
          {"minSamplesPerAction", config.min_samples_per_action},
          {"maxSamplesPerAction", config.max_samples_per_action}, {"batchSize", config.batch_size},
          {"shoeSamplesPerBucket", config.shoe_samples_per_bucket},
          {"maxPolicyIterations", config.max_policy_iterations},
          {"minimumEvMargin", config.minimum_ev_margin}, {"confidenceZ", config.confidence_z},
          {"trueCountBuckets", config.true_count_buckets},
          {"decksRemainingBuckets", config.decks_remaining_buckets},
          {"trueCountRounding", config.true_count_rounding}};
}

json action_json(const ActionResult& result, double z) {
  const auto& stats = result.stats;
  const double ev = stats.mean();
  const double se = stats.standard_error();
  return {{"action", action_name(result.action)}, {"legal", true}, {"samples", stats.samples},
          {"ev", ev}, {"standardError", se}, {"confidenceLow", ev - z * se},
          {"confidenceHigh", ev + z * se}, {"winRate", stats.rate(stats.wins)},
          {"lossRate", stats.rate(stats.losses)}, {"pushRate", stats.rate(stats.pushes)},
          {"blackjackRate", stats.rate(stats.blackjacks)}, {"bustRate", stats.rate(stats.busts)},
          {"surrenderRate", stats.rate(stats.surrenders)}, {"doubleRate", stats.rate(stats.doubles)},
          {"splitRate", stats.rate(stats.splits)},
          {"averageSplitHands", stats.samples ? static_cast<double>(stats.split_hands) / stats.samples : 0.0}};
}

json cell_json(const CellResult& cell, double z) {
  json actions = json::array();
  for (const auto& action : cell.actions) actions.push_back(action_json(action, z));
  return {{"category", cell.category}, {"rowKey", cell.row_key}, {"dealerUpcard", cell.dealer},
          {"trueCount", cell.true_count}, {"meanExactTrueCount", cell.mean_exact_true_count},
          {"decksRemaining", cell.decks_remaining}, {"bestAction", action_name(cell.best_action)},
          {"winnerMargin", cell.winner_margin}, {"pairedStandardError", cell.paired_standard_error},
          {"pairedConfidenceLow", cell.paired_confidence_low},
          {"pairedConfidenceHigh", cell.paired_confidence_high},
          {"samples", cell.actions.empty() ? 0 : cell.actions.front().stats.samples},
          {"converged", cell.converged}, {"confidence", cell.confidence},
          {"stopReason", cell.stop_reason}, {"policyIteration", cell.policy_iteration},
          {"actions", actions}};
}

json chart_json(const std::vector<CellResult>& cells, int tc, double decks) {
  json chart = {{"hard", json::object()}, {"soft", json::object()}, {"pair", json::object()},
                {"fallbacks", json::object()}};
  for (const auto& cell : cells) {
    if (cell.true_count != tc || cell.decks_remaining != decks) continue;
    chart[cell.category][cell.row_key][cell.dealer] = action_name(cell.best_action);
    if (cell.has_fallback)
      chart["fallbacks"][cell.category][cell.row_key][cell.dealer] = action_name(cell.fallback_action);
  }
  return chart;
}

std::string bucket_slug(int tc, double decks) {
  std::ostringstream value;
  value << "tc" << (tc >= 0 ? "+" : "") << tc << "-dr" << std::fixed << std::setprecision(2) << decks;
  return slug(value.str());
}

void write_artifacts(const Config& config, const std::vector<CellResult>& cells,
                     const std::filesystem::path& run_dir, const std::string& run_id,
                     long long elapsed_ms) {
  const std::string created = now_compact();
  json manifest = {{"id", run_id}, {"createdAt", created}, {"elapsedMs", elapsed_ms},
                   {"simulatorVersion", kSimulatorVersion}, {"config", config_json(config)},
                   {"capabilities", {{"gameFamily", "american-peek"},
                                      {"totalDependent", true}, {"compositionEvidence", true},
                                      {"insuranceSideDecision", true}}},
                   {"hardware", {{"workerThreads", omp_get_max_threads()}}}};
  std::ofstream(run_dir / "manifest.json") << std::setw(2) << manifest << '\n';

  json summary = {{"manifest", manifest}, {"charts", json::object()}, {"cells", json::array()}};
  json composition = json::array();
  json count_strata = json::array();
  for (const auto& cell : cells) {
    summary["cells"].push_back(cell_json(cell, config.confidence_z));
    for (const auto& action : cell.actions) {
      for (const auto& [running_count, stats] : action.running_counts) {
        count_strata.push_back({{"category", cell.category}, {"rowKey", cell.row_key},
          {"dealerUpcard", cell.dealer}, {"decksRemaining", cell.decks_remaining},
          {"runningCount", running_count},
          {"exactTrueCount", running_count / cell.decks_remaining},
          {"action", action_name(action.action)}, {"samples", stats.samples},
          {"ev", stats.mean()}, {"standardError", stats.standard_error()}});
      }
      for (const auto& [key, stats] : action.compositions) {
        composition.push_back({{"category", cell.category}, {"rowKey", cell.row_key},
          {"dealerUpcard", cell.dealer}, {"trueCount", cell.true_count},
          {"decksRemaining", cell.decks_remaining}, {"composition", key},
          {"action", action_name(action.action)}, {"samples", stats.samples}, {"ev", stats.mean()},
          {"standardError", stats.standard_error()}});
      }
    }
  }

  std::filesystem::create_directories(run_dir / "charts");
  for (int tc : config.true_count_buckets) {
    for (double decks : config.decks_remaining_buckets) {
      const std::string bucket = bucket_slug(tc, decks);
      const json chart = chart_json(cells, tc, decks);
      summary["charts"][bucket] = chart;
      std::ofstream(run_dir / "charts" / (bucket + ".json")) << std::setw(2) << chart << '\n';
      bool converged = true;
      for (const auto& cell : cells)
        if (cell.true_count == tc && cell.decks_remaining == decks && !cell.converged) converged = false;
      json package_cells = json::array();
      for (const auto& cell : cells)
        if (cell.true_count == tc && cell.decks_remaining == decks)
          package_cells.push_back(cell_json(cell, config.confidence_z));
      json package = {{"schemaVersion", 1}, {"name", config.name + " " + bucket},
        {"rules", rules_json(config.rules)}, {"chart", chart}, {"cells", package_cells},
        {"source", {{"simulatorRunId", run_id}, {"seed", config.seed}, {"trueCount", tc},
                    {"decksRemaining", decks}, {"artifactPath", (run_dir / "charts" / (bucket + ".json")).string()}}},
        {"validation", {{"gameFamily", "american-peek"}, {"fullySupported", validated_profile(config.rules)},
                        {"allCellsConverged", converged}, {"totalDependent", true}}}};
      std::ofstream(run_dir / "charts" / (bucket + ".import-package.json")) << std::setw(2) << package << '\n';
      if (config.true_count_buckets.size() == 1 && config.decks_remaining_buckets.size() == 1) {
        std::ofstream(run_dir / "chart.json") << std::setw(2) << chart << '\n';
        std::ofstream(run_dir / "import-package.json") << std::setw(2) << package << '\n';
      }
    }
  }
  std::ofstream(run_dir / "simulation-summary.json") << std::setw(2) << summary << '\n';
  std::ofstream(run_dir / "composition-results.json") << std::setw(2) << composition << '\n';
  std::ofstream(run_dir / "count-strata-results.json") << std::setw(2) << count_strata << '\n';

  json insurance = json::array();
  if (config.rules.insurance) {
    for (int tc : config.true_count_buckets) for (double decks : config.decks_remaining_buckets) {
      double probability_sum = 0;
      int samples = 0;
      auto rng = make_rng(config, "insurance:" + std::to_string(tc) + ":" + std::to_string(decks), 0);
      for (int i = 0; i < config.shoe_samples_per_bucket; ++i) {
        const auto shoe_sample = sample_reachable_shoe(config, {Rank::Ten, Rank::Nine}, Rank::Ace,
                                                       tc, decks, rng);
        int ten_cards = 0;
        for (int ri = 9; ri < 13; ++ri) ten_cards += shoe_sample.shoe.counts[ri];
        probability_sum += static_cast<double>(ten_cards) / shoe_sample.shoe.total;
        ++samples;
      }
      const double probability = probability_sum / samples;
      insurance.push_back({{"trueCount", tc}, {"decksRemaining", decks},
                           {"dealerBlackjackProbability", probability},
                           {"takeEv", 3.0 * probability - 1.0}, {"declineEv", 0.0},
                           {"bestDecision", probability > 1.0 / 3.0 ? "take" : "decline"},
                           {"samples", samples}});
    }
  }
  std::ofstream(run_dir / "insurance-results.json") << std::setw(2) << insurance << '\n';
}

}  // namespace

int run_simulation(const RunOptions& options) {
  try {
    const auto start = std::chrono::steady_clock::now();
    const Config config = parse_config(options.config_path);
    const std::string run_id = slug(config.name) + "-" + now_compact();
    const std::filesystem::path run_dir = std::filesystem::path(options.output_dir) / run_id;
    std::filesystem::create_directories(run_dir);
    std::vector<CellResult> final_cells;
    const auto row_list = rows();
    const auto dealers = dealer_ranks();

    for (int tc : config.true_count_buckets) {
      for (double decks : config.decks_remaining_buckets) {
        std::unordered_map<std::string, Action> policy_actions;
        std::vector<CellResult> bucket_cells;
        bool policy_stable = false;
        for (int iteration = 1; iteration <= config.max_policy_iterations; ++iteration) {
          FrozenPolicy policy(policy_actions);
          const int total = static_cast<int>(row_list.size() * dealers.size());
          bucket_cells.assign(total, {});
          #pragma omp parallel for schedule(dynamic, 1)
          for (int index = 0; index < total; ++index) {
            const auto& [category, row_key] = row_list[index / static_cast<int>(dealers.size())];
            const Rank dealer = dealers[index % dealers.size()];
            bucket_cells[index] = simulate_cell(config, category, row_key, dealer, tc, decks,
                                                policy, iteration);
          }
          bool stable = true;
          for (const auto& cell : bucket_cells) {
            const std::string key = cell.category + ":" + cell.row_key + ":" + cell.dealer;
            const auto found = policy_actions.find(key);
            if (found == policy_actions.end() || found->second != cell.best_action) stable = false;
            policy_actions[key] = cell.best_action;
          }
          if (stable) { policy_stable = true; break; }
        }
        if (!policy_stable) {
          for (auto& cell : bucket_cells) {
            cell.converged = false;
            cell.confidence = "low";
            cell.stop_reason = "policy-iteration-cap";
          }
        }
        final_cells.insert(final_cells.end(), bucket_cells.begin(), bucket_cells.end());
      }
    }

    const auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - start).count();
    write_artifacts(config, final_cells, run_dir, run_id, elapsed_ms);
    std::cout << run_dir.string() << '\n';
    std::cerr << "elapsed: " << elapsed_ms / 1000.0 << "s\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}

int export_chart(const std::string& run_dir) {
  std::ifstream input(std::filesystem::path(run_dir) / "chart.json");
  if (!input) { std::cerr << "missing chart.json in " << run_dir << '\n'; return 1; }
  std::cout << input.rdbuf();
  return 0;
}

}  // namespace blackjack_sim
