#pragma once

#include "blackjack.hpp"

#include <map>
#include <string>
#include <vector>

namespace blackjack_sim {

enum class ThresholdComparison { AtOrAbove, AtOrBelow };

struct CountDeviation {
  std::string category;
  std::string row_key;
  std::string dealer;
  ThresholdComparison comparison = ThresholdComparison::AtOrAbove;
  int true_count = 0;
  Action action = Action::Stand;
  Action fallback = Action::Stand;
  bool has_fallback = false;
};

struct DecisionDeviation {
  ThresholdComparison comparison = ThresholdComparison::AtOrAbove;
  int true_count = 0;
  InsuranceDecision decision = InsuranceDecision::Decline;
};

struct SideDecisionPolicy {
  InsuranceDecision base = InsuranceDecision::Decline;
  std::vector<DecisionDeviation> deviations;
};

struct BetStep {
  int at_or_above = 0;
  double units = 1.0;
};

using DealerActions = std::map<std::string, Action>;
using RowActions = std::map<std::string, DealerActions>;
using StrategyChartMap = std::map<std::string, RowActions>;

struct StrategyPackage {
  int schema_version = 1;
  std::string id;
  std::string name;
  Rules rules;
  std::string true_count_rounding = "truncate";
  StrategyChartMap chart;
  StrategyChartMap fallbacks;
  std::vector<CountDeviation> deviations;
  SideDecisionPolicy insurance;
  SideDecisionPolicy even_money;
  std::vector<BetStep> betting_ramp;
};

StrategyPackage parse_strategy_package(const std::string& path);
void validate_strategy_package(const StrategyPackage& package);
int strategy_true_count(double exact, const std::string& rounding);

class ChartPolicy final : public CompletePolicy {
 public:
  explicit ChartPolicy(StrategyPackage package);
  Action choose_action(const DecisionContext& context) const override;
  InsuranceDecision choose_insurance(const InsuranceContext& context) const override;
  double wager_units(int running_count, int cards_remaining) const;
  const StrategyPackage& package() const { return package_; }

 private:
  StrategyPackage package_;
};

}  // namespace blackjack_sim
