#pragma once

#include <string>

namespace blackjack_sim {

struct EvaluationOptions {
  std::string config_path;
  std::string output_dir = "sim/evaluation-runs";
  std::string resume_dir;
};

int validate_evaluation_strategy(const std::string& strategy_path);
int run_evaluation(const EvaluationOptions& options);
int summarize_evaluation(const std::string& run_dir);

}  // namespace blackjack_sim
