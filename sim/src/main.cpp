#include "simulator.hpp"

#include <iostream>
#include <string>
#include <vector>

extern "C" int blackjack_sim_cuda_device_count();

namespace {

std::string value_after(const std::vector<std::string>& args, const std::string& flag, const std::string& fallback = "") {
  for (size_t i = 0; i + 1 < args.size(); ++i) {
    if (args[i] == flag) return args[i + 1];
  }
  return fallback;
}

void print_usage() {
  std::cout << "simulate-strategy run --config <file> [--output sim/runs]\n"
            << "simulate-strategy export-chart --run <run-dir>\n"
            << "simulate-strategy devices\n";
}

}  // namespace

int main(int argc, char** argv) {
  std::vector<std::string> args(argv + 1, argv + argc);
  if (args.empty()) {
    print_usage();
    return 1;
  }

  if (args[0] == "devices") {
    std::cout << "cudaDevices=" << blackjack_sim_cuda_device_count() << "\n";
    return 0;
  }

  if (args[0] == "run") {
    blackjack_sim::RunOptions options;
    options.config_path = value_after(args, "--config");
    options.output_dir = value_after(args, "--output", options.output_dir);
    if (options.config_path.empty()) {
      std::cerr << "--config is required\n";
      return 1;
    }
    return blackjack_sim::run_simulation(options);
  }

  if (args[0] == "export-chart") {
    const auto run_dir = value_after(args, "--run");
    if (run_dir.empty()) {
      std::cerr << "--run is required\n";
      return 1;
    }
    return blackjack_sim::export_chart(run_dir);
  }

  print_usage();
  return 1;
}
