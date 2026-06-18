#include "evaluator.hpp"

#include <iostream>
#include <string>
#include <vector>

namespace {
std::string value_after(const std::vector<std::string>& args, const std::string& flag,
                        const std::string& fallback = "") {
  for (size_t i = 0; i + 1 < args.size(); ++i) if (args[i] == flag) return args[i + 1];
  return fallback;
}

void usage() {
  std::cout << "evaluate-strategy validate --strategy <package.json>\n"
            << "evaluate-strategy run --config <run.json> [--output sim/evaluation-runs] [--resume <run-dir>]\n"
            << "evaluate-strategy summarize --run <run-dir>\n";
}
}  // namespace

int main(int argc, char** argv) {
  const std::vector<std::string> args(argv + 1, argv + argc);
  if (args.empty()) { usage(); return 1; }
  if (args[0] == "validate") {
    const auto path = value_after(args, "--strategy");
    if (path.empty()) { std::cerr << "--strategy is required\n"; return 1; }
    return blackjack_sim::validate_evaluation_strategy(path);
  }
  if (args[0] == "run") {
    blackjack_sim::EvaluationOptions options;
    options.config_path = value_after(args, "--config");
    options.output_dir = value_after(args, "--output", options.output_dir);
    options.resume_dir = value_after(args, "--resume");
    if (options.config_path.empty()) { std::cerr << "--config is required\n"; return 1; }
    return blackjack_sim::run_evaluation(options);
  }
  if (args[0] == "summarize") {
    const auto run = value_after(args, "--run");
    if (run.empty()) { std::cerr << "--run is required\n"; return 1; }
    return blackjack_sim::summarize_evaluation(run);
  }
  usage();
  return 1;
}
