#pragma once

#include <array>
#include <cstdint>
#include <random>
#include <string>
#include <vector>

namespace blackjack_sim {

enum class Rank : uint8_t { Ace, Two, Three, Four, Five, Six, Seven, Eight, Nine, Ten, Jack, Queen, King };
enum class Action : uint8_t { Stand, Hit, Double, Surrender, Split };

struct Rules {
  int decks = 6;
  bool dealer_hits_soft_17 = true;
  bool dealer_peek = true;
  bool dealer_hole_card = true;
  std::string blackjack_payout = "3:2";
  std::string double_rule = "anyTwo";
  bool double_after_split = true;
  std::string surrender = "late";
  int max_split_hands = 4;
  bool resplit_aces = false;
  bool hit_split_aces = false;
  bool one_card_split_aces = true;
  bool insurance = true;
  bool split_tens_by_value = false;
};

struct HandValue { int total = 0; bool soft = false; };

struct HandState {
  std::vector<Rank> cards;
  double bet = 1.0;
  bool from_split = false;
  bool split_aces = false;
  bool surrendered = false;
  bool stood = false;
  bool doubled = false;
};

struct Shoe { std::array<int, 13> counts{}; int total = 0; int decks = 6; };

struct RoundOutcome {
  double profit = 0.0;
  int hands = 1;
  int wins = 0;
  int losses = 0;
  int pushes = 0;
  int busts = 0;
  int doubles = 0;
  int surrenders = 0;
  bool player_blackjack = false;
  bool dealer_blackjack = false;
};

class Policy {
 public:
  virtual ~Policy() = default;
  virtual Action choose(const HandState& hand, Rank dealer_upcard, const Rules& rules,
                        int total_hands) const = 0;
};

int rank_value(Rank rank);
int hi_lo_value(Rank rank);
std::string rank_name(Rank rank);
Rank parse_rank(const std::string& value);
std::string action_name(Action action);
HandValue hand_value(const std::vector<Rank>& cards);
bool is_natural(const HandState& hand);
bool is_pair(const HandState& hand, const Rules& rules);
bool dealer_should_hit(const std::vector<Rank>& cards, const Rules& rules);
double natural_payout(const Rules& rules);
Shoe full_shoe(int decks);
bool remove_card(Shoe& shoe, Rank rank);
Rank draw_card(Shoe& shoe, std::mt19937_64& rng);
std::vector<Action> legal_actions(const HandState& hand, const Rules& rules, int total_hands,
                                  bool initial_decision);
RoundOutcome simulate_round(const Rules& rules, const std::vector<Rank>& initial_player,
                            Rank dealer_upcard, Action first_action, const Policy& policy,
                            Shoe shoe, std::mt19937_64& rng);

class ConservativePolicy final : public Policy {
 public:
  Action choose(const HandState& hand, Rank dealer_upcard, const Rules& rules,
                int total_hands) const override;
};

}  // namespace blackjack_sim
