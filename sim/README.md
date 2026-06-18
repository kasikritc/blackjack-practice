# Offline Blackjack Simulation

This directory contains two native tools:

- `simulate-strategy` generates strategy evidence and charts.
- `evaluate-strategy` executes a strict input strategy over complete rounds to measure aggregate EV, house edge, risk, and related statistics.

See [`docs/strategy-evaluator.md`](../docs/strategy-evaluator.md) for the evaluator package schema, saved-chart export, run modes, retention artifacts, and resume workflow.

## Strategy Generator

Native CPU Monte Carlo strategy generator for American hole-card blackjack with dealer peek.
The current artifact version is `0.3.0`.

## Build and verify

```bash
npm run sim:configure
npm run sim:build
npm run sim:test
npm run sim:smoke
npm run sim:sanitize
```

`sim:sanitize` creates an ignored `sim/build-sanitize/` tree and runs the native tests with
AddressSanitizer and UndefinedBehaviorSanitizer.

## Run

Every production sampling limit is explicit in the config. The checked-in baseline profile is:

```bash
sim/build/simulate-strategy run \
  --config sim/configs/baseline-6d-h17-das-ls.json \
  --output sim/runs
```

The smoke configs use intentionally tiny limits and are expected to produce unconverged,
non-importable packages.

## Configuration

A config contains a complete `StrategyRules` object plus:

- `minSamplesPerAction`, `maxSamplesPerAction`, and `batchSize`
- `shoeSamplesPerBucket`
- `maxPolicyIterations`
- `minimumEvMargin` and `confidenceZ`
- `trueCountBuckets` and `decksRemainingBuckets`
- `trueCountRounding`: `nearest` or `truncate`

The simulator rejects unknown fields, no-peek/no-hole-card games, non-empty `customRules`, and
contradictory split-ace settings. The default documented count mapping is nearest integer, while
exact running-count strata are retained for later analysis.

## Model

- Uses 13 distinct ranks and a finite shared shoe.
- Resolves American peek timing before late-surrender play decisions.
- Distinguishes naturals from split or multi-card 21.
- Plays all split hands from one shoe against one dealer result.
- Enforces DAS, double restrictions, global split limits, ace rules, and ten-pair rules.
- Evaluates first actions with paired common-random-number rollouts against a frozen continuation
  policy, then improves that policy between iterations.
- Stops a cell only when the paired 95% lower confidence bound exceeds `minimumEvMargin`, or when
  the configured sample cap is reached.
- Samples reachable shoes at the player decision point after the player cards and upcard are known.

## Artifacts

Each run writes:

- `manifest.json`
- `simulation-summary.json`
- `chart.json` and `import-package.json` for single-bucket runs
- `charts/*.json` and `charts/*.import-package.json` for every bucket
- `composition-evidence.json`, including starting counterfactual aggregates and all observed
  continuation compositions
- `count-strata-results.json` for exact running-count re-bucketing
- `insurance-results.json` for the independent insurance/even-money decision

Individual hand histories are never persisted. The application rejects packages unless the rule
profile is validated, every required cell is present and converged, and chart actions match the
cell evidence.
