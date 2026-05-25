# Blackjack Strategy Simulator Status

## Final Vision

The simulator should become an offline, reproducible blackjack research engine that can generate basic strategy and true-count deviation charts from first principles for any supported house-rule profile. It should run large Monte Carlo jobs on this DGX Spark / GB10 machine, use both CPU orchestration and NVIDIA GPU rollout kernels, and preserve enough aggregate evidence to explain why each action is optimal.

The end state is:

- Define a rule profile and simulation config once.
- Run deterministic, named-seed simulations at large scale.
- Recursively evaluate optimal future decisions after each tested first action.
- Export rich aggregate evidence for every legal action in every scenario.
- Optionally import only the compact best-action chart into the existing Basic Strategy drill.
- Keep full simulation evidence separate from drill charts so later analysis can answer why an action won, not only what action won.

## Implemented

### Shared App Contract

- Added shared simulator DTOs in `shared/src/simulation.ts`.
- Exported simulator DTOs through `@blackjack/shared`.
- Added an imported-chart response DTO so server and client use one shared type contract.

### Strategy Chart Import Path

- Added `POST /api/strategy/charts/import`.
- The endpoint accepts a generated compact `StrategyChart`, rule profile, chart name, and optional simulator source metadata.
- Imported charts are immediately compatible with the existing Basic Strategy drill.
- Added `strategy_chart_imports` metadata table so imported drill charts can point back to simulator run information without storing full simulation data in `strategy_charts`.
- Added a client API helper, `api.importGeneratedChart(...)`.

### Native Simulator Project

- Added `sim/` as a separate native C++20/CUDA project, intentionally outside the npm workspace build.
- Added CMake build support with a compiled CUDA object target.
- Added root npm helpers:
  - `npm run sim:configure`
  - `npm run sim:build`
  - `npm run sim:devices`
  - `npm run sim:smoke`
- Added a smoke config at `sim/configs/smoke.json`.
- Added simulator output ignores for `sim/build/` and `sim/runs/`.

### Current Simulation Engine

- Implemented a deterministic CPU Monte Carlo rollout engine.
- Supports total-dependent chart cells matching the current drill shape:
  - hard totals
  - soft totals
  - pairs
  - dealer upcards 2 through A
- Evaluates legal first actions and estimates expected value per original bet.
- Recursively simulates later decisions rather than using an internet chart.
- Produces aggregate-only artifacts:
  - `manifest.json`
  - `chart.json`
  - `summary.csv`
  - `simulation-summary.json`
  - `results.sql`
  - `results.sqlite`
- Tracks aggregate action statistics including EV, standard error, confidence range, winner margin, win/loss/push rates, bust rate, surrender rate, double rate, split rate, and average split hands.
- Does not store individual hand histories.
- Includes a CUDA device probe; verified this machine reports one CUDA device.

## Not Implemented Yet

### GPU Rollout Kernels

- CUDA currently builds and probes the device, but rollout simulation still runs on CPU.
- No GPU batching, kernel-level card draws, or GPU-side aggregation exists yet.
- The simulator does not yet exploit the full GB10 architecture for millions or billions of hands.

### True-Count Conditioning

- The config and artifacts record true-count and decks-remaining buckets.
- The current engine does not yet construct remaining-shoe compositions conditioned on running count, true count, penetration, or decks remaining.
- Current simulations are effectively fresh-shoe total-dependent simulations with known visible cards removed.

### Policy Convergence

- Later decisions are recursively simulated, but there is no full policy-iteration loop yet.
- Cell records are marked `converged: false` because the engine has not proven stable best actions across iterations or confidence thresholds.
- There is no adaptive sampling that keeps running close cells until winner margin exceeds uncertainty.

### Full Rule Coverage

Partially represented but not complete enough for final research use:

- H17/S17
- DAS/no DAS
- surrender
- blackjack payout
- max split hands
- resplit aces
- hit split aces
- double restrictions

Still needing fuller modeling or validation:

- dealer peek / no-peek settlement subtleties
- early surrender details by dealer blackjack possibility
- insurance EV as a first-class decision
- exact ace split behavior across all casino variants
- composition-dependent decisions
- true-count deviation chart generation

### Analysis UI

- No UI exists yet for browsing simulation runs.
- No EV-by-action comparison view exists in the app.
- No import button or file picker exists in the client UI yet; import support is available through the API.

### Production-Grade Artifacts

- Artifacts are useful but still early.
- `results.sqlite` has a single aggregate action table, not a fully normalized run/cell/action schema.
- Manifest hardware metadata is not fully auto-detected.
- The native config parser is intentionally minimal and should be replaced with a proper JSON parser before complex configs.

## Intended Next Milestones

1. Add conformance tests comparing native hand values, action legality, dealer behavior, and chart shape against the TypeScript drill logic.
2. Replace the minimal native config parser with a real JSON parser and validate configs strictly.
3. Add adaptive CPU policy iteration so cells can become `converged: true` only when EV margins and standard errors justify it.
4. Implement true-count-conditioned shoe generation for running-count and decks-remaining buckets.
5. Move rollout batches to CUDA kernels and keep CPU responsible for orchestration, config, aggregation, and artifact writing.
6. Add a simulation results browser to inspect EV by action and explain imported chart cells.
7. Add an explicit app UI flow for importing generated `chart.json` files into the Basic Strategy drill.
8. Scale up benchmark configs from smoke tests to long-running research jobs.
