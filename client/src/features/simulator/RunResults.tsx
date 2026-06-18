import { useMemo, useState } from "react";
import type {
  StrategyEvaluationSummary,
  StrategySimulationCellResult,
  StrategySimulationSummary
} from "@blackjack/shared";
import { formatCompactNumber } from "./format";
import { EvaluatorAnalysisPanel, GeneratorEvidencePanel } from "./RunEvidence";

const DEALERS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
const SECTIONS = [
  [
    "hard",
    "Hard totals",
    Array.from({ length: 18 }, (_, index) => ({ key: `h${index + 4}`, label: String(index + 4) }))
  ],
  [
    "soft",
    "Soft totals",
    Array.from({ length: 9 }, (_, index) => ({ key: `s${index + 13}`, label: `A,${index + 2}` }))
  ],
  [
    "pair",
    "Pairs",
    ["A", "10", "9", "8", "7", "6", "5", "4", "3", "2"].map(rank => ({
      key: `p${rank}`,
      label: `${rank},${rank}`
    }))
  ]
] as const;

function bucketSlug(trueCount: number, decksRemaining: number): string {
  return `tc${trueCount >= 0 ? "+" : ""}${trueCount}-dr${decksRemaining.toFixed(2)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

export function GeneratorResults({
  runId,
  summary,
  selectedBucket,
  onBucketChange,
  onImport,
  chartUrl
}: {
  runId: string;
  summary: StrategySimulationSummary;
  selectedBucket: string;
  onBucketChange: (bucket: string) => void;
  onImport: (bucket: string) => void;
  chartUrl: (bucket: string) => string;
}) {
  const [selectedCell, setSelectedCell] = useState<StrategySimulationCellResult | null>(null);
  const buckets = Object.keys(summary.charts);
  const cells = useMemo(
    () =>
      summary.cells.filter(
        cell => bucketSlug(cell.trueCount, cell.decksRemaining) === selectedBucket
      ),
    [summary.cells, selectedBucket]
  );
  const byKey = useMemo(
    () =>
      new Map(cells.map(cell => [`${cell.category}:${cell.rowKey}:${cell.dealerUpcard}`, cell])),
    [cells]
  );
  const converged = cells.filter(cell => cell.converged).length;
  const importable =
    summary.manifest.capabilities?.gameFamily === "american-peek" &&
    cells.length === 370 &&
    converged === cells.length;

  return (
    <div className="sim-result-stack">
      <div className="sim-result-toolbar">
        <label>
          <span>Count / depth bucket</span>
          <select value={selectedBucket} onChange={event => onBucketChange(event.target.value)}>
            {buckets.map(bucket => (
              <option key={bucket}>{bucket}</option>
            ))}
          </select>
        </label>
        <div className="sim-result-kpis">
          <span>
            <strong>{cells.length}</strong> cells
          </span>
          <span>
            <strong>{converged}</strong> converged
          </span>
          <span>
            <strong>{summary.manifest.config.maxPolicyIterations}</strong> max iterations
          </span>
        </div>
        <button
          className="primary-button"
          disabled={!importable}
          onClick={() => onImport(selectedBucket)}
        >
          Review chart import
        </button>
        <a className="ghost-button sim-download-button" href={chartUrl(selectedBucket)}>
          Export selected chart
        </a>
      </div>

      <div className="sim-chart-evidence-layout">
        <div className="sim-chart-stack">
          {SECTIONS.map(([category, title, rows]) => (
            <div className="sim-result-chart" key={category}>
              <h4>{title}</h4>
              <div className="sim-result-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      {DEALERS.map(dealer => (
                        <th key={dealer}>{dealer}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.key}>
                        <th>{row.label}</th>
                        {DEALERS.map(dealer => {
                          const cell = byKey.get(`${category}:${row.key}:${dealer}`);
                          return (
                            <td key={dealer}>
                              <button
                                type="button"
                                className={`sim-evidence-cell action-${cell?.bestAction || "unknown"}${cell?.converged ? " is-converged" : " is-unconverged"}${selectedCell === cell ? " is-selected" : ""}`}
                                title={
                                  cell
                                    ? `${cell.bestAction}; margin ${cell.winnerMargin.toFixed(5)}; ${cell.samples.toLocaleString()} samples`
                                    : "No evidence"
                                }
                                onClick={() => setSelectedCell(cell || null)}
                              >
                                {cell?.bestAction.slice(0, 2).toUpperCase() || "–"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <aside className="sim-cell-evidence">
          {selectedCell ? (
            <>
              <p className="eyebrow">Cell evidence</p>
              <h4>
                {selectedCell.category} {selectedCell.rowKey} vs {selectedCell.dealerUpcard}
              </h4>
              <dl>
                <div>
                  <dt>Best action</dt>
                  <dd>{selectedCell.bestAction}</dd>
                </div>
                <div>
                  <dt>Samples/action</dt>
                  <dd>{selectedCell.samples.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Winner margin</dt>
                  <dd>{selectedCell.winnerMargin.toFixed(6)}</dd>
                </div>
                <div>
                  <dt>Paired standard error</dt>
                  <dd>{selectedCell.pairedStandardError.toFixed(6)}</dd>
                </div>
                <div>
                  <dt>Paired interval</dt>
                  <dd>
                    {selectedCell.pairedConfidenceLow.toFixed(6)} to{" "}
                    {selectedCell.pairedConfidenceHigh.toFixed(6)}
                  </dd>
                </div>
                <div>
                  <dt>Exact mean TC</dt>
                  <dd>{selectedCell.meanExactTrueCount.toFixed(3)}</dd>
                </div>
                <div>
                  <dt>Policy iteration</dt>
                  <dd>{selectedCell.policyIteration}</dd>
                </div>
                <div>
                  <dt>Stop reason</dt>
                  <dd>{selectedCell.stopReason}</dd>
                </div>
              </dl>
              <div className="sim-action-evidence-list">
                {selectedCell.actions.map(action => (
                  <div
                    key={action.action}
                    className={action.action === selectedCell.bestAction ? "is-best" : ""}
                  >
                    <strong>{action.action}</strong>
                    <span>EV {action.ev.toFixed(6)}</span>
                    <span>
                      CI {action.confidenceLow.toFixed(5)}…{action.confidenceHigh.toFixed(5)}
                    </span>
                    <span>
                      W/L/P {percent(action.winRate)} / {percent(action.lossRate)} /{" "}
                      {percent(action.pushRate)}
                    </span>
                    <span>
                      Bust {percent(action.bustRate)} · Double {percent(action.doubleRate)} · Split{" "}
                      {percent(action.splitRate)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="sim-empty-evidence">
              <p className="eyebrow">Cell evidence</p>
              <h4>Select a chart cell</h4>
              <p>Inspect paired EV, confidence, samples, stop reason, and action outcome rates.</p>
            </div>
          )}
        </aside>
      </div>
      <GeneratorEvidencePanel runId={runId} selectedBucket={selectedBucket} />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={`sim-metric-card${tone ? ` is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function EvaluatorResults({
  runId,
  summary
}: {
  runId: string;
  summary: StrategyEvaluationSummary;
}) {
  const outcomeEntries = Object.entries(summary.outcomeRates);
  const maxOutcome = Math.max(...outcomeEntries.map(([, value]) => value), 0.01);
  return (
    <div className="sim-result-stack">
      <div className="sim-metric-grid">
        <Metric
          label="Player EV"
          value={percent(summary.playerEv)}
          tone={summary.playerEv >= 0 ? "good" : "bad"}
        />
        <Metric
          label="House edge"
          value={percent(summary.houseEdge)}
          tone={summary.houseEdge <= 0 ? "good" : "bad"}
        />
        <Metric
          label="95% interval"
          value={`${percent(summary.confidenceLow)} to ${percent(summary.confidenceHigh)}`}
        />
        <Metric
          label="Net profit"
          value={`${summary.netProfitUnits.toFixed(2)} units`}
          tone={summary.netProfitUnits >= 0 ? "good" : "bad"}
        />
        <Metric
          label="Units / hour"
          value={summary.unitsPerHour.toFixed(3)}
          tone={summary.unitsPerHour >= 0 ? "good" : "bad"}
        />
        <Metric label="Max drawdown" value={`${summary.maxDrawdownUnits.toFixed(2)} units`} />
        <Metric label="Wagered rounds" value={formatCompactNumber(summary.wageredRounds)} />
        <Metric label="Total exposure" value={formatCompactNumber(summary.totalExposure)} />
      </div>

      <div className="sim-results-two-column">
        <section className="sim-subpanel">
          <div className="sim-subpanel-heading">
            <h4>Outcome rates</h4>
            <span>Complete table rounds</span>
          </div>
          <div className="sim-bar-list">
            {outcomeEntries.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <div>
                  <i style={{ width: `${(value / maxOutcome) * 100}%` }} />
                </div>
                <strong>{percent(value)}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="sim-subpanel">
          <div className="sim-subpanel-heading">
            <h4>Risk of ruin</h4>
            <span>Observed finite path horizon</span>
          </div>
          <div className="sim-risk-table">
            <div className="sim-risk-head">
              <span>Bankroll</span>
              <span>Probability</span>
              <span>Rounds/path</span>
            </div>
            {summary.riskOfRuin.map(item => (
              <div key={item.bankrollUnits}>
                <span>{item.bankrollUnits} units</span>
                <strong>{percent(item.ruinProbability)}</strong>
                <span>{item.horizonRoundsPerPath.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="sim-subpanel">
        <div className="sim-subpanel-heading">
          <h4>Variance and exposure</h4>
          <span>Aggregate sufficient statistics</span>
        </div>
        <div className="sim-detail-grid">
          <div>
            <span>Profit / table round</span>
            <strong>{summary.profitPerTableRound.toFixed(6)}</strong>
          </div>
          <div>
            <span>Profit / unit exposed</span>
            <strong>{summary.profitPerUnitExposed.toFixed(6)}</strong>
          </div>
          <div>
            <span>Variance / wagered round</span>
            <strong>{summary.variancePerWageredRound.toFixed(6)}</strong>
          </div>
          <div>
            <span>Standard deviation</span>
            <strong>{summary.standardDeviationPerWageredRound.toFixed(6)}</strong>
          </div>
          <div>
            <span>Standard error</span>
            <strong>{summary.standardError.toFixed(6)}</strong>
          </div>
          <div>
            <span>Initial wagers</span>
            <strong>{summary.initialWagers.toLocaleString()}</strong>
          </div>
          <div>
            <span>Table rounds</span>
            <strong>{summary.tableRounds.toLocaleString()}</strong>
          </div>
          <div>
            <span>Artifact version</span>
            <strong>{summary.artifactVersion}</strong>
          </div>
        </div>
      </section>
      <EvaluatorAnalysisPanel runId={runId} />
    </div>
  );
}
