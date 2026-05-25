#include "simulator.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <random>
#include <regex>
#include <sstream>
#include <string>
#include <vector>

namespace blackjack_sim {
namespace {

using Hand = std::vector<int>;
using Shoe = std::vector<int>;

struct Rules {
  int decks = 6;
  bool dealer_hits_soft_17 = true;
  bool double_after_split = true;
  std::string surrender = "late";
  std::string blackjack_payout = "3:2";
  int max_split_hands = 4;
  bool resplit_aces = false;
  bool hit_split_aces = false;
  std::string double_rule = "anyTwo";
};

struct Config {
  std::string name = "strategy-sim";
  std::string seed = "default-seed";
  int samples_per_action = 200;
  int true_count = 0;
  double decks_remaining = 6.0;
  int max_policy_iterations = 1;
  double convergence_epsilon = 0.0005;
  Rules rules;
};

struct HandValue {
  int total = 0;
  bool soft = false;
};

struct Outcome {
  double ev = 0.0;
  bool blackjack = false;
  bool bust = false;
  bool surrendered = false;
  bool doubled = false;
  int split_hands = 1;
};

struct Accumulator {
  int samples = 0;
  double sum = 0.0;
  double sum_sq = 0.0;
  int wins = 0;
  int losses = 0;
  int pushes = 0;
  int blackjacks = 0;
  int busts = 0;
  int surrenders = 0;
  int doubles = 0;
  int splits = 0;
  int split_hands = 0;
};

struct ActionResult {
  std::string action;
  bool legal = true;
  Accumulator acc;
};

struct CellResult {
  std::string category;
  std::string row_key;
  std::string dealer;
  std::string best_action;
  double winner_margin = 0.0;
  std::vector<ActionResult> actions;
};

std::string read_file(const std::string& path) {
  std::ifstream in(path);
  if (!in) throw std::runtime_error("unable to read config: " + path);
  std::ostringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

std::string json_string(const std::string& text, const std::string& key, const std::string& fallback) {
  const std::regex pattern("\\\"" + key + "\\\"\\s*:\\s*\\\"([^\\\"]*)\\\"");
  std::smatch match;
  return std::regex_search(text, match, pattern) ? match[1].str() : fallback;
}

int json_int(const std::string& text, const std::string& key, int fallback) {
  const std::regex pattern("\\\"" + key + "\\\"\\s*:\\s*(-?[0-9]+)");
  std::smatch match;
  return std::regex_search(text, match, pattern) ? std::stoi(match[1].str()) : fallback;
}

double json_double(const std::string& text, const std::string& key, double fallback) {
  const std::regex pattern("\\\"" + key + "\\\"\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)");
  std::smatch match;
  return std::regex_search(text, match, pattern) ? std::stod(match[1].str()) : fallback;
}

bool json_bool(const std::string& text, const std::string& key, bool fallback) {
  const std::regex pattern("\\\"" + key + "\\\"\\s*:\\s*(true|false)");
  std::smatch match;
  return std::regex_search(text, match, pattern) ? match[1].str() == "true" : fallback;
}

Config parse_config(const std::string& path) {
  const auto text = read_file(path);
  Config c;
  c.name = json_string(text, "name", c.name);
  c.seed = json_string(text, "seed", c.seed);
  c.samples_per_action = std::max(1, json_int(text, "samplesPerAction", c.samples_per_action));
  c.true_count = json_int(text, "trueCount", c.true_count);
  c.decks_remaining = json_double(text, "decksRemaining", c.decks_remaining);
  c.max_policy_iterations = std::max(1, json_int(text, "maxPolicyIterations", c.max_policy_iterations));
  c.convergence_epsilon = json_double(text, "convergenceEpsilon", c.convergence_epsilon);
  c.rules.decks = std::max(1, json_int(text, "decks", c.rules.decks));
  c.rules.dealer_hits_soft_17 = json_bool(text, "dealerHitsSoft17", c.rules.dealer_hits_soft_17);
  c.rules.double_after_split = json_bool(text, "doubleAfterSplit", c.rules.double_after_split);
  c.rules.surrender = json_string(text, "surrender", c.rules.surrender);
  c.rules.blackjack_payout = json_string(text, "blackjackPayout", c.rules.blackjack_payout);
  c.rules.max_split_hands = std::max(1, json_int(text, "maxSplitHands", c.rules.max_split_hands));
  c.rules.resplit_aces = json_bool(text, "resplitAces", c.rules.resplit_aces);
  c.rules.hit_split_aces = json_bool(text, "hitSplitAces", c.rules.hit_split_aces);
  c.rules.double_rule = json_string(text, "doubleRule", c.rules.double_rule);
  return c;
}

uint64_t hash_seed(const std::string& value) {
  uint64_t hash = 1469598103934665603ull;
  for (unsigned char c : value) {
    hash ^= c;
    hash *= 1099511628211ull;
  }
  return hash;
}

std::mt19937_64 make_rng(const Config& config, const std::string& label, int sample) {
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
  if (!value.empty() && value.back() == '-') value.pop_back();
  return value.empty() ? "strategy-sim" : value;
}

std::string rank_label(int rank) {
  if (rank == 1) return "A";
  if (rank == 10) return "10";
  return std::to_string(rank);
}

int dealer_value(const std::string& dealer) {
  if (dealer == "A") return 1;
  return dealer == "10" ? 10 : std::stoi(dealer);
}

HandValue value_of(const Hand& hand) {
  int total = 0;
  int aces = 0;
  for (int card : hand) {
    if (card == 1) {
      total += 11;
      aces += 1;
    } else {
      total += card;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return {total, aces > 0};
}

bool blackjack(const Hand& hand) {
  return hand.size() == 2 && value_of(hand).total == 21;
}

Shoe full_shoe(int decks) {
  Shoe shoe;
  shoe.reserve(static_cast<size_t>(52 * decks));
  for (int deck = 0; deck < decks; ++deck) {
    for (int i = 0; i < 4; ++i) shoe.push_back(1);
    for (int rank = 2; rank <= 9; ++rank) {
      for (int i = 0; i < 4; ++i) shoe.push_back(rank);
    }
    for (int i = 0; i < 16; ++i) shoe.push_back(10);
  }
  return shoe;
}

void remove_one(Shoe& shoe, int rank) {
  auto it = std::find(shoe.begin(), shoe.end(), rank);
  if (it != shoe.end()) shoe.erase(it);
}

int draw(Shoe& shoe, std::mt19937_64& rng) {
  if (shoe.empty()) shoe = full_shoe(6);
  std::uniform_int_distribution<size_t> dist(0, shoe.size() - 1);
  const size_t index = dist(rng);
  const int card = shoe[index];
  shoe[index] = shoe.back();
  shoe.pop_back();
  return card;
}

bool double_allowed(const Rules& rules, const Hand& hand) {
  if (hand.size() != 2 || rules.double_rule == "none") return false;
  const auto value = value_of(hand);
  if (rules.double_rule == "anyTwo") return true;
  if (rules.double_rule == "hardOnly") return !value.soft;
  if (rules.double_rule == "nineToEleven") return value.total >= 9 && value.total <= 11;
  if (rules.double_rule == "tenToEleven") return value.total == 10 || value.total == 11;
  return true;
}

bool split_allowed(const Rules& rules, const Hand& hand, int split_hands) {
  if (hand.size() != 2 || hand[0] != hand[1] || split_hands >= rules.max_split_hands) return false;
  if (hand[0] == 1 && split_hands > 1 && !rules.resplit_aces) return false;
  return true;
}

bool dealer_should_hit(const Rules& rules, const Hand& hand) {
  const auto value = value_of(hand);
  if (value.total < 17) return true;
  return value.total == 17 && value.soft && rules.dealer_hits_soft_17;
}

Hand dealer_final(const Rules& rules, Hand dealer, Shoe shoe, std::mt19937_64& rng) {
  while (dealer_should_hit(rules, dealer)) dealer.push_back(draw(shoe, rng));
  return dealer;
}

double blackjack_payout(const Rules& rules) {
  return rules.blackjack_payout == "6:5" ? 1.2 : 1.5;
}

Outcome settle(const Rules& rules, const Hand& player, Hand dealer, Shoe shoe, std::mt19937_64& rng, double bet, bool natural = false) {
  Outcome out;
  out.blackjack = natural;
  const auto player_value = value_of(player);
  if (player_value.total > 21) {
    out.ev = -bet;
    out.bust = true;
    return out;
  }
  if (natural && !blackjack(dealer)) {
    out.ev = blackjack_payout(rules) * bet;
    return out;
  }
  dealer = dealer_final(rules, dealer, std::move(shoe), rng);
  const auto dealer_value_result = value_of(dealer);
  if (dealer_value_result.total > 21 || player_value.total > dealer_value_result.total) out.ev = bet;
  else if (player_value.total < dealer_value_result.total) out.ev = -bet;
  else out.ev = 0.0;
  return out;
}

std::vector<std::string> legal_actions(const Rules& rules, const Hand& hand, bool can_double, bool can_surrender, bool after_split_aces, int split_hands) {
  std::vector<std::string> actions{"stand"};
  const auto value = value_of(hand);
  if (value.total < 21 && !after_split_aces) actions.push_back("hit");
  if (can_double && double_allowed(rules, hand)) actions.push_back("double");
  if (can_surrender && hand.size() == 2 && rules.surrender != "none") actions.push_back("surrender");
  if (split_allowed(rules, hand, split_hands)) actions.push_back("split");
  return actions;
}

Outcome play_action(const Config& config, const std::string& action, Hand player, Hand dealer, Shoe shoe, std::mt19937_64& rng, int depth, int split_hands, bool after_split_aces);

Outcome optimal_ev(const Config& config, Hand player, Hand dealer, Shoe shoe, std::mt19937_64& rng, int depth, int split_hands, bool can_double, bool can_surrender, bool after_split_aces) {
  if (value_of(player).total > 21) return {-1.0, false, true};
  if (depth >= 8) return settle(config.rules, player, dealer, std::move(shoe), rng, 1.0, false);
  const int policy_samples = std::max(6, std::min(32, config.samples_per_action / 8));
  double best = -100.0;
  Outcome best_outcome;
  for (const auto& action : legal_actions(config.rules, player, can_double, can_surrender, after_split_aces, split_hands)) {
    double ev = 0.0;
    Outcome representative;
    for (int i = 0; i < policy_samples; ++i) {
      auto branch_shoe = shoe;
      auto branch_rng = rng;
      branch_rng.discard(static_cast<unsigned long long>(i + depth * 17));
      auto outcome = play_action(config, action, player, dealer, branch_shoe, branch_rng, depth + 1, split_hands, after_split_aces);
      ev += outcome.ev;
      representative = outcome;
    }
    ev /= static_cast<double>(policy_samples);
    if (ev > best) {
      best = ev;
      best_outcome = representative;
      best_outcome.ev = ev;
    }
  }
  return best_outcome;
}

Outcome play_action(const Config& config, const std::string& action, Hand player, Hand dealer, Shoe shoe, std::mt19937_64& rng, int depth, int split_hands, bool after_split_aces) {
  if (action == "surrender") return {-0.5, false, false, true, false, split_hands};
  if (action == "stand") return settle(config.rules, player, dealer, std::move(shoe), rng, 1.0, blackjack(player));
  if (action == "double") {
    player.push_back(draw(shoe, rng));
    auto outcome = settle(config.rules, player, dealer, std::move(shoe), rng, 2.0, false);
    outcome.doubled = true;
    return outcome;
  }
  if (action == "hit") {
    player.push_back(draw(shoe, rng));
    return optimal_ev(config, player, dealer, std::move(shoe), rng, depth + 1, split_hands, false, false, false);
  }
  if (action == "split") {
    Outcome combined;
    combined.split_hands = split_hands + 1;
    combined.split_hands = std::max(combined.split_hands, 2);
    combined.split_hands = std::min(combined.split_hands, config.rules.max_split_hands);
    combined.split_hands = std::max(combined.split_hands, split_hands + 1);
    combined.split_hands = std::max(combined.split_hands, 2);
    const int rank = player[0];
    for (int i = 0; i < 2; ++i) {
      Hand child{rank, draw(shoe, rng)};
      const bool split_aces = rank == 1;
      const bool locked_ace = split_aces && !config.rules.hit_split_aces;
      auto child_outcome = locked_ace
        ? settle(config.rules, child, dealer, shoe, rng, 1.0, false)
        : optimal_ev(config, child, dealer, shoe, rng, depth + 1, split_hands + 1, config.rules.double_after_split, false, false);
      combined.ev += child_outcome.ev;
      combined.blackjack = combined.blackjack || child_outcome.blackjack;
      combined.bust = combined.bust || child_outcome.bust;
      combined.doubled = combined.doubled || child_outcome.doubled;
    }
    return combined;
  }
  return settle(config.rules, player, dealer, std::move(shoe), rng, 1.0, false);
}

void add(Accumulator& acc, const Outcome& outcome) {
  acc.samples += 1;
  acc.sum += outcome.ev;
  acc.sum_sq += outcome.ev * outcome.ev;
  if (outcome.ev > 0) acc.wins += 1;
  else if (outcome.ev < 0) acc.losses += 1;
  else acc.pushes += 1;
  if (outcome.blackjack) acc.blackjacks += 1;
  if (outcome.bust) acc.busts += 1;
  if (outcome.surrendered) acc.surrenders += 1;
  if (outcome.doubled) acc.doubles += 1;
  if (outcome.split_hands > 1) acc.splits += 1;
  acc.split_hands += outcome.split_hands;
}

double mean(const Accumulator& acc) {
  return acc.samples ? acc.sum / static_cast<double>(acc.samples) : 0.0;
}

double standard_error(const Accumulator& acc) {
  if (acc.samples <= 1) return 0.0;
  const double m = mean(acc);
  const double variance = std::max(0.0, acc.sum_sq / static_cast<double>(acc.samples) - m * m);
  return std::sqrt(variance / static_cast<double>(acc.samples));
}

double rate(int count, const Accumulator& acc) {
  return acc.samples ? static_cast<double>(count) / static_cast<double>(acc.samples) : 0.0;
}

Hand sample_hand(const std::string& category, const std::string& row_key) {
  if (category == "pair") {
    const std::string rank = row_key.substr(1);
    const int value = dealer_value(rank);
    return {value, value};
  }
  if (category == "soft") return {1, std::stoi(row_key.substr(1)) - 11};
  const int total = std::stoi(row_key.substr(1));
  for (int a = 2; a <= 10; ++a) {
    for (int b = 2; b <= 10; ++b) {
      if (a != b && a + b == total) return {a, b};
    }
  }
  return {10, std::max(2, total - 10)};
}

std::vector<std::tuple<std::string, std::string>> rows() {
  std::vector<std::tuple<std::string, std::string>> out;
  for (int total = 4; total <= 21; ++total) out.emplace_back("hard", "h" + std::to_string(total));
  for (int total = 13; total <= 21; ++total) out.emplace_back("soft", "s" + std::to_string(total));
  for (const std::string& rank : {"A", "10", "9", "8", "7", "6", "5", "4", "3", "2"}) out.emplace_back("pair", "p" + rank);
  return out;
}

std::vector<std::string> dealers() {
  return {"2", "3", "4", "5", "6", "7", "8", "9", "10", "A"};
}

CellResult simulate_cell(const Config& config, const std::string& category, const std::string& row_key, const std::string& dealer_label) {
  const Hand initial = sample_hand(category, row_key);
  const int upcard = dealer_value(dealer_label);
  CellResult cell{category, row_key, dealer_label};
  const bool after_split_aces = false;
  auto actions = legal_actions(config.rules, initial, true, true, after_split_aces, 1);
  if (category != "pair") {
    actions.erase(std::remove(actions.begin(), actions.end(), "split"), actions.end());
  }
  for (const auto& action : actions) {
    ActionResult result{action, true};
    for (int sample = 0; sample < config.samples_per_action; ++sample) {
      Shoe shoe = full_shoe(config.rules.decks);
      for (int card : initial) remove_one(shoe, card);
      remove_one(shoe, upcard);
      auto rng = make_rng(config, category + row_key + dealer_label + action, sample);
      Hand dealer{upcard, draw(shoe, rng)};
      auto outcome = play_action(config, action, initial, dealer, std::move(shoe), rng, 0, 1, false);
      add(result.acc, outcome);
    }
    cell.actions.push_back(result);
  }
  std::sort(cell.actions.begin(), cell.actions.end(), [](const ActionResult& a, const ActionResult& b) {
    return mean(a.acc) > mean(b.acc);
  });
  cell.best_action = cell.actions.empty() ? "stand" : cell.actions.front().action;
  if (cell.actions.size() >= 2) cell.winner_margin = mean(cell.actions[0].acc) - mean(cell.actions[1].acc);
  return cell;
}

std::string action_json(const ActionResult& action) {
  const auto& a = action.acc;
  const double ev = mean(a);
  const double se = standard_error(a);
  std::ostringstream out;
  out << "{\"action\":\"" << action.action << "\",\"legal\":true,\"samples\":" << a.samples
      << ",\"ev\":" << ev << ",\"standardError\":" << se
      << ",\"confidenceLow\":" << ev - 1.96 * se << ",\"confidenceHigh\":" << ev + 1.96 * se
      << ",\"winRate\":" << rate(a.wins, a) << ",\"lossRate\":" << rate(a.losses, a)
      << ",\"pushRate\":" << rate(a.pushes, a) << ",\"blackjackRate\":" << rate(a.blackjacks, a)
      << ",\"bustRate\":" << rate(a.busts, a) << ",\"surrenderRate\":" << rate(a.surrenders, a)
      << ",\"doubleRate\":" << rate(a.doubles, a) << ",\"splitRate\":" << rate(a.splits, a)
      << ",\"averageSplitHands\":" << (a.samples ? static_cast<double>(a.split_hands) / a.samples : 0.0) << "}";
  return out.str();
}

std::string rules_json(const Rules& r) {
  std::ostringstream out;
  out << "{\"decks\":" << r.decks
      << ",\"dealerHitsSoft17\":" << (r.dealer_hits_soft_17 ? "true" : "false")
      << ",\"dealerPeek\":true,\"dealerHoleCard\":true"
      << ",\"blackjackPayout\":\"" << r.blackjack_payout << "\""
      << ",\"doubleRule\":\"" << r.double_rule << "\""
      << ",\"doubleAfterSplit\":" << (r.double_after_split ? "true" : "false")
      << ",\"surrender\":\"" << r.surrender << "\""
      << ",\"maxSplitHands\":" << r.max_split_hands
      << ",\"resplitAces\":" << (r.resplit_aces ? "true" : "false")
      << ",\"hitSplitAces\":" << (r.hit_split_aces ? "true" : "false")
      << ",\"oneCardSplitAces\":" << (!r.hit_split_aces ? "true" : "false")
      << ",\"insurance\":true,\"splitTensByValue\":false,\"customRules\":{}}";
  return out.str();
}

void write_manifest(const Config& config, const std::filesystem::path& run_dir, const std::string& run_id) {
  std::ofstream out(run_dir / "manifest.json");
  out << "{\n  \"id\": \"" << run_id << "\",\n  \"createdAt\": \"" << now_compact() << "\",\n"
      << "  \"simulatorVersion\": \"0.1.0\",\n  \"config\": {\n"
      << "    \"name\": \"" << config.name << "\",\n    \"seed\": \"" << config.seed << "\",\n"
      << "    \"rules\": " << rules_json(config.rules) << ",\n"
      << "    \"samplesPerAction\": " << config.samples_per_action << ",\n"
      << "    \"trueCountBuckets\": [" << config.true_count << "],\n"
      << "    \"decksRemainingBuckets\": [" << config.decks_remaining << "],\n"
      << "    \"maxPolicyIterations\": " << config.max_policy_iterations << ",\n"
      << "    \"convergenceEpsilon\": " << config.convergence_epsilon << "\n  },\n"
      << "  \"hardware\": { \"gpu\": \"NVIDIA GB10\", \"cuda\": \"13.0\" }\n}\n";
}

void write_chart(const std::vector<CellResult>& cells, const std::filesystem::path& run_dir) {
  std::map<std::string, std::map<std::string, std::map<std::string, std::string>>> chart;
  for (const auto& cell : cells) chart[cell.category][cell.row_key][cell.dealer] = cell.best_action;
  std::ofstream out(run_dir / "chart.json");
  out << "{\n";
  int section_i = 0;
  for (const auto& [section, rows_map] : chart) {
    out << (section_i++ ? ",\n" : "") << "  \"" << section << "\": {\n";
    int row_i = 0;
    for (const auto& [row, dealer_map] : rows_map) {
      out << (row_i++ ? ",\n" : "") << "    \"" << row << "\": {";
      int dealer_i = 0;
      for (const auto& dealer : dealers()) {
        out << (dealer_i++ ? ", " : "") << "\"" << dealer << "\": \"" << dealer_map.at(dealer) << "\"";
      }
      out << "}";
    }
    out << "\n  }";
  }
  out << "\n}\n";
}

void write_summary(const Config& config, const std::vector<CellResult>& cells, const std::filesystem::path& run_dir) {
  std::ofstream csv(run_dir / "summary.csv");
  csv << "category,row_key,dealer,true_count,decks_remaining,best_action,winner_margin,action,samples,ev,standard_error,confidence_low,confidence_high,win_rate,loss_rate,push_rate,blackjack_rate,bust_rate,surrender_rate,double_rate,split_rate,average_split_hands\n";
  std::ofstream sql(run_dir / "results.sql");
  sql << "CREATE TABLE IF NOT EXISTS action_stats(category TEXT,row_key TEXT,dealer_upcard TEXT,true_count REAL,decks_remaining REAL,best_action TEXT,winner_margin REAL,action TEXT,samples INTEGER,ev REAL,standard_error REAL,confidence_low REAL,confidence_high REAL,win_rate REAL,loss_rate REAL,push_rate REAL,blackjack_rate REAL,bust_rate REAL,surrender_rate REAL,double_rate REAL,split_rate REAL,average_split_hands REAL);\nBEGIN;\n";
  for (const auto& cell : cells) {
    for (const auto& action : cell.actions) {
      const auto& a = action.acc;
      const double ev = mean(a);
      const double se = standard_error(a);
      const double low = ev - 1.96 * se;
      const double high = ev + 1.96 * se;
      const double avg_split = a.samples ? static_cast<double>(a.split_hands) / a.samples : 0.0;
      csv << cell.category << ',' << cell.row_key << ',' << cell.dealer << ',' << config.true_count << ',' << config.decks_remaining << ',' << cell.best_action << ',' << cell.winner_margin << ',' << action.action << ',' << a.samples << ',' << ev << ',' << se << ',' << low << ',' << high << ',' << rate(a.wins, a) << ',' << rate(a.losses, a) << ',' << rate(a.pushes, a) << ',' << rate(a.blackjacks, a) << ',' << rate(a.busts, a) << ',' << rate(a.surrenders, a) << ',' << rate(a.doubles, a) << ',' << rate(a.splits, a) << ',' << avg_split << "\n";
      sql << "INSERT INTO action_stats VALUES('" << cell.category << "','" << cell.row_key << "','" << cell.dealer << "'," << config.true_count << ',' << config.decks_remaining << ",'" << cell.best_action << "'," << cell.winner_margin << ",'" << action.action << "'," << a.samples << ',' << ev << ',' << se << ',' << low << ',' << high << ',' << rate(a.wins, a) << ',' << rate(a.losses, a) << ',' << rate(a.pushes, a) << ',' << rate(a.blackjacks, a) << ',' << rate(a.busts, a) << ',' << rate(a.surrenders, a) << ',' << rate(a.doubles, a) << ',' << rate(a.splits, a) << ',' << avg_split << ");\n";
    }
  }
  sql << "COMMIT;\n";
}

void write_summary_json(const Config& config, const std::vector<CellResult>& cells, const std::filesystem::path& run_dir, const std::string& run_id) {
  std::ofstream out(run_dir / "simulation-summary.json");
  out << "{\"manifest\":{\"id\":\"" << run_id << "\",\"createdAt\":\"" << now_compact() << "\",\"simulatorVersion\":\"0.1.0\",\"config\":{\"name\":\"" << config.name << "\",\"seed\":\"" << config.seed << "\",\"rules\":" << rules_json(config.rules) << ",\"samplesPerAction\":" << config.samples_per_action << ",\"trueCountBuckets\":[" << config.true_count << "],\"decksRemainingBuckets\":[" << config.decks_remaining << "],\"maxPolicyIterations\":" << config.max_policy_iterations << ",\"convergenceEpsilon\":" << config.convergence_epsilon << "}},\"cells\":[";
  bool first_cell = true;
  for (const auto& cell : cells) {
    out << (first_cell ? "" : ",");
    first_cell = false;
    out << "{\"category\":\"" << cell.category << "\",\"rowKey\":\"" << cell.row_key << "\",\"dealerUpcard\":\"" << cell.dealer << "\",\"trueCount\":" << config.true_count << ",\"decksRemaining\":" << config.decks_remaining << ",\"bestAction\":\"" << cell.best_action << "\",\"winnerMargin\":" << cell.winner_margin << ",\"samples\":" << config.samples_per_action << ",\"converged\":false,\"policyIteration\":1,\"actions\":[";
    for (size_t i = 0; i < cell.actions.size(); ++i) out << (i ? "," : "") << action_json(cell.actions[i]);
    out << "]}";
  }
  out << "]}\n";
}

}  // namespace

int run_simulation(const RunOptions& options) {
  try {
    const Config config = parse_config(options.config_path);
    const std::string run_id = slug(config.name) + "-" + now_compact();
    const std::filesystem::path run_dir = std::filesystem::path(options.output_dir) / run_id;
    std::filesystem::create_directories(run_dir);

    std::vector<CellResult> cells;
    for (const auto& [category, row_key] : rows()) {
      for (const auto& dealer : dealers()) {
        cells.push_back(simulate_cell(config, category, row_key, dealer));
      }
    }

    write_manifest(config, run_dir, run_id);
    write_chart(cells, run_dir);
    write_summary(config, cells, run_dir);
    write_summary_json(config, cells, run_dir, run_id);
    run_sqlite3_script((run_dir / "results.sqlite").string(), (run_dir / "results.sql").string());
    std::cout << run_dir.string() << "\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << "\n";
    return 1;
  }
}

int export_chart(const std::string& run_dir) {
  const auto chart = std::filesystem::path(run_dir) / "chart.json";
  std::ifstream in(chart);
  if (!in) {
    std::cerr << "missing chart.json in " << run_dir << "\n";
    return 1;
  }
  std::cout << in.rdbuf();
  return 0;
}

}  // namespace blackjack_sim
