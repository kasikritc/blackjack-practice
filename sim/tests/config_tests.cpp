#include "config.hpp"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <nlohmann/json.hpp>
#include <stdexcept>

using namespace blackjack_sim;
using json = nlohmann::json;

namespace {
void check(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }

void expect_rejected(json value, const std::string& label) {
  const auto path = std::filesystem::temp_directory_path() / ("blackjack-config-" + label + ".json");
  std::ofstream(path) << value;
  bool rejected = false;
  try { (void)parse_config(path.string()); } catch (const std::exception&) { rejected = true; }
  std::filesystem::remove(path);
  check(rejected, (label + " should be rejected").c_str());
}
}  // namespace

int main() {
  try {
    const auto config = parse_config(std::string(SIM_SOURCE_DIR) + "/configs/smoke.json");
    check(config.rules.decks == 6, "smoke deck count");
    check(config.true_count_rounding == "nearest", "rounding default");
    std::ifstream input(std::string(SIM_SOURCE_DIR) + "/configs/smoke.json");
    json value; input >> value;
    auto no_peek = value;
    no_peek["rules"]["dealerPeek"] = false;
    expect_rejected(no_peek, "no-peek");
    auto contradictory_aces = value;
    contradictory_aces["rules"]["hitSplitAces"] = true;
    expect_rejected(contradictory_aces, "split-aces");
    auto custom = value;
    custom["rules"]["customRules"]["mystery"] = true;
    expect_rejected(custom, "custom-rules");
    auto unknown = value;
    unknown["unexpected"] = 1;
    expect_rejected(unknown, "unknown-field");
    std::cout << "config tests passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
