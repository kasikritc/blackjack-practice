# Offline Strategy Simulator

Native Monte Carlo strategy-chart generator for blackjack rule profiles.

## Build

```bash
cmake -S sim -B sim/build -DCMAKE_BUILD_TYPE=Release
cmake --build sim/build -j
```

## Run

```bash
sim/build/simulate-strategy run --config sim/configs/smoke.json --output sim/runs
sim/build/simulate-strategy export-chart --run sim/runs/<run-id>
```

The simulator writes aggregate artifacts only: `manifest.json`, `chart.json`, `summary.csv`, and `results.sqlite`. It does not store individual hand histories.

The first implementation includes a deterministic CPU engine and a compiled CUDA probe target. GPU rollout kernels should extend the same aggregate schema without changing the app import contract.
