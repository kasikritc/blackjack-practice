# Simulator Workstation

The desktop simulator UI is a separate home-screen mode at `/simulator`. It uses a dedicated service process on port `5175`, so stopping simulation work does not affect drills, analytics, or the main API.

```bash
npm run dev:sim
# or, after npm run build
npm run start:sim
```

The service executes the same native binaries and strict JSON configurations as the CLI. Runs are sequential by default and persist in `data/simulations.sqlite`; generated artifacts remain under `sim/runs/.ui` and `sim/evaluation-runs/.ui`.

## Top-level workflows

| UI workflow           | Native workload         | Purpose                                                                                                                                    |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Strategy Optimizer    | `simulate-strategy run` | Search every hard, soft, and pair decision and generate one chart per true-count/depth bucket.                                             |
| Performance Evaluator | `evaluate-strategy run` | Execute one complete strategy package over deterministic paths and measure EV, risk, exposure, and outcome behavior.                       |
| Runs                  | Both                    | Monitor the queue, inspect live/completed evidence, rename, search, cancel, recover, rerun, trash, restore, purge, and download artifacts. |
| Compare               | Both                    | Compare exactly two generator runs/buckets or evaluator runs, including action changes, EV deltas, and paired path differences.            |

## Fixed presets

Presets are application defaults and are not user-managed. Selecting one resets the structured controls to its checked-in values; Expert controls can then adjust the run without modifying the preset.

| Workflow              | Quick Test                                   | Standard                                         | High Confidence                                | Production                                      |
| --------------------- | -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| Strategy Optimizer    | 20-100 samples/action, 5 shoes, 2 iterations | 10K-100K samples/action, 500 shoes, 4 iterations | 100K-1M samples/action, 1K shoes, 8 iterations | 500K-5M samples/action, 5K shoes, 12 iterations |
| Performance Evaluator | 10K rounds, 20 paths, sampled retention      | 1M rounds, 200 paths                             | 100M rounds, 1K paths                          | 1B rounds, 2K paths                             |

## Strategy Optimizer settings

The guided view exposes identity, target buckets, worker count, true-count rounding, and the complete blackjack rule profile. Expert mode adds every native sampling and convergence field.

- Identity and execution: run name, deterministic seed, worker threads.
- Buckets: integer true counts, decks remaining, nearest or truncate rounding.
- Rules: deck count, H17/S17, peek, hole card, blackjack payout, doubling rule, DAS, surrender, split limit, resplit aces, hit/one-card split aces, insurance, exact-rank ten splitting, and unsupported custom-rule validation.
- Sampling: minimum and maximum samples per action, batch size, reachable shoes per bucket.
- Convergence: maximum frozen-policy iterations, minimum EV margin, confidence Z.
- Preflight: native-compatible validation, estimated rollout count, estimated artifact size, and the equivalent CLI command.

### Optimizer progress and results

- Queue position, overall percent, bucket index, policy iteration, completed and converged cells, current cell, samples, winner margin, confidence interval, stop reason, elapsed time, and ETA.
- A 370-cell chart for every count/depth bucket, colored by action and convergence.
- Per-cell action EV, standard error and interval, samples, win/loss/push, blackjack, bust, surrender, double, split, and average split-hand evidence.
- Exact mean true count, paired winner interval, policy iteration, confidence class, and stop reason.
- Searchable counterfactual starting-composition and continuation-observation evidence.
- Searchable exact running-count strata with EV and standard error.
- Independent insurance probability, take/decline EV, selected decision, and shoe sample count.
- Direct selected-bucket chart export plus chart JSON, import package, summary, manifest, composition, count-strata, and insurance artifacts.

## Performance Evaluator settings

The guided view exposes the strategy source and run structure. Expert mode visually edits the complete strict package and all statistical/retention fields; raw JSON editing is not required.

- Sources: built-in packages, saved Basic Strategy charts, generated optimizer buckets, and uploaded JSON packages.
- Package identity and rules; nearest, truncate, or floor true-count rounding.
- Every hard, soft, and pair chart cell plus conditional hit/stand fallbacks.
- Ordered play deviations with cell, threshold direction, true count, action, and optional fallback.
- Insurance and even-money base decisions and count thresholds.
- Ordered nonnegative betting-ramp thresholds and wager units.
- Run structure: name, seed, fresh-round or continuous-shoe mode, worker threads, rounds, paths, penetration, observer seats.
- Statistics: rounds/hour, confidence Z, risk-bankroll thresholds.
- Retention: aggregate, sampled, or full raw rounds; sample interval; required large-output acknowledgement.
- Preflight: native strategy validation, cross-field wager/observer validation, storage estimate, and equivalent CLI command.

### Evaluator progress and results

- Queue position, completed paths and rounds, elapsed time, and ETA.
- Player EV, house edge, confidence interval, net units, units/hour, drawdown, wagered rounds, initial wagers, and total exposure.
- Profit per table round/unit exposed, variance, standard deviation, and standard error.
- Win, loss, push, blackjack, dealer-blackjack, bust, surrender, double, split, insurance, and even-money rates.
- Finite-horizon risk of ruin for every configured bankroll threshold.
- Selectable independent path-EV distribution with complete per-path sufficient statistics and maximum drawdown.
- Searchable true-count/depth/wager cubes with drill-down into every retained outcome and exposure statistic.
- Memory-bounded, paginated inspection of sampled/full compressed raw round records by path.
- Manifest, summary, compressed aggregate, path checkpoints, and sampled/full raw artifacts; completed summaries can be regenerated through the native `summarize` command.

## Run lifecycle and reproducibility

- Sequential durable queue with live SSE updates and polling fallback.
- Cooperative cancellation; queued work cancels immediately. Evaluator recovery reuses completed path checkpoints. Optimizer recovery restarts the deterministic workload from its original configuration.
- Search by name, ID, or tag; filter by workflow/status; inline rename; rerun; recoverable trash; restore; permanent purge.
- Complete append-only process logs, normalized configuration, immutable evaluator strategy package, executed command, every output artifact, timing, random seed, simulator version, Git commit/dirty state, worker count, hostname, platform, architecture, CPU, core count, memory, and native CUDA device probe.
- Existing CLI run directories are indexed read-only where possible. Obsolete generator schemas remain browsable/comparable but cannot be rerun as current configurations.

## Comparison

Generator comparison selects two completed runs and one bucket from each. It highlights action changes and shows winning-action EV delta, sample delta, and confidence changes for all 370 cells. Same-run cross-bucket comparison is supported.

Evaluator comparison shows summary metric deltas. When seed, rounds, paths, and mode align, it additionally computes the paired per-path EV difference mean, standard error, confidence interval, range, and positive-path count. Structural mismatches remain available as clearly labeled expert comparisons.

## Deliberate chart import

Import is never one click. The review dialog requires:

- a supported American-peek total-dependent package;
- all 370 cells and a validated rule profile;
- convergence and high confidence for every cell;
- a user-selected minimum winner margin;
- comparison against a selected current chart;
- exact rule compatibility with a user-selected saved base chart;
- manual inclusion or exclusion of every changed cell;
- a final approval acknowledgement and selected-cell summary.

The generated package is always validated as a complete 370-cell artifact first. Import then creates a new chart atomically by copying the base chart and replacing only the selected generated actions and fallbacks. The base chart ID and selected cell keys are retained in import provenance.
