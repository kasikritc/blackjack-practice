#pragma once

#include <string>

namespace blackjack_sim {

struct RunOptions {
  std::string config_path;
  std::string output_dir = "sim/runs";
};

int run_simulation(const RunOptions& options);
int export_chart(const std::string& run_dir);

}  // namespace blackjack_sim
