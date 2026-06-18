#include "strategy_package.hpp"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>

using namespace blackjack_sim;

namespace {
void check(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }

StrategyPackage package_fixture() {
  StrategyPackage package;
  package.id = "fixture";
  package.name = "Fixture strategy";
  package.rules.surrender = "late";
  package.true_count_rounding = "truncate";
  const std::vector<std::string> dealers{"2", "3", "4", "5", "6", "7", "8", "9", "10", "A"};
  for (int total = 4; total <= 21; ++total)
    for (const auto& dealer : dealers) package.chart["hard"]["h" + std::to_string(total)][dealer] = Action::Stand;
  for (int total = 13; total <= 21; ++total)
    for (const auto& dealer : dealers) package.chart["soft"]["s" + std::to_string(total)][dealer] = Action::Stand;
  for (const auto& rank : {"A", "10", "9", "8", "7", "6", "5", "4", "3", "2"})
    for (const auto& dealer : dealers) package.chart["pair"]["p" + std::string(rank)][dealer] = Action::Stand;
  package.betting_ramp = {{-100, 0.0}, {1, 1.0}, {3, 4.0}};
  return package;
}

void test_chart_policy_deviation_and_ramp() {
  auto package = package_fixture();
  package.deviations.push_back({"hard", "h16", "10", ThresholdComparison::AtOrAbove,
                                1, Action::Hit, Action::Stand, false});
  ChartPolicy policy(package);
  HandState hand{{Rank::Ten, Rank::Six}};
  std::vector<Action> legal{Action::Stand, Action::Hit};
  DecisionContext low{hand, Rank::Ten, package.rules, legal, 1, true, 0, 5.0, 0.0};
  DecisionContext high{hand, Rank::Ten, package.rules, legal, 1, true, 5, 5.0, 1.0};
  check(policy.choose_action(low) == Action::Stand, "base chart action");
  check(policy.choose_action(high) == Action::Hit, "count deviation action");
  check(policy.wager_units(0, 260) == 0.0, "zero bet ramp");
  check(policy.wager_units(15, 260) == 4.0, "positive bet ramp");
}

void test_side_decisions() {
  auto package = package_fixture();
  package.insurance.deviations.push_back({ThresholdComparison::AtOrAbove, 3, InsuranceDecision::Take});
  package.even_money.base = InsuranceDecision::Take;
  ChartPolicy policy(package);
  check(policy.choose_insurance({false, 0, 1.0, 2.0}) == InsuranceDecision::Decline,
        "insurance below index");
  check(policy.choose_insurance({false, 0, 1.0, 3.0}) == InsuranceDecision::Take,
        "insurance at index");
  check(policy.choose_insurance({true, 0, 1.0, -5.0}) == InsuranceDecision::Take,
        "even money policy");
}

void test_validation_rejects_mechanically_illegal_action() {
  auto package = package_fixture();
  package.chart["hard"]["h4"]["2"] = Action::Double;
  package.fallbacks["hard"]["h4"]["2"] = Action::Hit;
  bool rejected = false;
  try { validate_strategy_package(package); } catch (const std::invalid_argument&) { rejected = true; }
  check(rejected, "mechanically illegal chart action rejected");
}

void test_validation_rejects_unordered_deviations() {
  auto package = package_fixture();
  package.deviations.push_back({"hard", "h16", "10", ThresholdComparison::AtOrAbove, 3, Action::Hit});
  package.deviations.push_back({"hard", "h16", "10", ThresholdComparison::AtOrAbove, 1, Action::Stand});
  bool rejected = false;
  try { validate_strategy_package(package); } catch (const std::invalid_argument&) { rejected = true; }
  check(rejected, "unordered deviations rejected");
}

void test_validation_rejects_missing_cell() {
  auto package = package_fixture();
  package.chart["hard"]["h16"].erase("A");
  bool rejected = false;
  try { validate_strategy_package(package); } catch (const std::invalid_argument&) { rejected = true; }
  check(rejected, "missing chart cell rejected");
}

void test_parser_rejects_unknown_field() {
  const auto path = std::filesystem::temp_directory_path() / "strategy-package-unknown.json";
  std::ofstream(path) << R"({"schemaVersion":1,"unexpected":true})";
  bool rejected = false;
  try { (void)parse_strategy_package(path.string()); } catch (const std::invalid_argument&) { rejected = true; }
  std::filesystem::remove(path);
  check(rejected, "unknown package field rejected");
}
}  // namespace

int main() {
  try {
    test_chart_policy_deviation_and_ramp();
    test_side_decisions();
    test_validation_rejects_unordered_deviations();
    test_validation_rejects_mechanically_illegal_action();
    test_validation_rejects_missing_cell();
    test_parser_rejects_unknown_field();
    std::cout << "strategy package tests passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
