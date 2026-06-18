# Blackjack Strategy Simulator Status

## Implemented

- Strict structural JSON configuration with no implicit production sampling limits.
- Rank-accurate finite-shoe blackjack engine for American hole-card peek games.
- Correct natural-blackjack, early/late surrender, H17/S17, double, split, resplit, split-ace,
  payout, and shared-dealer settlement behavior.
- Batched paired Monte Carlo action comparisons with frozen-policy iteration.
- Maximum sample caps with explicit confidence, EV margin, sample count, and stop reason.
- Reachable-shoe sampling conditioned on true count and decks remaining at the player decision.
- Configurable nearest-integer or truncation true-count mapping.
- Total-dependent charts plus composition and exact-running-count evidence.
- Independent insurance/even-money evidence.
- One chart/import package per true-count and decks-remaining bucket.
- Strict API rejection of unsupported, unconverged, incomplete, duplicate, or tampered packages.
- Native unit, configuration, CTest, ASan, and UBSan verification commands.
- Strict v1 strategy evaluation package and run schemas shared by built-ins, JSON imports, and saved chart exports.
- Complete-round aggregate evaluator with fresh-round and continuous-shoe modes, true-count betting ramps, play deviations, insurance, and even money.
- Reproducible path-seeded parallel runs with completed-path checkpoints and resume validation.
- EV, house edge, path confidence intervals, variance, hourly EV, outcome rates, finite-horizon risk of ruin, drawdown, and count/depth/wager breakdowns.
- Compressed aggregate, sampled, and full raw artifacts designed for post-run metric computation.
- Dedicated simulator service and desktop workstation for configuring, queueing, monitoring, cancelling, recovering, comparing, retaining, and importing runs.
- Guided fixed presets plus complete visual Expert controls for both native workflows.
- Searchable generator composition/count/insurance evidence and evaluator path/cube evidence.
- Two-run or cross-bucket comparisons, including paired evaluator path differences.

The currently import-validated profile is six-deck H17, DAS, late surrender, 3:2, four split hands,
no resplit aces, one-card split aces, and exact-rank ten splitting. Other structurally supported
rule combinations remain non-importable until dedicated conformance fixtures are added.

## Remaining Native Work

- GPU rollout kernels; CUDA currently remains a device/build probe only.
- Dedicated reference fixtures for each additional rule profile before enabling its import flag.
- Counterfactual EV evaluation for every observed multi-card continuation composition. Current
  continuation evidence records the frozen policy action and observation frequency; starting
  compositions include per-action EV aggregates.
- More efficient rare-count reachable-shoe generation for extreme penetration/count requests.
