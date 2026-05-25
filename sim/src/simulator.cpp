#include "simulator.hpp"

#include <filesystem>
#include <fstream>
#include <iostream>

namespace blackjack_sim {

int run_simulation(const RunOptions& options) {
  std::filesystem::create_directories(options.output_dir);
  std::cerr << "simulator engine is not implemented yet; scaffold is ready at " << options.output_dir << "\n";
  return 2;
}

int export_chart(const std::string& run_dir) {
  std::cerr << "chart export expects an existing run directory: " << run_dir << "\n";
  return 2;
}

}  // namespace blackjack_sim
