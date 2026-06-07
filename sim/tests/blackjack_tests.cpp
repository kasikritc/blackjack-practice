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
    std::cout << "blackjack tests passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
