# Offline Strategy Simulator

Native Monte Carlo strategy-chart generator for blackjack rule profiles.

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

The simulator writes aggregate artifacts only: `manifest.json`, `chart.json`, `summary.csv`, and `results.sqlite`. It does not store individual hand histories.

The first implementation includes a deterministic CPU engine and a compiled CUDA probe target. GPU rollout kernels should extend the same aggregate schema without changing the app import contract.

## Current implementation notes

- The checked-in smoke config uses a low sample count to validate artifact generation quickly. Increase `samplesPerAction` for meaningful charts.
- The CPU engine is deterministic for a given seed/config and writes aggregate statistics only.
- The CUDA target currently verifies runtime availability and is the extension point for GPU rollout kernels.
