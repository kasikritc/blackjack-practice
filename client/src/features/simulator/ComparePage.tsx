import { useEffect, useMemo, useState } from "react";
import type {
  EvaluatorComparison,
  GeneratorComparison,
  SimulatorComparison,
  SimulatorRunDetail,
  SimulatorWorkflow
} from "@blackjack/shared";
import { useOutletContext } from "react-router-dom";
import { simulatorApi } from "./api";
import type { SimulatorOutletContext } from "./SimulatorWorkspace";

function formatMetric(value: number): string {
  if (Math.abs(value) < 0.1) return value.toFixed(6);
  return value.toFixed(3);
}

function GeneratorComparisonView({ comparison }: { comparison: GeneratorComparison }) {
  const [changesOnly, setChangesOnly] = useState(true);
  const cells = changesOnly
    ? comparison.cells.filter(cell => cell.actionChanged)
    : comparison.cells;
  return (
    <div className="sim-compare-results">
      <div className="sim-compare-summary">
        <div>
          <span>Changed actions</span>
          <strong>{comparison.cells.filter(cell => cell.actionChanged).length}</strong>
        </div>
        <div>
          <span>Compared cells</span>
          <strong>{comparison.cells.length}</strong>
        </div>
        <div>
          <span>Left bucket</span>
          <strong>{comparison.leftBucket}</strong>
        </div>
        <div>
          <span>Right bucket</span>
          <strong>{comparison.rightBucket}</strong>
        </div>
      </div>
      <label className="sim-trash-toggle">
        <input
          type="checkbox"
          checked={changesOnly}
          onChange={event => setChangesOnly(event.target.checked)}
        />{" "}
        Show action changes only
      </label>
      <div className="sim-compare-cell-table">
        <div className="sim-compare-cell-head">
          <span>Cell</span>
          <span>Left</span>
          <span>Right</span>
          <span>EV delta</span>
          <span>Sample delta</span>
          <span>Confidence</span>
        </div>
        {cells.map(cell => (
          <div key={cell.key} className={cell.actionChanged ? "is-changed" : ""}>
            <strong>{cell.key}</strong>
            <span className={`action-${cell.left?.bestAction}`}>
              {cell.left?.bestAction || "—"}
            </span>
            <span className={`action-${cell.right?.bestAction}`}>
              {cell.right?.bestAction || "—"}
            </span>
            <span>{cell.evDelta === undefined ? "—" : formatMetric(cell.evDelta)}</span>
            <span>{cell.sampleDelta === undefined ? "—" : cell.sampleDelta.toLocaleString()}</span>
            <span>
              {cell.left?.confidence || "—"} → {cell.right?.confidence || "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvaluatorComparisonView({ comparison }: { comparison: EvaluatorComparison }) {
  return (
    <div className="sim-compare-results">
      <div className="sim-compare-summary">
        <div>
          <span>Comparison</span>
          <strong>{comparison.paired ? "Paired paths" : "Unpaired"}</strong>
        </div>
        <div>
          <span>Compatibility</span>
          <strong>{comparison.compatible ? "Compatible" : "Expert mismatch"}</strong>
        </div>
        <div>
          <span>Left run</span>
          <strong>{comparison.leftRunId}</strong>
        </div>
        <div>
          <span>Right run</span>
          <strong>{comparison.rightRunId}</strong>
        </div>
      </div>
      {comparison.pairedDifference ? (
        <section className="sim-paired-difference">
          <div>
            <span>Mean paired EV delta</span>
            <strong>{formatMetric(comparison.pairedDifference.meanDelta)}</strong>
          </div>
          <div>
            <span>Paired interval</span>
            <strong>
              {formatMetric(comparison.pairedDifference.confidenceLow)} to{" "}
              {formatMetric(comparison.pairedDifference.confidenceHigh)}
            </strong>
          </div>
          <div>
            <span>Standard error</span>
            <strong>{formatMetric(comparison.pairedDifference.standardError)}</strong>
          </div>
          <div>
            <span>Positive paths</span>
            <strong>
              {comparison.pairedDifference.positivePaths}/{comparison.pairedDifference.paths}
            </strong>
          </div>
          <div>
            <span>Path delta range</span>
            <strong>
              {formatMetric(comparison.pairedDifference.minimum)} to{" "}
              {formatMetric(comparison.pairedDifference.maximum)}
            </strong>
          </div>
        </section>
      ) : null}
      <div className="sim-compare-metric-table">
        <div className="sim-compare-metric-head">
          <span>Metric</span>
          <span>Left</span>
          <span>Right</span>
          <span>Delta</span>
        </div>
        {Object.entries(comparison.metrics).map(([metric, values]) => (
          <div key={metric}>
            <strong>{metric}</strong>
            <span>{formatMetric(values.left)}</span>
            <span>{formatMetric(values.right)}</span>
            <span
              className={values.delta > 0 ? "is-positive" : values.delta < 0 ? "is-negative" : ""}
            >
              {values.delta > 0 ? "+" : ""}
              {formatMetric(values.delta)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComparePage() {
  const { runs } = useOutletContext<SimulatorOutletContext>();
  const [workflow, setWorkflow] = useState<SimulatorWorkflow>("generator");
  const candidates = useMemo(
    () => runs.filter(run => run.workflow === workflow && run.status === "completed"),
    [runs, workflow]
  );
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [leftDetail, setLeftDetail] = useState<SimulatorRunDetail | null>(null);
  const [rightDetail, setRightDetail] = useState<SimulatorRunDetail | null>(null);
  const [leftBucket, setLeftBucket] = useState("");
  const [rightBucket, setRightBucket] = useState("");
  const [comparison, setComparison] = useState<SimulatorComparison | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const first = candidates[0]?.id || "";
    const second = candidates[1]?.id || first;
    setLeftId(first);
    setRightId(second);
    setComparison(null);
  }, [candidates]);

  useEffect(() => {
    if (!leftId) return setLeftDetail(null);
    simulatorApi
      .run(leftId)
      .then(detail => {
        setLeftDetail(detail);
        setLeftBucket(
          detail.generatorSummary ? Object.keys(detail.generatorSummary.charts)[0] || "" : ""
        );
      })
      .catch(() => setLeftDetail(null));
  }, [leftId]);

  useEffect(() => {
    if (!rightId) return setRightDetail(null);
    simulatorApi
      .run(rightId)
      .then(detail => {
        setRightDetail(detail);
        setRightBucket(
          detail.generatorSummary ? Object.keys(detail.generatorSummary.charts)[0] || "" : ""
        );
      })
      .catch(() => setRightDetail(null));
  }, [rightId]);

  const compare = async () => {
    if (!leftId || !rightId) return;
    setBusy(true);
    setMessage("");
    try {
      setComparison(
        await simulatorApi.compare({
          leftRunId: leftId,
          rightRunId: rightId,
          leftBucket: leftBucket || undefined,
          rightBucket: rightBucket || undefined
        })
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Comparison failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sim-compare-page">
      <section className="simulator-panel sim-compare-builder">
        <div className="sim-section-heading">
          <div>
            <span className="sim-step">1</span>
            <h2>Compare two results</h2>
          </div>
          <div className="sim-workflow-toggle">
            <button
              className={workflow === "generator" ? "is-active" : ""}
              onClick={() => setWorkflow("generator")}
            >
              Strategy Generator
            </button>
            <button
              className={workflow === "evaluator" ? "is-active" : ""}
              onClick={() => setWorkflow("evaluator")}
            >
              Evaluator
            </button>
          </div>
        </div>
        <p className="sim-compare-intro">
          Select compatible runs by default. Expert comparisons remain available and are labeled
          when rules, modes, seeds, or path structures differ.
        </p>
        <div className="sim-compare-selectors">
          <div className="sim-compare-selector">
            <span className="eyebrow">Baseline</span>
            <label>
              <span>Run</span>
              <select value={leftId} onChange={event => setLeftId(event.target.value)}>
                {candidates.map(run => (
                  <option key={run.id} value={run.id}>
                    {run.name}
                  </option>
                ))}
              </select>
            </label>
            {workflow === "generator" ? (
              <label>
                <span>Bucket</span>
                <select value={leftBucket} onChange={event => setLeftBucket(event.target.value)}>
                  {Object.keys(leftDetail?.generatorSummary?.charts || {}).map(bucket => (
                    <option key={bucket}>{bucket}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="sim-compare-run-meta">
              <span>{leftDetail?.id || "No run"}</span>
              <span>
                {leftDetail?.elapsedMs ? `${(leftDetail.elapsedMs / 1000).toFixed(1)}s` : "—"}
              </span>
            </div>
          </div>
          <div className="sim-compare-versus">VS</div>
          <div className="sim-compare-selector">
            <span className="eyebrow">Candidate</span>
            <label>
              <span>Run</span>
              <select value={rightId} onChange={event => setRightId(event.target.value)}>
                {candidates.map(run => (
                  <option key={run.id} value={run.id}>
                    {run.name}
                  </option>
                ))}
              </select>
            </label>
            {workflow === "generator" ? (
              <label>
                <span>Bucket</span>
                <select value={rightBucket} onChange={event => setRightBucket(event.target.value)}>
                  {Object.keys(rightDetail?.generatorSummary?.charts || {}).map(bucket => (
                    <option key={bucket}>{bucket}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="sim-compare-run-meta">
              <span>{rightDetail?.id || "No run"}</span>
              <span>
                {rightDetail?.elapsedMs ? `${(rightDetail.elapsedMs / 1000).toFixed(1)}s` : "—"}
              </span>
            </div>
          </div>
        </div>
        {message ? <p className="sim-error-message">{message}</p> : null}
        <button
          className="primary-button sim-compare-button"
          disabled={busy || !leftId || !rightId}
          onClick={() => void compare()}
        >
          {busy ? "Comparing…" : "Compare selections"}
        </button>
      </section>

      {comparison ? (
        <section className="simulator-panel sim-compare-output">
          <div className="sim-section-heading">
            <div>
              <span className="sim-step">2</span>
              <h3>Differences</h3>
            </div>
            <span
              className={`sim-compatibility${comparison.compatible ? " is-compatible" : " is-warning"}`}
            >
              {comparison.compatible ? "Compatible" : "Expert comparison"}
            </span>
          </div>
          {comparison.warnings.length ? (
            <div className="sim-comparison-warnings">
              {comparison.warnings.map(warning => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          {comparison.workflow === "generator" ? (
            <GeneratorComparisonView comparison={comparison} />
          ) : (
            <EvaluatorComparisonView comparison={comparison} />
          )}
        </section>
      ) : (
        <section className="simulator-panel sim-compare-empty">
          <h3>No comparison calculated</h3>
          <p>Choose two runs or two buckets and calculate their differences.</p>
        </section>
      )}
    </div>
  );
}
