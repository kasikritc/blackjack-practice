#include "blackjack.hpp"

#include <algorithm>
#include <iostream>
#include <stdexcept>

using namespace blackjack_sim;

namespace {
void check(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }

void test_hand_values() {
  check(hand_value({Rank::Ace, Rank::Six}).total == 17, "soft 17 total");
  check(hand_value({Rank::Ace, Rank::Six}).soft, "soft 17 softness");
  check(hand_value({Rank::Ace, Rank::Six, Rank::Ten}).total == 17, "ace downgrade");
  check(!hand_value({Rank::Ace, Rank::Six, Rank::Ten}).soft, "hard 17 softness");
  check(hand_value({Rank::Ace, Rank::Ace, Rank::Nine}).total == 21, "multiple aces");
}

void test_pairs_and_shoe() {
  Rules rules;
  HandState mixed_tens{{Rank::Ten, Rank::King}};
  check(!is_pair(mixed_tens, rules), "mixed tens rank pair");
  rules.split_tens_by_value = true;
  check(is_pair(mixed_tens, rules), "mixed tens value pair");
  Shoe shoe = full_shoe(1);
  check(shoe.total == 52, "shoe size");
  check(remove_card(shoe, Rank::King), "remove king");
  check(shoe.total == 51 && shoe.counts[12] == 3, "rank removal");
}

void test_action_legality() {
  Rules rules;
  HandState hand{{Rank::Five, Rank::Six}};
  auto actions = legal_actions(hand, rules, 1, true);
  check(std::find(actions.begin(), actions.end(), Action::Double) != actions.end(), "double legal");
  check(std::find(actions.begin(), actions.end(), Action::Surrender) != actions.end(), "surrender legal");
  hand.from_split = true;
  rules.double_after_split = false;
  actions = legal_actions(hand, rules, 2, false);
  check(std::find(actions.begin(), actions.end(), Action::Double) == actions.end(), "DAS disabled");
}

void test_split_ace_lock() {
  Rules rules;
  HandState hand{{Rank::Ace, Rank::Six}, 1.0, true, true};
  const auto actions = legal_actions(hand, rules, 2, false);
  check(actions.size() == 1 && actions.front() == Action::Stand, "split ace lock");
}


struct StandPolicy final : Policy {
  Action choose(const HandState&, Rank, const Rules&, int) const override { return Action::Stand; }
};

Shoe exact_shoe(std::initializer_list<Rank> cards) {
  Shoe shoe;
  shoe.counts.fill(0);
  for (Rank rank : cards) { ++shoe.counts[static_cast<int>(rank)]; ++shoe.total; }
  return shoe;
}

void test_peek_and_surrender_timing() {
  StandPolicy policy;
  Rules early;
  early.surrender = "early";
  auto natural_shoe = exact_shoe({Rank::Nine, Rank::Seven, Rank::Ace, Rank::King});
  std::mt19937_64 rng1(1);
  auto lost = simulate_round(early, {Rank::Nine, Rank::Seven}, Rank::Ace, Action::Stand,
                             policy, natural_shoe, rng1);
  check(lost.dealer_blackjack && lost.profit == -1.0, "early surrender declined dealer natural");
  std::mt19937_64 rng2(1);
  auto surrendered = simulate_round(early, {Rank::Nine, Rank::Seven}, Rank::Ace,
                                    Action::Surrender, policy, natural_shoe, rng2);
  check(surrendered.profit == -0.5, "early surrender precedes peek");

  Rules late;
  late.surrender = "late";
  auto peek_shoe = exact_shoe({Rank::Nine, Rank::Seven, Rank::Ace, Rank::King, Rank::Two,
                               Rank::Four, Rank::Ten, Rank::Ten});
  std::mt19937_64 rng3(2);
  auto post_peek = simulate_round(late, {Rank::Nine, Rank::Seven}, Rank::Ace, Action::Stand,
                                  policy, peek_shoe, rng3);
  check(!post_peek.dealer_blackjack, "late surrender actions condition on successful peek");
}


void test_dealer_soft_17_rule() {
  Rules h17;
  Rules s17;
  s17.dealer_hits_soft_17 = false;
  check(dealer_should_hit({Rank::Ace, Rank::Six}, h17), "H17 dealer hit");
  check(!dealer_should_hit({Rank::Ace, Rank::Six}, s17), "S17 dealer stand");
}

void test_double_restrictions() {
  Rules rules;
  HandState hard_nine{{Rank::Four, Rank::Five}};
  HandState soft_nine{{Rank::Ace, Rank::Eight}};
  rules.double_rule = "hardOnly";
  const auto hard_actions = legal_actions(hard_nine, rules, 1, true);
  check(std::find(hard_actions.begin(), hard_actions.end(), Action::Double) != hard_actions.end(),
        "hard-only hard hand");
  const auto soft_actions = legal_actions(soft_nine, rules, 1, true);
  check(std::find(soft_actions.begin(), soft_actions.end(), Action::Double) == soft_actions.end(),
        "hard-only soft hand");
  rules.double_rule = "tenToEleven";
  const auto nine_actions = legal_actions(hard_nine, rules, 1, true);
  check(std::find(nine_actions.begin(), nine_actions.end(), Action::Double) == nine_actions.end(),
        "ten-to-eleven excludes nine");
}

void test_split_variations() {
  Rules rules;
  HandState split_aces{{Rank::Ace, Rank::Ace}, 1.0, true, true};
  auto actions = legal_actions(split_aces, rules, 2, false);
  check(std::find(actions.begin(), actions.end(), Action::Split) == actions.end(),
        "resplit aces disabled");
  rules.resplit_aces = true;
  actions = legal_actions(split_aces, rules, 2, false);
  check(std::find(actions.begin(), actions.end(), Action::Split) != actions.end(),
        "resplit aces enabled");
  actions = legal_actions(split_aces, rules, rules.max_split_hands, false);
  check(std::find(actions.begin(), actions.end(), Action::Split) == actions.end(),
        "global split hand limit");
  HandState split_hand{{Rank::Nine, Rank::Seven}, 1.0, true};
  actions = legal_actions(split_hand, rules, 2, false);
  check(std::find(actions.begin(), actions.end(), Action::Surrender) == actions.end(),
        "no surrender after split");
}

struct CompleteStandPolicy final : CompletePolicy {
  Action choose_action(const DecisionContext&) const override { return Action::Stand; }
};

struct CountTrackingPolicy final : CompletePolicy {
  mutable std::vector<int> counts;
  mutable std::vector<double> decks_remaining;

  Action choose_action(const DecisionContext& context) const override {
    counts.push_back(context.running_count);
    decks_remaining.push_back(context.decks_remaining);
    return counts.size() == 1 ? Action::Hit : Action::Stand;
  }
};

void test_complete_round_updates_visible_count() {
  CountTrackingPolicy policy;
  Rules rules;
  rules.surrender = "none";
  Shoe shoe = exact_shoe({Rank::Two, Rank::Two, Rank::Two, Rank::Two, Rank::Two,
                          Rank::Two, Rank::Two, Rank::Two, Rank::Two, Rank::Two,
                          Rank::Two, Rank::Two, Rank::Two, Rank::Two, Rank::Two});
  std::mt19937_64 rng(17);
  (void)play_complete_round(rules, policy, shoe, rng, 0);
  check(policy.counts.size() == 2, "two player decisions observed");
  check(policy.counts[0] == 3 && policy.counts[1] == 4,
        "newly visible hit card updates decision count");
  check(policy.decks_remaining[0] == 12.0 / 52.0 &&
        policy.decks_remaining[1] == 11.0 / 52.0,
        "hidden dealer hole remains in unseen decks");
}

struct CompleteSplitPolicy final : CompletePolicy {
  Action choose_action(const DecisionContext& context) const override {
    return std::find(context.legal_actions.begin(), context.legal_actions.end(), Action::Split) !=
      context.legal_actions.end() ? Action::Split : Action::Stand;
  }
};

void test_complete_round_preserves_split_wager() {
  CompleteSplitPolicy policy;
  Rules rules;
  rules.surrender = "none";
  rules.max_split_hands = 2;
  Shoe shoe = exact_shoe({Rank::Eight, Rank::Eight, Rank::Eight, Rank::Eight, Rank::Eight,
                          Rank::Eight, Rank::Eight, Rank::Eight, Rank::Eight, Rank::Eight,
                          Rank::Eight, Rank::Eight, Rank::Eight, Rank::Eight, Rank::Eight});
  std::mt19937_64 rng(11);
  const auto outcome = play_complete_round(rules, policy, shoe, rng, 0, 2.0);
  check(outcome.hands == 2 && outcome.total_exposure == 4.0, "split wager exposure");
  check(outcome.profit == 4.0, "split wager settlement");
}

struct IllegalSurrenderPolicy final : CompletePolicy {
  Action choose_action(const DecisionContext&) const override { return Action::Surrender; }
};

void test_complete_round_push_and_count() {
  CompleteStandPolicy policy;
  Rules rules;
  rules.surrender = "none";
  Shoe shoe = exact_shoe({Rank::Ten, Rank::Ten, Rank::Ten, Rank::Ten, Rank::Ten,
                          Rank::Ten, Rank::Ten, Rank::Ten, Rank::Ten, Rank::Ten,
                          Rank::Ten, Rank::Ten, Rank::Ten, Rank::Ten, Rank::Ten});
  std::mt19937_64 rng(9);
  const auto outcome = play_complete_round(rules, policy, shoe, rng, 0, 2.0);
  check(outcome.profit == 0.0 && outcome.pushes == 1, "complete round push");
  check(outcome.initial_wager == 2.0 && outcome.total_exposure == 2.0,
        "complete round exposure");
  check(outcome.cards_consumed == 4 && outcome.running_count_delta == -4,
        "complete round count delta");
}

void test_complete_round_rejects_illegal_policy() {
  IllegalSurrenderPolicy policy;
  Rules rules;
  rules.surrender = "none";
  Shoe shoe = exact_shoe({Rank::Nine, Rank::Nine, Rank::Nine, Rank::Nine, Rank::Nine,
                          Rank::Nine, Rank::Nine, Rank::Nine, Rank::Nine, Rank::Nine,
                          Rank::Nine, Rank::Nine, Rank::Nine, Rank::Nine, Rank::Nine});
  std::mt19937_64 rng(3);
  bool rejected = false;
  try { (void)play_complete_round(rules, policy, shoe, rng, 0); }
  catch (const std::invalid_argument&) { rejected = true; }
  check(rejected, "illegal complete policy action rejected");
}

void test_natural_identity() {
  HandState original{{Rank::Ace, Rank::King}};
  HandState split{{Rank::Ace, Rank::King}, 1.0, true, true};
  check(is_natural(original), "original natural");
  check(!is_natural(split), "split 21 natural");
}
}  // namespace

int main() {
  try {
    test_hand_values();
    test_pairs_and_shoe();
    test_action_legality();
    test_split_ace_lock();
    test_natural_identity();
    test_dealer_soft_17_rule();
    test_double_restrictions();
    test_split_variations();
    test_peek_and_surrender_timing();
    test_complete_round_push_and_count();
    test_complete_round_updates_visible_count();
    test_complete_round_preserves_split_wager();
    test_complete_round_rejects_illegal_policy();
    std::cout << "blackjack tests passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
