# Aggregate Strategy Evaluator

The evaluator measures the player result of one complete, explicit blackjack strategy over independent Monte Carlo paths. It is separate from the strategy generator: the generator searches for actions, while `evaluate-strategy` executes an already-defined strategy exactly.

## Build and verify

```bash
npm run sim:configure
npm run sim:build
npm run sim:test
npm run eval:smoke
```

## Strategy packages

Every built-in strategy, saved chart export, imported JSON package, count deviation, insurance decision, and betting ramp uses [`sim/schema/strategy-package-v1.schema.json`](../sim/schema/strategy-package-v1.schema.json). The native validator also enforces semantic constraints that JSON Schema cannot express:

- every hard, soft, and pair cell is present for every dealer upcard;
- unknown fields, rows, dealer columns, and actions are rejected;
- mechanically impossible actions are rejected;
- double, split, and surrender actions have explicit hit-or-stand fallbacks;
- deviations for a cell use one threshold direction, have unique thresholds, and are ordered;
- insurance and even-money deviations are explicit and ordered;
- the betting ramp is ordered, nonnegative, finite, and covers counts from `-100`;
- only American hole-card games with dealer peek and an empty `customRules` object are supported.

Validate a package before running it:

```bash
sim/build/evaluate-strategy validate --strategy path/to/strategy.json
sim/build/evaluate-strategy validate --strategy builtin:basic-6d-h17-das-ls
```

Action deviations are applied in array order. `atOrAbove` thresholds for one cell must be ascending; `atOrBelow` thresholds must be descending. The last matching threshold determines the action. True count rounding is selected by `trueCountRounding`: `nearest`, `truncate`, or `floor`.

### Export a saved chart

```bash
npm run strategy:export -- --chart-id 1 --output /tmp/my-strategy.json
sim/build/evaluate-strategy validate --strategy /tmp/my-strategy.json
```

The adapter preserves the saved rules and chart, fills required conditional-action fallbacks, and starts with no count deviations, declining insurance/even money, and a flat one-unit bet. Edit those fields under the published schema to describe a counting strategy and ramp.

## Run configuration

Run files follow [`sim/schema/evaluation-run-v1.schema.json`](../sim/schema/evaluation-run-v1.schema.json). Examples are checked in at [`sim/configs/eval-smoke-fresh.json`](../sim/configs/eval-smoke-fresh.json) and [`sim/configs/eval-smoke-continuous.json`](../sim/configs/eval-smoke-continuous.json).

```bash
sim/build/evaluate-strategy run \
  --config sim/configs/eval-smoke-continuous.json \
  --output sim/evaluation-runs
```

`rounds` is the total number of table rounds and `paths` partitions those rounds into deterministic independent paths. Paths are the units of parallel work, confidence estimation, risk-of-ruin observation, and checkpointing. For very large runs, use many more paths than worker threads so work is balanced and completed paths provide useful restart granularity.

Modes:

- `fresh-round`: starts a newly shuffled full shoe and resets the count for every table round.
- `continuous-shoe`: reuses each shoe until `penetrationPercent`, then shuffles and resets the count. A zero-unit ramp step observes table rounds through `observerSeats` so the count can reach a future betting threshold.

The `seed` and path index determine each random stream. Results do not depend on the OpenMP worker count, so separate strategies can use the same config seed and path structure for reproducible common scenarios. A dedicated paired-comparison report is not part of the CLI yet.

## Results

Each run directory contains:

- `manifest.json`: immutable input config and strategy, evaluator version, status, and artifact map;
- `summary.json`: player EV, house edge, confidence interval, variance, hourly EV, outcome rates, risk of ruin, and maximum drawdown;
- `aggregate-data.json.zst`: sufficient aggregate/path/cube data to regenerate the current summary and add metrics derivable from those aggregates;
- `checkpoints/path-N.json.zst`: completed path checkpoints used by resume;
- `raw/path-N.jsonl.zst`: present for `sampled` or `full` retention.

Player EV is net profit divided by initial wager units. House edge is its negative. Exposure includes split, double, and insurance money and is reported separately. Outcome rates classify a complete table round; split-hand counts are also retained in aggregate and raw data. The confidence interval uses dispersion across independent path EVs. Risk of ruin is the observed finite-horizon fraction of paths whose cumulative result reached each configured negative bankroll threshold; it is not an infinite-horizon analytical estimate. `unitsPerHour` uses `roundsPerHour` and profit per table round.

Count/depth/wager cubes are retained in the aggregate artifact. `full` raw retention writes one versioned record per table round with count state, cards remaining, wager/exposure, profit, hand outcomes, insurance result, and card consumption. Use `full` when future unknown metrics must be computed without rerunning. `sampled` supports exploratory analysis at lower storage cost. `aggregate` is smallest but can only support statistics derivable from retained aggregates. Full raw output above ten million rounds requires `acknowledgeLargeOutput: true`.

Regenerate a summary from an existing aggregate artifact:

```bash
sim/build/evaluate-strategy summarize --run sim/evaluation-runs/<run-id>
```

Resume a run with the original config:

```bash
sim/build/evaluate-strategy run \
  --config path/to/original-run.json \
  --resume sim/evaluation-runs/<run-id>
```

Resume rejects any config or strategy content change. Completed path checkpoints are reused; missing paths are recomputed from their deterministic seeds.

## Current boundary

This release is CLI-first and evaluates one tracked player strategy per run. The artifact and shared TypeScript contracts are UI-neutral so a later server/UI layer can submit runs and render existing artifacts without changing the simulation core. No UI or background job service is included yet.
