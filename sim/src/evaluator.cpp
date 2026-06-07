#include "evaluator.hpp"

#include "blackjack.hpp"
#include "strategy_package.hpp"

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <numeric>
#include <memory>
#include <nlohmann/json.hpp>
#include <omp.h>
#include <random>
#include <set>
#include <sstream>
#include <stdexcept>
#include <vector>
#include <zstd.h>

namespace blackjack_sim {
namespace {
using json = nlohmann::json;
constexpr const char* kEvaluatorVersion = "0.1.0";

struct RetentionConfig {
  std::string mode = "aggregate";
  long long sample_every = 1000;
  bool acknowledge_large_output = false;
};

struct EvaluationConfig {
  std::string name;
  std::string seed;
  std::string strategy_path;
  std::string mode;
  long long rounds = 0;
  int paths = 0;
  double penetration_percent = 75.0;
  int observer_seats = 1;
  double rounds_per_hour = 100.0;
  double confidence_z = 1.96;
  std::vector<double> risk_bankroll_units;
  RetentionConfig retention;
};

struct Stats {
  long long rounds = 0;
  long long wagered_rounds = 0;
  double profit = 0.0;
  double profit_sq = 0.0;
  double initial_wagers = 0.0;
  double exposure = 0.0;
  long long wins = 0;
  long long losses = 0;
  long long pushes = 0;
  long long blackjacks = 0;
  long long dealer_blackjacks = 0;
  long long busts = 0;
  long long surrenders = 0;
  long long doubles = 0;
  long long splits = 0;
  long long insurance_taken = 0;
  long long even_money_taken = 0;

  void add(const CompleteRoundOutcome& outcome) {
    ++rounds;
    ++wagered_rounds;
    profit += outcome.profit;
    profit_sq += outcome.profit * outcome.profit;
    initial_wagers += outcome.initial_wager;
    exposure += outcome.total_exposure;
    wins += outcome.profit > 0 ? 1 : 0;
    losses += outcome.profit < 0 ? 1 : 0;
    pushes += outcome.profit == 0 ? 1 : 0;
    blackjacks += outcome.player_blackjack ? 1 : 0;
    dealer_blackjacks += outcome.dealer_blackjack ? 1 : 0;
    busts += outcome.busts > 0 ? 1 : 0;
    surrenders += outcome.surrenders > 0 ? 1 : 0;
    doubles += outcome.doubles > 0 ? 1 : 0;
    splits += outcome.hands > 1 ? 1 : 0;
    insurance_taken += outcome.insurance_taken ? 1 : 0;
    even_money_taken += outcome.even_money_taken ? 1 : 0;
  }

  void add_observed_round() { ++rounds; }
  void merge(const Stats& other) {
    rounds += other.rounds; wagered_rounds += other.wagered_rounds;
    profit += other.profit; profit_sq += other.profit_sq;
    initial_wagers += other.initial_wagers; exposure += other.exposure;
    wins += other.wins; losses += other.losses; pushes += other.pushes;
    blackjacks += other.blackjacks; dealer_blackjacks += other.dealer_blackjacks;
    busts += other.busts; surrenders += other.surrenders; doubles += other.doubles;
    splits += other.splits; insurance_taken += other.insurance_taken;
    even_money_taken += other.even_money_taken;
  }
};

struct PathResult {
  Stats stats;
  double max_drawdown = 0.0;
  std::vector<bool> ruined;
  std::map<std::string, Stats> cubes;
};

struct ObserverOutcome { int cards_consumed = 0; int running_count_delta = 0; };

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

EvaluationConfig parse_evaluation_config(const std::string& path) {
  std::ifstream input(path);
  if (!input) throw std::runtime_error("unable to read evaluation config: " + path);
  json value; input >> value;
  reject_unknown(value, {"name", "seed", "strategy", "mode", "rounds", "paths",
                         "penetrationPercent", "observerSeats", "roundsPerHour", "confidenceZ",
                         "riskBankrollUnits", "retention"}, "evaluation config");
  EvaluationConfig config;
  config.name = required<std::string>(value, "name", "evaluation config");
  config.seed = required<std::string>(value, "seed", "evaluation config");
  config.strategy_path = required<std::string>(value, "strategy", "evaluation config");
  config.mode = required<std::string>(value, "mode", "evaluation config");
  config.rounds = required<long long>(value, "rounds", "evaluation config");
  config.paths = required<int>(value, "paths", "evaluation config");
  config.penetration_percent = required<double>(value, "penetrationPercent", "evaluation config");
  config.observer_seats = required<int>(value, "observerSeats", "evaluation config");
  config.rounds_per_hour = required<double>(value, "roundsPerHour", "evaluation config");
  config.confidence_z = required<double>(value, "confidenceZ", "evaluation config");
  config.risk_bankroll_units = required<std::vector<double>>(value, "riskBankrollUnits", "evaluation config");
  const json retention = required<json>(value, "retention", "evaluation config");
  reject_unknown(retention, {"mode", "sampleEvery", "acknowledgeLargeOutput"}, "retention");
  config.retention.mode = required<std::string>(retention, "mode", "retention");
  config.retention.sample_every = required<long long>(retention, "sampleEvery", "retention");
  config.retention.acknowledge_large_output = required<bool>(retention, "acknowledgeLargeOutput", "retention");

  if (config.name.empty() || config.seed.empty()) throw std::invalid_argument("name and seed cannot be empty");
  if (config.mode != "fresh-round" && config.mode != "continuous-shoe")
    throw std::invalid_argument("mode must be fresh-round or continuous-shoe");
  if (config.rounds <= 0 || config.paths <= 0 || config.paths > config.rounds)
    throw std::invalid_argument("rounds and paths must be positive, with paths <= rounds");
  if (config.penetration_percent <= 0 || config.penetration_percent >= 100)
    throw std::invalid_argument("penetrationPercent must be between 0 and 100");
  if (config.observer_seats < 0 || config.observer_seats > 7)
    throw std::invalid_argument("observerSeats must be between 0 and 7");
  if (config.rounds_per_hour <= 0 || config.confidence_z <= 0)
    throw std::invalid_argument("roundsPerHour and confidenceZ must be positive");
  if (config.risk_bankroll_units.empty()) throw std::invalid_argument("riskBankrollUnits cannot be empty");
  for (double bankroll : config.risk_bankroll_units)
    if (!std::isfinite(bankroll) || bankroll <= 0) throw std::invalid_argument("risk bankrolls must be positive");
  if (config.retention.mode != "aggregate" && config.retention.mode != "sampled" && config.retention.mode != "full")
    throw std::invalid_argument("retention.mode must be aggregate, sampled, or full");
  if (config.retention.sample_every <= 0) throw std::invalid_argument("sampleEvery must be positive");
  if (config.retention.mode == "full" && config.rounds > 10000000 && !config.retention.acknowledge_large_output)
    throw std::invalid_argument("full raw output above 10 million rounds requires acknowledgeLargeOutput");
  return config;
}

uint64_t hash_seed(const std::string& value) {
  uint64_t hash = 1469598103934665603ull;
  for (unsigned char c : value) { hash ^= c; hash *= 1099511628211ull; }
  return hash;
}

std::string now_compact() {
  const auto now = std::chrono::system_clock::now();
  const auto time = std::chrono::system_clock::to_time_t(now);
  std::tm tm{}; gmtime_r(&time, &tm);
  std::ostringstream out; out << std::put_time(&tm, "%Y%m%dT%H%M%SZ");
  return out.str();
}

std::string slug(std::string value) {
  for (char& c : value) {
    if (!std::isalnum(static_cast<unsigned char>(c))) c = '-';
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  }
  while (value.find("--") != std::string::npos) value.replace(value.find("--"), 2, "-");
  while (!value.empty() && value.back() == '-') value.pop_back();
  return value.empty() ? "evaluation" : value;
}

void write_zstd(const std::filesystem::path& path, const std::string& content) {
  const size_t bound = ZSTD_compressBound(content.size());
  std::vector<char> compressed(bound);
  const size_t size = ZSTD_compress(compressed.data(), compressed.size(), content.data(), content.size(), 3);
  if (ZSTD_isError(size)) throw std::runtime_error("zstd compression failed");
  std::ofstream output(path, std::ios::binary);
  output.write(compressed.data(), static_cast<std::streamsize>(size));
}

std::string read_zstd(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary | std::ios::ate);
  if (!input) throw std::runtime_error("unable to read compressed artifact: " + path.string());
  const auto compressed_size = input.tellg(); input.seekg(0);
  std::vector<char> compressed(static_cast<size_t>(compressed_size));
  input.read(compressed.data(), compressed_size);
  const unsigned long long raw_size = ZSTD_getFrameContentSize(compressed.data(), compressed.size());
  if (raw_size == ZSTD_CONTENTSIZE_ERROR || raw_size == ZSTD_CONTENTSIZE_UNKNOWN)
    throw std::runtime_error("invalid zstd artifact");
  std::string output(static_cast<size_t>(raw_size), '\0');
  const size_t result = ZSTD_decompress(output.data(), output.size(), compressed.data(), compressed.size());
  if (ZSTD_isError(result)) throw std::runtime_error("zstd decompression failed");
  return output;
}

class ZstdLineWriter {
 public:
  explicit ZstdLineWriter(const std::filesystem::path& path)
      : output_(path, std::ios::binary), context_(ZSTD_createCCtx()), buffer_(ZSTD_CStreamOutSize()) {
    if (!output_ || !context_) throw std::runtime_error("unable to create compressed raw artifact");
    const size_t result = ZSTD_CCtx_setParameter(context_, ZSTD_c_compressionLevel, 3);
    if (ZSTD_isError(result)) throw std::runtime_error("unable to configure zstd writer");
  }

  ~ZstdLineWriter() {
    if (context_) {
      try { close(); } catch (...) {}
      ZSTD_freeCCtx(context_);
    }
  }

  void write(const std::string& line) {
    ZSTD_inBuffer input{line.data(), line.size(), 0};
    while (input.pos < input.size) {
      ZSTD_outBuffer output{buffer_.data(), buffer_.size(), 0};
      const size_t result = ZSTD_compressStream2(context_, &output, &input, ZSTD_e_continue);
      if (ZSTD_isError(result)) throw std::runtime_error("zstd raw stream compression failed");
      output_.write(buffer_.data(), static_cast<std::streamsize>(output.pos));
    }
  }

  void close() {
    if (closed_) return;
    ZSTD_inBuffer input{nullptr, 0, 0};
    size_t remaining = 1;
    while (remaining != 0) {
      ZSTD_outBuffer output{buffer_.data(), buffer_.size(), 0};
      remaining = ZSTD_compressStream2(context_, &output, &input, ZSTD_e_end);
      if (ZSTD_isError(remaining)) throw std::runtime_error("zstd raw stream finalization failed");
      output_.write(buffer_.data(), static_cast<std::streamsize>(output.pos));
    }
    output_.close();
    closed_ = true;
  }

 private:
  std::ofstream output_;
  ZSTD_CCtx* context_ = nullptr;
  std::vector<char> buffer_;
  bool closed_ = false;
};

ObserverOutcome play_observer_round(const Rules& rules, int seats, Shoe& shoe, std::mt19937_64& rng) {
  const Shoe before = shoe;
  const int seat_count = std::max(1, seats);
  std::vector<std::vector<Rank>> hands(static_cast<size_t>(seat_count));
  std::vector<Rank> dealer;
  for (int pass = 0; pass < 2; ++pass) {
    for (auto& hand : hands) hand.push_back(draw_card(shoe, rng));
    dealer.push_back(draw_card(shoe, rng));
  }
  for (auto& hand : hands)
    while (hand_value(hand).total < 17) hand.push_back(draw_card(shoe, rng));
  while (dealer_should_hit(dealer, rules)) dealer.push_back(draw_card(shoe, rng));
  ObserverOutcome outcome;
  outcome.cards_consumed = before.total - shoe.total;
  for (int i = 0; i < static_cast<int>(before.counts.size()); ++i)
    outcome.running_count_delta += (before.counts[i] - shoe.counts[i]) * hi_lo_value(static_cast<Rank>(i));
  return outcome;
}

std::string cube_key(int true_count, int depth_percent, double wager) {
  const int depth_bucket = std::clamp((depth_percent / 10) * 10, 0, 90);
  std::ostringstream out;
  out << "tc=" << true_count << "|depth=" << depth_bucket << "|wager=" << std::fixed << std::setprecision(2) << wager;
  return out.str();
}

json stats_json(const Stats& stats) {
  return {{"rounds", stats.rounds}, {"wageredRounds", stats.wagered_rounds},
          {"profit", stats.profit}, {"profitSquared", stats.profit_sq},
          {"initialWagers", stats.initial_wagers}, {"exposure", stats.exposure},
          {"wins", stats.wins}, {"losses", stats.losses}, {"pushes", stats.pushes},
          {"blackjacks", stats.blackjacks}, {"dealerBlackjacks", stats.dealer_blackjacks},
          {"busts", stats.busts}, {"surrenders", stats.surrenders},
          {"doubles", stats.doubles}, {"splits", stats.splits},
          {"insuranceTaken", stats.insurance_taken}, {"evenMoneyTaken", stats.even_money_taken}};
}

Stats stats_from_json(const json& value) {
  Stats stats;
  stats.rounds = value.at("rounds"); stats.wagered_rounds = value.at("wageredRounds");
  stats.profit = value.at("profit"); stats.profit_sq = value.at("profitSquared");
  stats.initial_wagers = value.at("initialWagers"); stats.exposure = value.at("exposure");
  stats.wins = value.at("wins"); stats.losses = value.at("losses"); stats.pushes = value.at("pushes");
  stats.blackjacks = value.at("blackjacks"); stats.dealer_blackjacks = value.at("dealerBlackjacks");
  stats.busts = value.at("busts"); stats.surrenders = value.at("surrenders");
  stats.doubles = value.at("doubles"); stats.splits = value.at("splits");
  stats.insurance_taken = value.at("insuranceTaken"); stats.even_money_taken = value.at("evenMoneyTaken");
  return stats;
}

json path_result_json(const PathResult& path) {
  json cubes = json::array();
  for (const auto& [key, stats] : path.cubes) cubes.push_back({{"key", key}, {"stats", stats_json(stats)}});
  return {{"stats", stats_json(path.stats)}, {"maxDrawdown", path.max_drawdown},
          {"ruined", path.ruined}, {"cubes", cubes}};
}

PathResult path_result_from_json(const json& value) {
  PathResult path;
  path.stats = stats_from_json(value.at("stats"));
  path.max_drawdown = value.at("maxDrawdown");
  path.ruined = value.at("ruined").get<std::vector<bool>>();
  for (const auto& cube : value.at("cubes"))
    path.cubes[cube.at("key").get<std::string>()] = stats_from_json(cube.at("stats"));
  return path;
}

json summary_json(const json& aggregate) {
  const Stats totals = stats_from_json(aggregate.at("totals"));
  if (totals.initial_wagers <= 0) throw std::runtime_error("evaluation produced no wagers");
  const double player_ev = totals.profit / totals.initial_wagers;
  const double round_mean = totals.wagered_rounds ? totals.profit / totals.wagered_rounds : 0.0;
  const double round_variance = totals.wagered_rounds > 1
    ? std::max(0.0, totals.profit_sq / totals.wagered_rounds - round_mean * round_mean) : 0.0;
  std::vector<double> path_evs = aggregate.at("pathEvs").get<std::vector<double>>();
  const double path_mean = path_evs.empty() ? player_ev
    : std::accumulate(path_evs.begin(), path_evs.end(), 0.0) / path_evs.size();
  double path_variance = 0.0;
  for (double value : path_evs) path_variance += (value - path_mean) * (value - path_mean);
  if (path_evs.size() > 1) path_variance /= static_cast<double>(path_evs.size() - 1);
  const double standard_error = path_evs.size() > 1 ? std::sqrt(path_variance / path_evs.size()) : 0.0;
  const double z = aggregate.at("confidenceZ");
  const double rate_denominator = std::max<long long>(1, totals.wagered_rounds);
  json risk = json::array();
  for (const auto& item : aggregate.at("risk")) risk.push_back(item);
  return {{"strategyId", aggregate.at("strategyId")}, {"mode", aggregate.at("mode")},
          {"tableRounds", totals.rounds}, {"wageredRounds", totals.wagered_rounds},
          {"initialWagers", totals.initial_wagers}, {"totalExposure", totals.exposure},
          {"netProfitUnits", totals.profit}, {"playerEv", player_ev}, {"houseEdge", -player_ev},
          {"profitPerTableRound", totals.profit / std::max<long long>(1, totals.rounds)},
          {"profitPerUnitExposed", totals.profit / std::max(1.0, totals.exposure)},
          {"variancePerWageredRound", round_variance}, {"standardDeviationPerWageredRound", std::sqrt(round_variance)},
          {"standardError", standard_error},
          {"confidenceLow", player_ev - z * standard_error},
          {"confidenceHigh", player_ev + z * standard_error},
          {"unitsPerHour", totals.profit / std::max<long long>(1, totals.rounds) * aggregate.at("roundsPerHour").get<double>()},
          {"outcomeRates", {{"win", totals.wins / rate_denominator}, {"loss", totals.losses / rate_denominator},
                            {"push", totals.pushes / rate_denominator}, {"blackjack", totals.blackjacks / rate_denominator},
                            {"dealerBlackjack", totals.dealer_blackjacks / rate_denominator},
                            {"bust", totals.busts / rate_denominator}, {"surrender", totals.surrenders / rate_denominator},
                            {"double", totals.doubles / rate_denominator}, {"split", totals.splits / rate_denominator},
                            {"insurance", totals.insurance_taken / rate_denominator},
                            {"evenMoney", totals.even_money_taken / rate_denominator}}},
          {"riskOfRuin", risk}, {"maxDrawdownUnits", aggregate.at("maxDrawdownUnits")},
          {"artifactVersion", aggregate.at("artifactVersion")}};
}

json read_json_file(const std::string& path) {
  std::ifstream input(path); if (!input) throw std::runtime_error("unable to read JSON: " + path);
  json value; input >> value; return value;
}

}  // namespace

int validate_evaluation_strategy(const std::string& strategy_path) {
  try {
    const auto package = parse_strategy_package(strategy_path);
    std::cout << package.id << ": valid\n";
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}

int run_evaluation(const EvaluationOptions& options) {
  try {
    const auto started = std::chrono::steady_clock::now();
    const EvaluationConfig config = parse_evaluation_config(options.config_path);
    const StrategyPackage strategy = parse_strategy_package(config.strategy_path);
    const ChartPolicy policy(strategy);
    if (config.mode == "fresh-round" && policy.wager_units(0, strategy.rules.decks * 52) <= 0)
      throw std::invalid_argument("fresh-round strategy must wager above zero at off-the-top count");
    if (config.mode == "continuous-shoe" && config.observer_seats == 0) {
      bool has_zero = false; for (const auto& step : strategy.betting_ramp) has_zero = has_zero || step.units == 0;
      if (has_zero) throw std::invalid_argument("continuous zero-bet ramps require observerSeats above zero");
    }

    const json strategy_json = read_json_file(config.strategy_path);
    const json config_json = read_json_file(options.config_path);
    const std::string run_id = options.resume_dir.empty()
      ? slug(config.name) + "-" + now_compact()
      : std::filesystem::path(options.resume_dir).filename().string();
    const std::filesystem::path run_dir = options.resume_dir.empty()
      ? std::filesystem::path(options.output_dir) / run_id
      : std::filesystem::path(options.resume_dir);
    if (options.resume_dir.empty()) {
      std::filesystem::create_directories(run_dir);
      json initial_manifest = {{"id", run_id}, {"createdAt", now_compact()}, {"status", "running"},
        {"evaluatorVersion", kEvaluatorVersion}, {"seed", config.seed},
        {"workerThreads", omp_get_max_threads()}, {"config", config_json}, {"strategy", strategy_json}};
      std::ofstream(run_dir / "manifest.json") << std::setw(2) << initial_manifest << '\n';
    } else {
      const json existing = read_json_file((run_dir / "manifest.json").string());
      if (existing.at("config") != config_json || existing.at("strategy") != strategy_json)
        throw std::invalid_argument("resume config or strategy does not match the original run");
    }
    std::filesystem::create_directories(run_dir / "checkpoints");
    if (config.retention.mode != "aggregate") std::filesystem::create_directories(run_dir / "raw");
    std::vector<PathResult> paths(static_cast<size_t>(config.paths));
    std::vector<std::string> path_errors(static_cast<size_t>(config.paths));

    #pragma omp parallel for schedule(static)
    for (int path_index = 0; path_index < config.paths; ++path_index) {
      try {
      const auto checkpoint_path = run_dir / "checkpoints" / ("path-" + std::to_string(path_index) + ".json.zst");
      if (std::filesystem::exists(checkpoint_path)) {
        try { paths[static_cast<size_t>(path_index)] = path_result_from_json(json::parse(read_zstd(checkpoint_path))); }
        catch (const std::exception& error) { path_errors[static_cast<size_t>(path_index)] = error.what(); }
        continue;
      }
      const long long target_rounds = config.rounds / config.paths + (path_index < config.rounds % config.paths ? 1 : 0);
      std::mt19937_64 rng(hash_seed(config.seed + ":path:" + std::to_string(path_index)));
      PathResult result; result.ruined.assign(config.risk_bankroll_units.size(), false);
      double cumulative = 0.0, peak = 0.0;
      int running_count = 0, shoe_number = 0;
      Shoe shoe = full_shoe(strategy.rules.decks);
      std::unique_ptr<ZstdLineWriter> raw;
      if (config.retention.mode != "aggregate")
        raw = std::make_unique<ZstdLineWriter>(run_dir / "raw" / ("path-" + std::to_string(path_index) + ".jsonl.zst"));
      for (long long round = 0; round < target_rounds; ++round) {
        if (config.mode == "fresh-round") { shoe = full_shoe(strategy.rules.decks); running_count = 0; ++shoe_number; }
        else {
          const int dealt = strategy.rules.decks * 52 - shoe.total;
          const int cut = static_cast<int>(std::floor(strategy.rules.decks * 52 * config.penetration_percent / 100.0));
          if (dealt >= cut || shoe.total < 30) { shoe = full_shoe(strategy.rules.decks); running_count = 0; ++shoe_number; }
        }
        const int cards_before = shoe.total;
        const int tc = strategy_true_count(running_count / (cards_before / 52.0), strategy.true_count_rounding);
        const int depth = static_cast<int>(std::floor(100.0 * (strategy.rules.decks * 52 - cards_before) /
                                                     (strategy.rules.decks * 52)));
        const double wager = policy.wager_units(running_count, cards_before);
        if (wager == 0.0) {
          const auto observed = play_observer_round(strategy.rules, config.observer_seats, shoe, rng);
          running_count += observed.running_count_delta;
          result.stats.add_observed_round(); result.cubes[cube_key(tc, depth, 0.0)].add_observed_round();
          if (config.retention.mode == "full" || (config.retention.mode == "sampled" && round % config.retention.sample_every == 0))
            raw->write(json({{"path", path_index}, {"round", round}, {"shoe", shoe_number}, {"trueCount", tc},
                         {"depthPercent", depth}, {"wager", 0.0}, {"profit", 0.0}, {"observed", true}}).dump() + "\n");
          continue;
        }
        const auto outcome = play_complete_round(strategy.rules, policy, shoe, rng, running_count, wager);
        running_count += outcome.running_count_delta;
        result.stats.add(outcome); result.cubes[cube_key(tc, depth, wager)].add(outcome);
        cumulative += outcome.profit; peak = std::max(peak, cumulative);
        result.max_drawdown = std::max(result.max_drawdown, peak - cumulative);
        for (size_t i = 0; i < config.risk_bankroll_units.size(); ++i)
          if (cumulative <= -config.risk_bankroll_units[i]) result.ruined[i] = true;
        if (config.retention.mode == "full" || (config.retention.mode == "sampled" && round % config.retention.sample_every == 0))
          raw->write(json({{"path", path_index}, {"round", round}, {"shoe", shoe_number}, {"trueCount", tc},
                       {"depthPercent", depth}, {"wager", wager}, {"profit", outcome.profit},
                       {"exposure", outcome.total_exposure}, {"hands", outcome.hands},
                       {"playerBlackjack", outcome.player_blackjack}, {"dealerBlackjack", outcome.dealer_blackjack},
                       {"insuranceTaken", outcome.insurance_taken}, {"evenMoneyTaken", outcome.even_money_taken}}).dump() + "\n");
      }
      if (raw) raw->close();
      write_zstd(checkpoint_path, path_result_json(result).dump());
      paths[static_cast<size_t>(path_index)] = std::move(result);
      } catch (const std::exception& error) {
        path_errors[static_cast<size_t>(path_index)] = error.what();
      } catch (...) {
        path_errors[static_cast<size_t>(path_index)] = "unknown evaluator worker error";
      }
    }

    for (size_t i = 0; i < path_errors.size(); ++i)
      if (!path_errors[i].empty()) throw std::runtime_error("path " + std::to_string(i) + ": " + path_errors[i]);

    Stats totals; std::map<std::string, Stats> cubes; std::vector<double> path_evs;
    double max_drawdown = 0.0; std::vector<long long> ruin_counts(config.risk_bankroll_units.size(), 0);
    json path_rows = json::array();
    for (size_t i = 0; i < paths.size(); ++i) {
      const auto& path = paths[i]; totals.merge(path.stats); max_drawdown = std::max(max_drawdown, path.max_drawdown);
      if (path.stats.initial_wagers > 0) path_evs.push_back(path.stats.profit / path.stats.initial_wagers);
      for (const auto& [key, stats] : path.cubes) cubes[key].merge(stats);
      for (size_t j = 0; j < path.ruined.size(); ++j) ruin_counts[j] += path.ruined[j] ? 1 : 0;
      path_rows.push_back({{"path", i}, {"stats", stats_json(path.stats)}, {"maxDrawdown", path.max_drawdown}});
    }
    if (totals.initial_wagers <= 0) throw std::runtime_error("strategy placed no wagers during the run");
    json cube_rows = json::array();
    for (const auto& [key, stats] : cubes) cube_rows.push_back({{"key", key}, {"stats", stats_json(stats)}});
    json risk = json::array();
    for (size_t i = 0; i < config.risk_bankroll_units.size(); ++i)
      risk.push_back({{"bankrollUnits", config.risk_bankroll_units[i]},
                      {"ruinProbability", static_cast<double>(ruin_counts[i]) / config.paths},
                      {"horizonRoundsPerPath", config.rounds / config.paths}});
    json aggregate = {{"artifactVersion", 1}, {"evaluatorVersion", kEvaluatorVersion},
      {"strategyId", strategy.id}, {"mode", config.mode}, {"confidenceZ", config.confidence_z},
      {"roundsPerHour", config.rounds_per_hour}, {"totals", stats_json(totals)},
      {"pathEvs", path_evs}, {"paths", path_rows}, {"cubes", cube_rows}, {"risk", risk},
      {"maxDrawdownUnits", max_drawdown}};
    const json summary = summary_json(aggregate);
    const auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - started).count();
    json manifest = read_json_file((run_dir / "manifest.json").string());
    manifest["completedAt"] = now_compact();
    manifest["status"] = "completed";
    manifest["elapsedMs"] = elapsed_ms;
    manifest["workerThreads"] = omp_get_max_threads();
    manifest["artifacts"] = {{"aggregate", "aggregate-data.json.zst"}, {"summary", "summary.json"},
                             {"rawMode", config.retention.mode}, {"checkpoints", "checkpoints/."}};
    std::ofstream(run_dir / "manifest.json") << std::setw(2) << manifest << '\n';
    std::ofstream(run_dir / "summary.json") << std::setw(2) << summary << '\n';
    write_zstd(run_dir / "aggregate-data.json.zst", aggregate.dump());
    std::cout << run_dir.string() << '\n';
    std::cerr << "playerEV=" << summary.at("playerEv") << " houseEdge=" << summary.at("houseEdge")
              << " elapsed=" << elapsed_ms / 1000.0 << "s\n";
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}

int summarize_evaluation(const std::string& run_dir) {
  try {
    const json aggregate = json::parse(read_zstd(std::filesystem::path(run_dir) / "aggregate-data.json.zst"));
    const json summary = summary_json(aggregate);
    std::cout << std::setw(2) << summary << '\n';
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}

}  // namespace blackjack_sim
