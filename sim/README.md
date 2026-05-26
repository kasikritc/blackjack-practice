# Offline Strategy Simulator

Native Monte Carlo strategy-chart generator for blackjack rule profiles.

Current simulator artifact version: `0.2.1`.

## Build

```bash
npm run sim:configure
npm run sim:build
```

## Run

```bash
sim/build/simulate-strategy run --config sim/configs/smoke.json --output sim/runs
sim/build/simulate-strategy export-chart --run sim/runs/<run-id>
```

To convert `chart.json` into a PNG, use the repo helper:

```bash
npm run sim:export-png -- --chart sim/runs/<run-id>/chart.json --output sim/runs/<run-id>/chart.png
```

You can also point it at the run directory and let it use the default output path:

```bash
npm run sim:export-png -- --run sim/runs/<run-id>
```

The simulator writes aggregate artifacts only: `manifest.json`, `chart.json`, `summary.csv`, and `results.sqlite`. It does not store individual hand histories.

The first implementation includes a deterministic CPU engine and a compiled CUDA probe target. GPU rollout kernels should extend the same aggregate schema without changing the app import contract.

## Sampling knobs

`samplesPerAction` controls how many top-level trials are run for each legal first action in each chart cell. Increase this to reduce variance in the action EV estimates.

`policySamplesPerDecision` controls how much Monte Carlo sampling is used for recursive continuation decisions after the tested first action. It defaults to `6` and is intentionally independent from `samplesPerAction`, so large top-level runs scale roughly linearly instead of expanding the recursive decision tree at every depth.

For first-principles validation, increase `policySamplesPerDecision` separately and compare output stability. For high-volume runs, keep it fixed and scale `samplesPerAction`.

## Current implementation notes

- The checked-in smoke config uses a low sample count to validate artifact generation quickly. Increase `samplesPerAction` for lower-variance action EV estimates.
- The CPU engine is deterministic for a given seed/config and writes aggregate statistics only.
- v1 records true-count/decks-remaining buckets in artifacts but does not yet condition the shoe composition from a running-count distribution.
- v1 uses recursive Monte Carlo rollouts for later decisions. `policySamplesPerDecision` controls that continuation budget, but the engine does not yet run multi-iteration convergence checks; generated cell records are marked `converged: false`.
- The CUDA target currently verifies runtime availability and is the extension point for GPU rollout kernels.
