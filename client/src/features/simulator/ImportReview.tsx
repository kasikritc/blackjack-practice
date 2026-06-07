import { useEffect, useMemo, useState } from "react";
import type { StrategyChartImportPackage, StrategyData } from "@blackjack/shared";
import { api } from "../../lib/api";
import { NumberField, ToggleField } from "./FormControls";

export function ImportReview({
  packageBody,
  onClose
}: {
  packageBody: StrategyChartImportPackage;
  onClose: () => void;
}) {
  const [data, setData] = useState<StrategyData | null>(null);
  const [chartId, setChartId] = useState<number | null>(null);
  const [minimumMargin, setMinimumMargin] = useState(0);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getStrategy()
      .then(next => {
        setData(next);
        setChartId(next.charts[0]?.id || null);
      })
      .catch(() => setMessage("Start the main practice server to compare and import charts."));
  }, []);

  const currentChart = data?.charts.find(chart => chart.id === chartId);
  const changedCells = useMemo(() => {
    if (!currentChart) return [];
    return packageBody.cells.filter(cell => {
      const current = currentChart.chart[cell.category]?.[cell.rowKey]?.[cell.dealerUpcard];
      return current !== cell.bestAction;
    });
  }, [currentChart, packageBody.cells]);

  const validityGates = [
    {
      label: "American peek total-dependent package",
      pass:
        packageBody.validation.gameFamily === "american-peek" &&
        packageBody.validation.totalDependent
    },
    { label: "Simulator-validated rule profile", pass: packageBody.validation.fullySupported },
    { label: "All 370 required cells present", pass: packageBody.cells.length === 370 },
    {
      label: "Every cell converged with high confidence",
      pass:
        packageBody.validation.allCellsConverged &&
        packageBody.cells.every(cell => cell.converged && cell.confidence === "high")
    },
    {
      label: `Every winner margin meets ${minimumMargin}`,
      pass: packageBody.cells.every(cell => cell.winnerMargin >= minimumMargin)
    }
  ];
  const allGatesPass = validityGates.every(gate => gate.pass);
  const reviewComplete = changedCells.every(cell =>
    reviewed.has(`${cell.category}:${cell.rowKey}:${cell.dealerUpcard}`)
  );
  const canImport = allGatesPass && reviewComplete && confirmed && Boolean(data);

  const toggleReviewed = (key: string) => {
    setReviewed(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const importChart = async () => {
    if (!canImport) return;
    setBusy(true);
    try {
      const result = await api.importGeneratedChart(packageBody);
      setMessage(`Imported as chart ${result.chartId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="sim-review-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Review generated strategy import"
    >
      <div className="sim-review-dialog">
        <header>
          <div>
            <p className="eyebrow">Deliberate import</p>
            <h3>Review generated chart</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="sim-review-body">
          <section className="sim-review-column">
            <h4>Validation gates</h4>
            <div className="sim-gate-list">
              {validityGates.map(gate => (
                <div className={gate.pass ? "is-pass" : "is-fail"} key={gate.label}>
                  <span>{gate.pass ? "Pass" : "Fail"}</span>
                  <strong>{gate.label}</strong>
                </div>
              ))}
            </div>
            <NumberField
              label="Minimum accepted winner margin"
              value={minimumMargin}
              min={0}
              step={0.00001}
              onChange={setMinimumMargin}
            />
            <label className="sim-field">
              <span>Compare against current chart</span>
              <select
                value={chartId || ""}
                onChange={event => setChartId(Number(event.target.value))}
              >
                {(data?.charts || []).map(chart => (
                  <option value={chart.id} key={chart.id}>
                    {chart.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sim-import-summary">
              <div>
                <span>Generated chart</span>
                <strong>{packageBody.name}</strong>
              </div>
              <div>
                <span>True count</span>
                <strong>{packageBody.source.trueCount}</strong>
              </div>
              <div>
                <span>Decks remaining</span>
                <strong>{packageBody.source.decksRemaining}</strong>
              </div>
              <div>
                <span>Changed cells</span>
                <strong>{changedCells.length}</strong>
              </div>
              <div>
                <span>Reviewed changes</span>
                <strong>
                  {reviewed.size}/{changedCells.length}
                </strong>
              </div>
            </div>
          </section>

          <section className="sim-review-column sim-change-review">
            <div className="sim-review-section-heading">
              <div>
                <h4>Strategy changes</h4>
                <p>
                  Select changes as you review their evidence. Import remains atomic and complete.
                </p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  setReviewed(
                    new Set(
                      changedCells.map(
                        cell => `${cell.category}:${cell.rowKey}:${cell.dealerUpcard}`
                      )
                    )
                  )
                }
              >
                Mark all reviewed
              </button>
            </div>
            <div className="sim-change-list">
              {changedCells.length ? (
                changedCells.map(cell => {
                  const key = `${cell.category}:${cell.rowKey}:${cell.dealerUpcard}`;
                  const current =
                    currentChart?.chart[cell.category]?.[cell.rowKey]?.[cell.dealerUpcard];
                  return (
                    <label key={key} className={reviewed.has(key) ? "is-reviewed" : ""}>
                      <input
                        type="checkbox"
                        checked={reviewed.has(key)}
                        onChange={() => toggleReviewed(key)}
                      />
                      <strong>
                        {cell.category} {cell.rowKey} vs {cell.dealerUpcard}
                      </strong>
                      <span>
                        {current || "unset"} → {cell.bestAction}
                      </span>
                      <small>
                        Margin {cell.winnerMargin.toFixed(6)} · {cell.samples.toLocaleString()}{" "}
                        samples · {cell.stopReason}
                      </small>
                    </label>
                  );
                })
              ) : (
                <p className="sim-no-changes">No opening-action changes from the selected chart.</p>
              )}
            </div>
          </section>
        </div>
        <footer>
          <div>
            <ToggleField
              label="I approve creating this complete chart"
              checked={confirmed}
              onChange={setConfirmed}
              hint="The selected cells above are a review checklist, not a partial import."
            />
            {message ? <p className="sim-review-message">{message}</p> : null}
          </div>
          <button
            className="primary-button"
            disabled={!canImport || busy}
            onClick={() => void importChart()}
          >
            {busy ? "Importing…" : "Import complete chart"}
          </button>
        </footer>
      </div>
    </div>
  );
}
