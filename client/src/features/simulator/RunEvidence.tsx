import { useMemo, useState } from "react";
import type { EvaluatorAggregateAnalysis, GeneratorEvidenceResponse } from "@blackjack/shared";
import { simulatorApi } from "./api";
import { formatCompactNumber } from "./format";

function percent(value: number): string {
  return (value * 100).toFixed(3) + "%";
}

function bucketSlug(trueCount: number, decksRemaining: number): string {
  return ("tc" + (trueCount >= 0 ? "+" : "") + trueCount + "-dr" + decksRemaining.toFixed(2))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function EvidenceState({ loading, error }: { loading: boolean; error: string }) {
  if (loading) return <p className="sim-evidence-loading">Loading retained evidence…</p>;
  if (error) return <p className="sim-error-message">{error}</p>;
  return null;
}

export function GeneratorEvidencePanel({
  runId,
  selectedBucket
}: {
  runId: string;
  selectedBucket: string;
}) {
  const [evidence, setEvidence] = useState<GeneratorEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"composition" | "count" | "insurance">("composition");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");

  const load = () => {
    if (evidence || loading) return;
    setLoading(true);
    simulatorApi
      .generatorEvidence(runId)
      .then(setEvidence)
      .catch(reason =>
        setError(reason instanceof Error ? reason.message : "Could not load evidence.")
      )
      .finally(() => setLoading(false));
  };

  const composition = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (evidence?.composition || []).filter(row => {
      if (bucketSlug(row.trueCount, row.decksRemaining) !== selectedBucket) return false;
      if (kind !== "all" && row.kind !== kind) return false;
      if (!normalized) return true;
      return [
        row.category,
        row.sourceCategory,
        row.rowKey,
        row.sourceRowKey,
        row.dealerUpcard,
        row.composition,
        row.state,
        row.action,
        row.selectedAction
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalized));
    });
  }, [evidence, kind, query, selectedBucket]);

  const strata = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (evidence?.countStrata || []).filter(row => {
      if (row.trueCount !== undefined) {
        if (bucketSlug(row.trueCount, row.decksRemaining) !== selectedBucket) return false;
      } else {
        const depthSuffix = "dr" + row.decksRemaining.toFixed(2).replace(".", "-");
        if (!selectedBucket.endsWith(depthSuffix)) return false;
      }
      if (!normalized) return true;
      return (row.category + " " + row.rowKey + " " + row.dealerUpcard + " " + row.action)
        .toLowerCase()
        .includes(normalized);
    });
  }, [evidence, query, selectedBucket]);

  const insurance = (evidence?.insurance || []).filter(
    row => bucketSlug(row.trueCount, row.decksRemaining) === selectedBucket
  );

  return (
    <details
      className="sim-evidence-explorer"
      onToggle={event => event.currentTarget.open && load()}
    >
      <summary>Advanced generator evidence</summary>
      <p>
        Inspect retained composition sensitivity, exact running-count strata, and the independent
        insurance side decision for this count/depth bucket.
      </p>
      <EvidenceState loading={loading} error={error} />
      {evidence ? (
        <>
          <div className="sim-evidence-tabs">
            <button
              className={view === "composition" ? "is-active" : ""}
              onClick={() => setView("composition")}
            >
              Composition ({formatCompactNumber(composition.length)})
            </button>
            <button
              className={view === "count" ? "is-active" : ""}
              onClick={() => setView("count")}
            >
              Exact count ({formatCompactNumber(strata.length)})
            </button>
            <button
              className={view === "insurance" ? "is-active" : ""}
              onClick={() => setView("insurance")}
            >
              Insurance ({insurance.length})
            </button>
          </div>
          {view !== "insurance" ? (
            <div className="sim-evidence-filters">
              <input
                placeholder="Filter cell, dealer, action, composition, or state"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              {view === "composition" ? (
                <select value={kind} onChange={event => setKind(event.target.value)}>
                  <option value="all">All evidence kinds</option>
                  <option value="counterfactual-start">Counterfactual starts</option>
                  <option value="continuation-observation">Continuation observations</option>
                </select>
              ) : null}
            </div>
          ) : null}
          {view === "composition" ? (
            <div className="sim-data-table">
              <div className="sim-data-head sim-composition-row">
                <span>Kind</span>
                <span>Cell / state</span>
                <span>Dealer</span>
                <span>Action</span>
                <span>Samples</span>
                <span>EV / SE</span>
              </div>
              {composition.slice(0, 300).map((row, index) => (
                <div className="sim-composition-row" key={index}>
                  <span>{row.kind.replaceAll("-", " ")}</span>
                  <strong>
                    {row.composition ||
                      row.state ||
                      (row.category || row.sourceCategory) + " " + (row.rowKey || row.sourceRowKey)}
                  </strong>
                  <span>{row.dealerUpcard}</span>
                  <span>{row.action || row.selectedAction}</span>
                  <span>{(row.samples ?? row.observations ?? 0).toLocaleString()}</span>
                  <span>
                    {row.ev === undefined
                      ? "observed"
                      : row.ev.toFixed(6) + " / " + (row.standardError || 0).toFixed(6)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {view === "count" ? (
            <div className="sim-data-table">
              <div className="sim-data-head sim-count-row">
                <span>Cell</span>
                <span>Dealer</span>
                <span>Running count</span>
                <span>Exact TC</span>
                <span>Action</span>
                <span>Samples</span>
                <span>EV / SE</span>
              </div>
              {strata.slice(0, 300).map((row, index) => (
                <div className="sim-count-row" key={index}>
                  <strong>
                    {row.category} {row.rowKey}
                  </strong>
                  <span>{row.dealerUpcard}</span>
                  <span>{row.runningCount}</span>
                  <span>{row.exactTrueCount.toFixed(3)}</span>
                  <span>{row.action}</span>
                  <span>{row.samples.toLocaleString()}</span>
                  <span>
                    {row.ev.toFixed(6)} / {row.standardError.toFixed(6)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {view === "insurance" ? (
            <div className="sim-insurance-grid">
              {insurance.map(row => (
                <div key={row.trueCount + ":" + row.decksRemaining}>
                  <span>Dealer blackjack probability</span>
                  <strong>{percent(row.dealerBlackjackProbability)}</strong>
                  <span>Take EV</span>
                  <strong>{row.takeEv.toFixed(6)}</strong>
                  <span>Decision</span>
                  <strong>{row.bestDecision}</strong>
                  <small>{row.samples.toLocaleString()} reachable shoes</small>
                </div>
              ))}
              {!insurance.length ? (
                <p>No insurance evidence was generated for this rule profile.</p>
              ) : null}
            </div>
          ) : null}
          {(view === "composition" ? composition.length : strata.length) > 300 ? (
            <p className="sim-table-cap">
              Showing the first 300 matching rows. Refine the filter to inspect a narrower stratum.
            </p>
          ) : null}
        </>
      ) : null}
    </details>
  );
}

function cubeParts(key: string) {
  const values = Object.fromEntries(key.split("|").map(part => part.split("=")));
  return { trueCount: values.tc, depth: values.depth, wager: values.wager };
}

export function EvaluatorAnalysisPanel({ runId }: { runId: string }) {
  const [analysis, setAnalysis] = useState<EvaluatorAggregateAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = () => {
    if (analysis || loading) return;
    setLoading(true);
    simulatorApi
      .evaluatorAnalysis(runId)
      .then(setAnalysis)
      .catch(reason =>
        setError(reason instanceof Error ? reason.message : "Could not load aggregate analysis.")
      )
      .finally(() => setLoading(false));
  };

  const cubes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...(analysis?.cubes || [])]
      .filter(cube => !normalized || cube.key.toLowerCase().includes(normalized))
      .sort((left, right) => right.stats.rounds - left.stats.rounds);
  }, [analysis, query]);

  const pathMin = Math.min(...(analysis?.pathEvs || [0]));
  const pathMax = Math.max(...(analysis?.pathEvs || [0]));
  const pathRange = Math.max(pathMax - pathMin, 0.000001);

  return (
    <details
      className="sim-evidence-explorer"
      onToggle={event => event.currentTarget.open && load()}
    >
      <summary>Path distribution and count/depth/wager cubes</summary>
      <p>
        Drill into independent-path EV dispersion and the complete aggregate cube used for count,
        shoe-depth, and wager analysis.
      </p>
      <EvidenceState loading={loading} error={error} />
      {analysis ? (
        <div className="sim-analysis-stack">
          <section className="sim-subpanel">
            <div className="sim-subpanel-heading">
              <h4>Independent path EVs</h4>
              <span>{analysis.paths.length} deterministic paths</span>
            </div>
            <div className="sim-path-distribution">
              {analysis.pathEvs.map((value, index) => (
                <div key={index} title={"Path " + index + ": " + percent(value)}>
                  <i style={{ height: 12 + ((value - pathMin) / pathRange) * 76 + "%" }} />
                  <span>{index}</span>
                </div>
              ))}
            </div>
            <div className="sim-detail-grid">
              <div>
                <span>Minimum path EV</span>
                <strong>{percent(pathMin)}</strong>
              </div>
              <div>
                <span>Maximum path EV</span>
                <strong>{percent(pathMax)}</strong>
              </div>
              <div>
                <span>Evaluator version</span>
                <strong>{analysis.evaluatorVersion}</strong>
              </div>
              <div>
                <span>Aggregate cubes</span>
                <strong>{analysis.cubes.length.toLocaleString()}</strong>
              </div>
            </div>
          </section>
          <section className="sim-subpanel">
            <div className="sim-subpanel-heading">
              <h4>Count / depth / wager explorer</h4>
              <span>Sorted by observed rounds</span>
            </div>
            <div className="sim-evidence-filters">
              <input
                placeholder="Filter tc=, depth=, or wager="
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
            <div className="sim-data-table">
              <div className="sim-data-head sim-cube-row">
                <span>TC</span>
                <span>Depth %</span>
                <span>Wager</span>
                <span>Rounds</span>
                <span>Profit</span>
                <span>Player EV</span>
                <span>Exposure</span>
              </div>
              {cubes.slice(0, 250).map(cube => {
                const parts = cubeParts(cube.key);
                const ev = cube.stats.initialWagers
                  ? cube.stats.profit / cube.stats.initialWagers
                  : 0;
                return (
                  <div className="sim-cube-row" key={cube.key}>
                    <strong>{parts.trueCount}</strong>
                    <span>{parts.depth}</span>
                    <span>{parts.wager}</span>
                    <span>{cube.stats.rounds.toLocaleString()}</span>
                    <span>{cube.stats.profit.toFixed(2)}</span>
                    <span>{percent(ev)}</span>
                    <span>{cube.stats.exposure.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
            {cubes.length > 250 ? (
              <p className="sim-table-cap">
                Showing the 250 largest matching cubes. Refine the filter for a narrower view.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </details>
  );
}
