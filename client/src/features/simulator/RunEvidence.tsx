import { useMemo, useState } from "react";
import type {
  EvaluatorAggregateAnalysis,
  EvaluatorAggregateStats,
  EvaluatorRawRecordsResponse,
  GeneratorEvidenceResponse
} from "@blackjack/shared";
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

function AggregateStats({ stats }: { stats: EvaluatorAggregateStats }) {
  const values = [
    ["Rounds", stats.rounds],
    ["Wagered rounds", stats.wageredRounds],
    ["Profit", stats.profit.toFixed(3)],
    ["Initial wagers", stats.initialWagers.toFixed(2)],
    ["Exposure", stats.exposure.toFixed(2)],
    ["Wins", stats.wins],
    ["Losses", stats.losses],
    ["Pushes", stats.pushes],
    ["Blackjacks", stats.blackjacks],
    ["Dealer blackjacks", stats.dealerBlackjacks],
    ["Busts", stats.busts],
    ["Surrenders", stats.surrenders],
    ["Doubles", stats.doubles],
    ["Splits", stats.splits],
    ["Insurance", stats.insuranceTaken],
    ["Even money", stats.evenMoneyTaken]
  ];
  return (
    <div className="sim-detail-grid sim-stat-grid">
      {values.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
        </div>
      ))}
    </div>
  );
}

export function EvaluatorAnalysisPanel({ runId }: { runId: string }) {
  const [analysis, setAnalysis] = useState<EvaluatorAggregateAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"paths" | "cubes" | "raw">("paths");
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState(0);
  const [selectedCube, setSelectedCube] = useState("");
  const [raw, setRaw] = useState<EvaluatorRawRecordsResponse | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState("");

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
  const loadRaw = (file?: string, offset = 0) => {
    setRawLoading(true);
    setRawError("");
    simulatorApi
      .evaluatorRawRecords(runId, file, offset, 100)
      .then(setRaw)
      .catch(reason =>
        setRawError(reason instanceof Error ? reason.message : "Could not load retained rounds.")
      )
      .finally(() => setRawLoading(false));
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
  const path = analysis?.paths.find(item => item.path === selectedPath) || analysis?.paths[0];
  const cube = analysis?.cubes.find(item => item.key === selectedCube) || cubes[0];

  return (
    <details
      className="sim-evidence-explorer"
      onToggle={event => event.currentTarget.open && load()}
    >
      <summary>Advanced evaluator evidence</summary>
      <p>
        Inspect deterministic path outcomes, complete count/depth/wager sufficient statistics, and
        retained round records without leaving the workstation.
      </p>
      <EvidenceState loading={loading} error={error} />
      {analysis ? (
        <div className="sim-analysis-stack">
          <div className="sim-evidence-tabs">
            <button
              className={view === "paths" ? "is-active" : ""}
              onClick={() => setView("paths")}
            >
              Paths ({analysis.paths.length})
            </button>
            <button
              className={view === "cubes" ? "is-active" : ""}
              onClick={() => setView("cubes")}
            >
              Cubes ({analysis.cubes.length.toLocaleString()})
            </button>
            <button
              className={view === "raw" ? "is-active" : ""}
              onClick={() => {
                setView("raw");
                if (!raw && !rawLoading) loadRaw();
              }}
            >
              Retained rounds
            </button>
          </div>
          {view === "paths" ? (
            <section className="sim-subpanel">
              <div className="sim-subpanel-heading">
                <h4>Independent path EVs</h4>
                <span>{analysis.paths.length} deterministic paths</span>
              </div>
              <div className="sim-path-distribution">
                {analysis.pathEvs.map((value, index) => (
                  <button
                    type="button"
                    className={selectedPath === index ? "is-selected" : ""}
                    key={index}
                    title={"Path " + index + ": " + percent(value)}
                    onClick={() => setSelectedPath(index)}
                  >
                    <i style={{ height: 12 + ((value - pathMin) / pathRange) * 76 + "%" }} />
                    <span>{index}</span>
                  </button>
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
                  <span>Selected drawdown</span>
                  <strong>{path?.maxDrawdown.toFixed(3) || "0.000"}</strong>
                </div>
              </div>
              {path ? <AggregateStats stats={path.stats} /> : null}
            </section>
          ) : null}
          {view === "cubes" ? (
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
                {cubes.slice(0, 250).map(item => {
                  const parts = cubeParts(item.key);
                  const ev = item.stats.initialWagers
                    ? item.stats.profit / item.stats.initialWagers
                    : 0;
                  return (
                    <button
                      type="button"
                      className={
                        "sim-cube-row sim-data-button" +
                        (cube?.key === item.key ? " is-selected" : "")
                      }
                      key={item.key}
                      onClick={() => setSelectedCube(item.key)}
                    >
                      <strong>{parts.trueCount}</strong>
                      <span>{parts.depth}</span>
                      <span>{parts.wager}</span>
                      <span>{item.stats.rounds.toLocaleString()}</span>
                      <span>{item.stats.profit.toFixed(2)}</span>
                      <span>{percent(ev)}</span>
                      <span>{item.stats.exposure.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
              {cube ? <AggregateStats stats={cube.stats} /> : null}
              {cubes.length > 250 ? (
                <p className="sim-table-cap">
                  Showing the 250 largest matching cubes. Refine the filter for a narrower view.
                </p>
              ) : null}
            </section>
          ) : null}
          {view === "raw" ? (
            <section className="sim-subpanel">
              <div className="sim-subpanel-heading">
                <h4>Retained round records</h4>
                <span>Streaming pages from compressed JSONL</span>
              </div>
              <EvidenceState loading={rawLoading} error={rawError} />
              {raw ? (
                <>
                  <div className="sim-evidence-filters">
                    <select
                      value={raw.selectedFile || ""}
                      onChange={event => loadRaw(event.target.value, 0)}
                    >
                      {raw.files.map(file => (
                        <option key={file}>{file}</option>
                      ))}
                    </select>
                    <span>
                      {raw.records.length
                        ? raw.offset + 1 + "-" + (raw.offset + raw.records.length)
                        : "No retained records"}
                    </span>
                  </div>
                  <div className="sim-data-table sim-raw-table">
                    <div className="sim-data-head sim-raw-row">
                      <span>Round</span>
                      <span>Shoe</span>
                      <span>TC / depth</span>
                      <span>Count</span>
                      <span>Wager / exposure</span>
                      <span>Profit</span>
                      <span>Outcome</span>
                    </div>
                    {raw.records.map(record => (
                      <div className="sim-raw-row" key={record.path + ":" + record.round}>
                        <strong>{record.round.toLocaleString()}</strong>
                        <span>{record.shoe}</span>
                        <span>
                          {record.trueCount} / {record.depthPercent}%
                        </span>
                        <span>
                          {record.runningCountBefore} → {record.runningCountAfter}
                        </span>
                        <span>
                          {record.wager.toFixed(2)} / {(record.exposure || 0).toFixed(2)}
                        </span>
                        <span className={record.profit >= 0 ? "is-positive" : "is-negative"}>
                          {record.profit.toFixed(2)}
                        </span>
                        <span>
                          {record.observed
                            ? "Observed"
                            : "W" +
                              (record.wins || 0) +
                              " L" +
                              (record.losses || 0) +
                              " P" +
                              (record.pushes || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="sim-page-actions">
                    <button
                      className="ghost-button"
                      disabled={raw.offset === 0 || rawLoading}
                      onClick={() => loadRaw(raw.selectedFile, Math.max(0, raw.offset - raw.limit))}
                    >
                      Previous
                    </button>
                    <button
                      className="ghost-button"
                      disabled={!raw.hasMore || rawLoading}
                      onClick={() => loadRaw(raw.selectedFile, raw.offset + raw.limit)}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
