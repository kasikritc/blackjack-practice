#include "blackjack.hpp"

#include <algorithm>
#include <stdexcept>

namespace blackjack_sim {
namespace {

int rank_index(Rank rank) { return static_cast<int>(rank); }

bool contains(const std::vector<Action>& actions, Action action) {
  return std::find(actions.begin(), actions.end(), action) != actions.end();
}

bool double_allowed(const HandState& hand, const Rules& rules) {
  if (hand.cards.size() != 2 || rules.double_rule == "none") return false;
  if (hand.from_split && !rules.double_after_split) return false;
  const auto value = hand_value(hand.cards);
  if (rules.double_rule == "anyTwo") return true;
  if (rules.double_rule == "hardOnly") return !value.soft;
  if (rules.double_rule == "nineToEleven") return value.total >= 9 && value.total <= 11;
  if (rules.double_rule == "tenToEleven") return value.total == 10 || value.total == 11;
  return false;
}

bool dealer_natural(const std::vector<Rank>& dealer) {
  return dealer.size() == 2 && hand_value(dealer).total == 21;
}

void apply_split(std::vector<HandState>& hands, size_t index, Shoe& shoe,
                 std::mt19937_64& rng) {
  const Rank rank = hands[index].cards.front();
  HandState first{{rank, draw_card(shoe, rng)}, 1.0, true, rank == Rank::Ace};
  HandState second{{rank, draw_card(shoe, rng)}, 1.0, true, rank == Rank::Ace};
  hands[index] = std::move(first);
  hands.insert(hands.begin() + static_cast<long>(index + 1), std::move(second));
}

void apply_action(Action action, HandState& hand, Shoe& shoe, std::mt19937_64& rng) {
  switch (action) {
    case Action::Stand: hand.stood = true; return;
    case Action::Hit: hand.cards.push_back(draw_card(shoe, rng)); return;
    case Action::Double:
      hand.bet = 2.0;
      hand.doubled = true;
      hand.cards.push_back(draw_card(shoe, rng));
      hand.stood = true;
      return;
    case Action::Surrender:
      hand.surrendered = true;
      hand.stood = true;
      return;
    case Action::Split: return;
  }
}

}  // namespace

int rank_value(Rank rank) {
  const int value = rank_index(rank) + 1;
  return value >= 10 ? 10 : value;
}

int hi_lo_value(Rank rank) {
  const int value = rank_value(rank);
  if (value >= 2 && value <= 6) return 1;
  if (value == 1 || value == 10) return -1;
  return 0;
}

std::string rank_name(Rank rank) {
  static constexpr const char* names[] = {"A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"};
  return names[rank_index(rank)];
}

Rank parse_rank(const std::string& value) {
  static const std::vector<std::string> names{"A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"};
  const auto it = std::find(names.begin(), names.end(), value);
  if (it == names.end()) throw std::invalid_argument("invalid rank: " + value);
  return static_cast<Rank>(std::distance(names.begin(), it));
}

std::string action_name(Action action) {
  switch (action) {
    case Action::Stand: return "stand";
    case Action::Hit: return "hit";
    case Action::Double: return "double";
    case Action::Surrender: return "surrender";
    case Action::Split: return "split";
  }
  throw std::logic_error("unknown action");
}

HandValue hand_value(const std::vector<Rank>& cards) {
  int total = 0;
  int aces = 0;
  for (Rank rank : cards) {
    if (rank == Rank::Ace) { total += 11; ++aces; }
    else total += rank_value(rank);
  }
  while (total > 21 && aces > 0) { total -= 10; --aces; }
  return {total, aces > 0};
}

bool is_natural(const HandState& hand) {
  return !hand.from_split && hand.cards.size() == 2 && hand_value(hand.cards).total == 21;
}

bool is_pair(const HandState& hand, const Rules& rules) {
  if (hand.cards.size() != 2) return false;
  if (rules.split_tens_by_value && rank_value(hand.cards[0]) == 10 && rank_value(hand.cards[1]) == 10)
    return true;
  return hand.cards[0] == hand.cards[1];
}

bool dealer_should_hit(const std::vector<Rank>& cards, const Rules& rules) {
  const auto value = hand_value(cards);
  return value.total < 17 || (value.total == 17 && value.soft && rules.dealer_hits_soft_17);
}

double natural_payout(const Rules& rules) {
  const auto colon = rules.blackjack_payout.find(':');
  if (colon == std::string::npos) throw std::invalid_argument("invalid blackjack payout");
  const double numerator = std::stod(rules.blackjack_payout.substr(0, colon));
  const double denominator = std::stod(rules.blackjack_payout.substr(colon + 1));
  if (numerator <= 0 || denominator <= 0) throw std::invalid_argument("invalid blackjack payout");
  return numerator / denominator;
}

Shoe full_shoe(int decks) {
  Shoe shoe;
  shoe.decks = decks;
  shoe.counts.fill(4 * decks);
  shoe.total = 52 * decks;
  return shoe;
}

bool remove_card(Shoe& shoe, Rank rank) {
  int& count = shoe.counts[rank_index(rank)];
  if (count <= 0) return false;
  --count;
  --shoe.total;
  return true;
}

Rank draw_card(Shoe& shoe, std::mt19937_64& rng) {
  if (shoe.total <= 0) throw std::runtime_error("cannot draw from an empty shoe");
  std::uniform_int_distribution<int> dist(0, shoe.total - 1);
  int pick = dist(rng);
  for (int i = 0; i < static_cast<int>(shoe.counts.size()); ++i) {
    if (pick < shoe.counts[i]) {
      --shoe.counts[i];
      --shoe.total;
      return static_cast<Rank>(i);
    }
    pick -= shoe.counts[i];
  }
  throw std::logic_error("shoe count invariant violated");
}

std::vector<Action> legal_actions(const HandState& hand, const Rules& rules, int total_hands,
                                  bool initial_decision) {
  std::vector<Action> actions;
  const auto value = hand_value(hand.cards);
  if (value.total > 21 || hand.surrendered || hand.stood) return actions;
  actions.push_back(Action::Stand);
  const bool split_ace_lock = hand.split_aces && rules.one_card_split_aces && !rules.hit_split_aces;
  if (value.total < 21 && !split_ace_lock) actions.push_back(Action::Hit);
  if (!split_ace_lock && double_allowed(hand, rules)) actions.push_back(Action::Double);
  if (initial_decision && !hand.from_split && hand.cards.size() == 2 && rules.surrender != "none")
    actions.push_back(Action::Surrender);
  const bool ace_resplit_blocked = hand.split_aces && hand.cards[0] == Rank::Ace && !rules.resplit_aces;
  if (is_pair(hand, rules) && total_hands < rules.max_split_hands && !ace_resplit_blocked)
    actions.push_back(Action::Split);
  return actions;
}

RoundOutcome simulate_round(const Rules& rules, const std::vector<Rank>& initial_player,
                            Rank dealer_upcard, Action first_action, const Policy& policy,
                            Shoe shoe, std::mt19937_64& rng) {
  for (Rank rank : initial_player)
    if (!remove_card(shoe, rank)) throw std::invalid_argument("player card absent from shoe");
  if (!remove_card(shoe, dealer_upcard)) throw std::invalid_argument("dealer upcard absent from shoe");

  std::vector<Rank> dealer{dealer_upcard, draw_card(shoe, rng)};
  bool dealer_has_natural = dealer_natural(dealer);
  if (rules.surrender == "early") {
    if (first_action == Action::Surrender)
      return {-0.5, 1, 0, 1, 0, 0, 0, 1, false, dealer_has_natural};
    if (dealer_has_natural) {
      HandState player{initial_player};
      if (is_natural(player)) return {0.0, 1, 0, 0, 1, 0, 0, 0, true, true};
      return {-1.0, 1, 0, 1, 0, 0, 0, 0, false, true};
    }
  } else {
    while (dealer_has_natural) {
      const Rank rejected = dealer.back();
      ++shoe.counts[static_cast<int>(rejected)];
      ++shoe.total;
      dealer.back() = draw_card(shoe, rng);
      dealer_has_natural = dealer_natural(dealer);
    }
  }

  std::vector<HandState> hands{HandState{initial_player}};
  const auto initial_legal = legal_actions(hands.front(), rules, 1, true);
  if (!contains(initial_legal, first_action)) throw std::invalid_argument("illegal first action");
  if (first_action == Action::Split) apply_split(hands, 0, shoe, rng);
  else apply_action(first_action, hands.front(), shoe, rng);

  for (size_t index = 0; index < hands.size(); ++index) {
    while (true) {
      auto& hand = hands[index];
      const auto value = hand_value(hand.cards);
      if (value.total >= 21 || hand.stood || hand.surrendered) break;
      const auto legal = legal_actions(hand, rules, static_cast<int>(hands.size()), false);
      if (legal.empty()) break;
      Action action = policy.choose(hand, dealer_upcard, rules, static_cast<int>(hands.size()));
      if (!contains(legal, action)) action = contains(legal, Action::Hit) ? Action::Hit : Action::Stand;
      if (action == Action::Split) { apply_split(hands, index, shoe, rng); continue; }
      apply_action(action, hand, shoe, rng);
    }
  }

  bool any_live_hand = false;
  for (const auto& hand : hands)
    if (!hand.surrendered && hand_value(hand.cards).total <= 21) any_live_hand = true;
  if (any_live_hand)
    while (dealer_should_hit(dealer, rules)) dealer.push_back(draw_card(shoe, rng));

  const auto dealer_value = hand_value(dealer);
  RoundOutcome out;
  out.hands = static_cast<int>(hands.size());
  for (const auto& hand : hands) {
    const auto player_value = hand_value(hand.cards);
    out.doubles += hand.doubled ? 1 : 0;
    if (hand.surrendered) {
      out.profit -= 0.5; ++out.losses; ++out.surrenders;
    } else if (player_value.total > 21) {
      out.profit -= hand.bet; ++out.losses; ++out.busts;
    } else if (is_natural(hand)) {
      out.profit += natural_payout(rules); ++out.wins; out.player_blackjack = true;
    } else if (dealer_value.total > 21 || player_value.total > dealer_value.total) {
      out.profit += hand.bet; ++out.wins;
    } else if (player_value.total < dealer_value.total) {
      out.profit -= hand.bet; ++out.losses;
    } else {
      ++out.pushes;
    }
  }
  return out;
}

CompleteRoundOutcome play_complete_round(const Rules& rules, const CompletePolicy& policy,
                                         Shoe& shoe, std::mt19937_64& rng,
                                         int running_count, double initial_wager) {
  if (initial_wager <= 0.0) throw std::invalid_argument("initial wager must be positive");
  if (shoe.total < 15) throw std::runtime_error("insufficient cards for a complete round");

  const Shoe before = shoe;
  const double decks_remaining = static_cast<double>(shoe.total) / 52.0;
  const double exact_true_count = running_count / decks_remaining;
  HandState player{{draw_card(shoe, rng)}, initial_wager};
  std::vector<Rank> dealer{draw_card(shoe, rng)};
  player.cards.push_back(draw_card(shoe, rng));
  dealer.push_back(draw_card(shoe, rng));

  CompleteRoundOutcome out;
  out.initial_wager = initial_wager;
  out.total_exposure = initial_wager;
  out.player_blackjack = is_natural(player);
  out.dealer_blackjack = dealer_natural(dealer);

  if (dealer.front() == Rank::Ace && rules.insurance) {
    const InsuranceContext context{out.player_blackjack, running_count, decks_remaining,
                                   exact_true_count};
    if (policy.choose_insurance(context) == InsuranceDecision::Take) {
      out.insurance_taken = true;
      out.even_money_taken = out.player_blackjack;
      out.total_exposure += initial_wager * 0.5;
      out.insurance_profit = out.dealer_blackjack ? initial_wager : -initial_wager * 0.5;
      out.profit += out.insurance_profit;
    }
  }

  auto finish = [&]() {
    out.cards_consumed = before.total - shoe.total;
    for (int i = 0; i < static_cast<int>(before.counts.size()); ++i) {
      const int consumed = before.counts[i] - shoe.counts[i];
      out.running_count_delta += consumed * hi_lo_value(static_cast<Rank>(i));
    }
    return out;
  };

  const auto choose = [&](const HandState& hand, int total_hands, bool initial) {
    const auto legal = legal_actions(hand, rules, total_hands, initial);
    if (legal.empty()) throw std::logic_error("policy requested for terminal hand");
    const DecisionContext context{hand, dealer.front(), rules, legal, total_hands, initial,
                                  running_count, decks_remaining, exact_true_count};
    const Action action = policy.choose_action(context);
    if (!contains(legal, action))
      throw std::invalid_argument("strategy selected illegal action: " + action_name(action));
    return action;
  };

  if (rules.surrender == "early") {
    const Action action = choose(player, 1, true);
    if (action == Action::Surrender) {
      out.profit -= initial_wager * 0.5;
      out.losses = 1;
      out.surrenders = 1;
      return finish();
    }
    if (out.dealer_blackjack) {
      if (out.player_blackjack) out.pushes = 1;
      else { out.profit -= initial_wager; out.losses = 1; }
      return finish();
    }
    if (out.player_blackjack) {
      out.profit += initial_wager * natural_payout(rules);
      out.wins = 1;
      return finish();
    }
    std::vector<HandState> hands{player};
    if (action == Action::Split) { apply_split(hands, 0, shoe, rng); out.total_exposure += initial_wager; }
    else { if (action == Action::Double) out.total_exposure += initial_wager; apply_action(action, hands.front(), shoe, rng); }
    for (size_t index = 0; index < hands.size(); ++index) {
      while (true) {
        auto& hand = hands[index];
        if (hand_value(hand.cards).total >= 21 || hand.stood || hand.surrendered) break;
        const Action next = choose(hand, static_cast<int>(hands.size()), false);
        if (next == Action::Split) { apply_split(hands, index, shoe, rng); out.total_exposure += initial_wager; continue; }
        if (next == Action::Double) out.total_exposure += initial_wager;
        apply_action(next, hand, shoe, rng);
      }
    }
    out.hands = static_cast<int>(hands.size());
    bool live = false;
    for (const auto& hand : hands) if (hand_value(hand.cards).total <= 21) live = true;
    if (live) while (dealer_should_hit(dealer, rules)) dealer.push_back(draw_card(shoe, rng));
    const auto dealer_value = hand_value(dealer);
    for (const auto& hand : hands) {
      const auto value = hand_value(hand.cards);
      out.doubles += hand.doubled ? 1 : 0;
      if (value.total > 21) { out.profit -= hand.bet; ++out.losses; ++out.busts; }
      else if (dealer_value.total > 21 || value.total > dealer_value.total) { out.profit += hand.bet; ++out.wins; }
      else if (value.total < dealer_value.total) { out.profit -= hand.bet; ++out.losses; }
      else ++out.pushes;
    }
    return finish();
  }

  if (out.dealer_blackjack) {
    if (out.player_blackjack) out.pushes = 1;
    else { out.profit -= initial_wager; out.losses = 1; }
    return finish();
  }
  if (out.player_blackjack) {
    out.profit += initial_wager * natural_payout(rules);
    out.wins = 1;
    return finish();
  }

  std::vector<HandState> hands{player};
  for (size_t index = 0; index < hands.size(); ++index) {
    bool initial = true;
    while (true) {
      auto& hand = hands[index];
      if (hand_value(hand.cards).total >= 21 || hand.stood || hand.surrendered) break;
      const Action action = choose(hand, static_cast<int>(hands.size()), initial && !hand.from_split);
      initial = false;
      if (action == Action::Split) { apply_split(hands, index, shoe, rng); out.total_exposure += initial_wager; continue; }
      if (action == Action::Double) out.total_exposure += initial_wager;
      apply_action(action, hand, shoe, rng);
    }
  }

  out.hands = static_cast<int>(hands.size());
  bool live = false;
  for (const auto& hand : hands)
    if (!hand.surrendered && hand_value(hand.cards).total <= 21) live = true;
  if (live) while (dealer_should_hit(dealer, rules)) dealer.push_back(draw_card(shoe, rng));
  const auto dealer_value = hand_value(dealer);
  for (const auto& hand : hands) {
    const auto value = hand_value(hand.cards);
    out.doubles += hand.doubled ? 1 : 0;
    if (hand.surrendered) { out.profit -= hand.bet * 0.5; ++out.losses; ++out.surrenders; }
    else if (value.total > 21) { out.profit -= hand.bet; ++out.losses; ++out.busts; }
    else if (dealer_value.total > 21 || value.total > dealer_value.total) { out.profit += hand.bet; ++out.wins; }
    else if (value.total < dealer_value.total) { out.profit -= hand.bet; ++out.losses; }
    else ++out.pushes;
  }
  return finish();
}

Action ConservativePolicy::choose(const HandState& hand, Rank, const Rules& rules,
                                  int total_hands) const {
  const auto legal = legal_actions(hand, rules, total_hands, false);
  if (contains(legal, Action::Split) && hand.cards.front() == Rank::Ace) return Action::Split;
  const auto value = hand_value(hand.cards);
  if (value.total >= 17 || !contains(legal, Action::Hit)) return Action::Stand;
  return Action::Hit;
}

}  // namespace blackjack_sim
