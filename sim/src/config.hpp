#pragma once

#include "blackjack.hpp"

#include <string>
#include <vector>

namespace blackjack_sim {

struct Config {
  std::string name;
  std::string seed;
  Rules rules;
  int min_samples_per_action = 0;
  int max_samples_per_action = 0;
  int batch_size = 0;
  int shoe_samples_per_bucket = 0;
  int max_policy_iterations = 0;
  double minimum_ev_margin = 0.0;
  double confidence_z = 1.96;
  std::vector<int> true_count_buckets;
  std::vector<double> decks_remaining_buckets;
  std::string true_count_rounding = "nearest";
};

Config parse_config(const std::string& path);

}  // namespace blackjack_sim
