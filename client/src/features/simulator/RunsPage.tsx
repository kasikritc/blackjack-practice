import { useEffect, useMemo, useState } from "react";
import type {
  SimulatorRunDetail,
  SimulatorRunListItem,
  StrategyChartImportPackage
} from "@blackjack/shared";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { simulatorApi } from "./api";
import { ImportReview } from "./ImportReview";
import { EvaluatorResults, GeneratorResults } from "./RunResults";
import type { SimulatorOutletContext } from "./SimulatorWorkspace";
import { formatBytes, formatCompactNumber } from "./format";

function progressPercent(run: SimulatorRunListItem): number {
  const progress = run.progress;
  if (!progress) return run.status === "completed" ? 100 : 0;
  if (progress.workflow === "evaluator")
    return progress.totalRounds ? (progress.completedRounds / progress.totalRounds) * 100 : 0;
  const bucketProgress = progress.totalCells ? progress.completedCells / progress.totalCells : 0;
  return progress.bucketCount
    ? ((Math.max(0, progress.bucketIndex - 1) + bucketProgress) / progress.bucketCount) * 100
    : bucketProgress * 100;
}

function formatDuration(milliseconds?: number): string {
  if (milliseconds === undefined) return "—";
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function estimatedRemaining(run: SimulatorRunListItem): number | undefined {
  if (!run.startedAt) return undefined;
  const progress = progressPercent(run);
  if (progress <= 0 || progress >= 100) return undefined;
  const elapsed = Date.now() - new Date(run.startedAt).getTime();
  return elapsed * (100 / progress - 1);
}

function canRerun(detail: SimulatorRunDetail): boolean {
  return (
    detail.workflow === "evaluator" ||
    typeof (detail.config as { minSamplesPerAction?: unknown }).minSamplesPerAction === "number"
  );
}

function RunCard({
  run,
  selected,
  onClick
}: {
  run: SimulatorRunListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const progress = Math.min(100, Math.max(0, progressPercent(run)));
  return (
    <button
      type="button"
      className={`sim-run-card${selected ? " is-selected" : ""}`}
      onClick={onClick}
    >
      <div className="sim-run-card-heading">
        <span className={`sim-run-type is-${run.workflow}`}>{run.workflow}</span>
        <span className={`sim-run-status is-${run.status}`}>{run.status}</span>
      </div>
      <strong>{run.name}</strong>
      <small>
        {new Date(run.createdAt).toLocaleString()} · {formatDuration(run.elapsedMs)}
      </small>
      {run.status === "running" || run.status === "cancelling" || run.status === "queued" ? (
        <div className="sim-run-progress">
          <i style={{ width: `${progress}%` }} />
          <span>{progress.toFixed(1)}%</span>
        </div>
      ) : null}
    </button>
  );
}

export function RunsPage() {
  const context = useOutletContext<SimulatorOutletContext>();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("selected") || context.runs[0]?.id || "";
  const [runs, setRuns] = useState(context.runs);
  const [detail, setDetail] = useState<SimulatorRunDetail | null>(null);
  const [search, setSearch] = useState("");
  const [workflow, setWorkflow] = useState<"all" | "generator" | "evaluator">("all");
  const [status, setStatus] = useState("all");
  const [showTrash, setShowTrash] = useState(false);
  const [tab, setTab] = useState<"results" | "configuration" | "artifacts" | "logs">("results");
  const [selectedBucket, setSelectedBucket] = useState("");
  const [importPackage, setImportPackage] = useState<StrategyChartImportPackage | null>(null);
  const [message, setMessage] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    if (!showTrash) setRuns(context.runs);
  }, [context.runs, showTrash]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const load = () =>
      simulatorApi
        .run(selectedId)
        .then(run => {
          if (cancelled) return;
          setDetail(run);
          if (!editingName) setNameDraft(run.name);
          if (run.generatorSummary && !selectedBucket)
            setSelectedBucket(Object.keys(run.generatorSummary.charts)[0] || "");
        })
        .catch(
          error =>
            !cancelled && setMessage(error instanceof Error ? error.message : "Could not load run.")
        );
    void load();
    const active = runs.find(
      run => run.id === selectedId && ["running", "cancelling"].includes(run.status)
    );
    const timer = active ? window.setInterval(() => void load(), 1500) : null;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [selectedId, runs, selectedBucket, editingName]);

  const filtered = useMemo(
    () =>
      runs.filter(run => {
        if (workflow !== "all" && run.workflow !== workflow) return false;
        if (status !== "all" && run.status !== status) return false;
        const query = search.trim().toLowerCase();
        return (
          !query ||
          run.name.toLowerCase().includes(query) ||
          run.id.toLowerCase().includes(query) ||
          run.tags.some(tag => tag.toLowerCase().includes(query))
        );
      }),
    [runs, search, workflow, status]
  );

  const selectRun = (id: string) => {
    setParams({ selected: id });
    setSelectedBucket("");
    setTab("results");
    setMessage("");
  };

  const reloadRuns = async (trash = showTrash) => {
    const response = await simulatorApi.runs(trash);
    setRuns(response.runs);
    await context.refresh();
  };

  const action = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
      await reloadRuns();
      if (selectedId) setDetail(await simulatorApi.run(selectedId).catch(() => null));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Run action failed.");
    }
  };

  const saveName = async () => {
    if (!detail || !nameDraft.trim()) return;
    await action(() => simulatorApi.rename(detail.id, nameDraft.trim()));
    setEditingName(false);
  };

  const openImport = async (bucket: string) => {
    if (!detail?.outputDirectory) return;
    const artifact =
      detail.artifacts.find(item => item.relativePath === `charts/${bucket}.import-package.json`) ||
      detail.artifacts.find(item => item.relativePath === "import-package.json");
    if (!artifact) {
      setMessage("This run does not include a chart import package.");
      return;
    }
    try {
      const response = await fetch(simulatorApi.artifactUrl(detail.id, artifact.relativePath));
      if (!response.ok) throw new Error("Could not load the import package.");
      setImportPackage((await response.json()) as StrategyChartImportPackage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the import package.");
    }
  };

  const toggleTrash = async (checked: boolean) => {
    setShowTrash(checked);
    const response = await simulatorApi.runs(checked);
    setRuns(checked ? response.runs.filter(run => run.status === "trashed") : response.runs);
    const first = (
      checked ? response.runs.filter(run => run.status === "trashed") : response.runs
    )[0];
    if (first) selectRun(first.id);
  };

  return (
    <div className="sim-runs-layout">
      <aside className="sim-run-browser simulator-panel">
        <div className="sim-run-browser-heading">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2>Runs</h2>
          </div>
          <span>{filtered.length}</span>
        </div>
        <input
          className="sim-run-search"
          placeholder="Search name, ID, or tag"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <div className="sim-run-filters">
          <select
            value={workflow}
            onChange={event => setWorkflow(event.target.value as typeof workflow)}
          >
            <option value="all">All workflows</option>
            <option value="generator">Generator</option>
            <option value="evaluator">Evaluator</option>
          </select>
          <select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <label className="sim-trash-toggle">
          <input
            type="checkbox"
            checked={showTrash}
            onChange={event => void toggleTrash(event.target.checked)}
          />{" "}
          Show recoverable trash
        </label>
        <div className="sim-run-list">
          {filtered.map(run => (
            <RunCard
              key={run.id}
              run={run}
              selected={run.id === selectedId}
              onClick={() => selectRun(run.id)}
            />
          ))}
          {!filtered.length ? <p className="sim-empty-list">No runs match these filters.</p> : null}
        </div>
      </aside>

      <main className="sim-run-detail simulator-panel">
        {detail ? (
          <>
            <header className="sim-run-detail-header">
              <div>
                <div className="sim-run-detail-badges">
                  <span className={`sim-run-type is-${detail.workflow}`}>{detail.workflow}</span>
                  <span className={`sim-run-status is-${detail.status}`}>{detail.status}</span>
                </div>
                <div className="sim-run-title-row">
                  {editingName ? (
                    <div className="sim-run-rename">
                      <input
                        value={nameDraft}
                        onChange={event => setNameDraft(event.target.value)}
                        onKeyDown={event => event.key === "Enter" && void saveName()}
                        autoFocus
                      />
                      <button className="primary-button" onClick={() => void saveName()}>
                        Save
                      </button>
                      <button className="ghost-button" onClick={() => setEditingName(false)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <h2>{detail.name}</h2>
                      <button
                        className="sim-rename-button"
                        onClick={() => {
                          setNameDraft(detail.name);
                          setEditingName(true);
                        }}
                      >
                        Rename
                      </button>
                    </>
                  )}
                </div>
                <p>
                  {detail.id} · {new Date(detail.createdAt).toLocaleString()} ·{" "}
                  {formatDuration(detail.elapsedMs)}
                </p>
              </div>
              <div className="sim-run-actions">
                {detail.status === "running" ||
                detail.status === "queued" ||
                detail.status === "cancelling" ? (
                  <button
                    className="danger-button"
                    onClick={() => void action(() => simulatorApi.cancel(detail.id))}
                  >
                    Cancel
                  </button>
                ) : null}
                {["cancelled", "failed", "interrupted"].includes(detail.status) ? (
                  <button
                    className="primary-button"
                    onClick={() => void action(() => simulatorApi.resume(detail.id))}
                  >
                    {detail.workflow === "evaluator" ? "Resume checkpoints" : "Restart run"}
                  </button>
                ) : null}
                {detail.status === "completed" && canRerun(detail) ? (
                  <button
                    className="ghost-button"
                    onClick={() => void action(() => simulatorApi.rerun(detail.id))}
                  >
                    Rerun
                  </button>
                ) : null}
                {detail.status === "completed" && !canRerun(detail) ? (
                  <span
                    className="sim-legacy-note"
                    title="Legacy runs use an obsolete configuration schema."
                  >
                    Legacy schema
                  </span>
                ) : null}
                {detail.status === "trashed" ? (
                  <>
                    <button
                      className="ghost-button"
                      onClick={() => void action(() => simulatorApi.restore(detail.id))}
                    >
                      Restore
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (window.confirm("Permanently delete this run and all artifacts?"))
                          void action(() => simulatorApi.purge(detail.id));
                      }}
                    >
                      Purge
                    </button>
                  </>
                ) : !["running", "cancelling"].includes(detail.status) ? (
                  <button
                    className="danger-button"
                    onClick={() => void action(() => simulatorApi.trash(detail.id))}
                  >
                    Trash
                  </button>
                ) : null}
              </div>
            </header>

            {detail.status === "running" ||
            detail.status === "cancelling" ||
            detail.status === "queued" ? (
              <div className="sim-live-progress">
                <div>
                  <strong>{progressPercent(detail).toFixed(1)}%</strong>
                  <span>
                    {detail.status === "queued"
                      ? `Queue position ${detail.queuePosition || "—"}`
                      : "Native workload progress"}
                  </span>
                </div>
                <div className="sim-live-progress-track">
                  <i style={{ width: `${progressPercent(detail)}%` }} />
                </div>
                {estimatedRemaining(detail) !== undefined ? (
                  <span className="sim-progress-eta">
                    Estimated remaining {formatDuration(estimatedRemaining(detail))}
                  </span>
                ) : null}
                {detail.progress?.workflow === "generator" ? (
                  <div className="sim-live-evidence">
                    <span>
                      Bucket {detail.progress.bucketIndex}/{detail.progress.bucketCount}
                    </span>
                    <span>
                      Iteration {detail.progress.policyIteration || 0}/
                      {detail.progress.maxPolicyIterations || "—"}
                    </span>
                    <span>
                      Cells {detail.progress.completedCells}/{detail.progress.totalCells}
                    </span>
                    <span>Converged {detail.progress.convergedCells || 0}</span>
                  </div>
                ) : detail.progress?.workflow === "evaluator" ? (
                  <div className="sim-live-evidence">
                    <span>
                      Paths {detail.progress.completedPaths}/{detail.progress.totalPaths}
                    </span>
                    <span>
                      Rounds {formatCompactNumber(detail.progress.completedRounds)}/
                      {formatCompactNumber(detail.progress.totalRounds)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <nav className="sim-detail-tabs">
              {(["results", "configuration", "artifacts", "logs"] as const).map(item => (
                <button
                  key={item}
                  className={tab === item ? "is-active" : ""}
                  onClick={() => setTab(item)}
                >
                  {item}
                </button>
              ))}
            </nav>
            {detail.error ? (
              <p className="sim-error-message sim-detail-message">{detail.error}</p>
            ) : null}
            {message ? <p className="sim-error-message sim-detail-message">{message}</p> : null}

            <div className="sim-detail-content">
              {tab === "results" && detail.generatorSummary ? (
                <GeneratorResults
                  runId={detail.id}
                  summary={detail.generatorSummary}
                  selectedBucket={
                    selectedBucket || Object.keys(detail.generatorSummary.charts)[0] || ""
                  }
                  onBucketChange={setSelectedBucket}
                  onImport={bucket => void openImport(bucket)}
                />
              ) : null}
              {tab === "results" && detail.evaluatorSummary ? (
                <EvaluatorResults runId={detail.id} summary={detail.evaluatorSummary} />
              ) : null}
              {tab === "results" && !detail.generatorSummary && !detail.evaluatorSummary ? (
                <div className="sim-empty-detail">
                  <h3>No completed summary yet</h3>
                  <p>Progress and logs update while the native process runs.</p>
                </div>
              ) : null}
              {tab === "configuration" ? (
                <div className="sim-config-view">
                  <section>
                    <h4>Reproducibility</h4>
                    <div className="sim-detail-grid">
                      <div>
                        <span>Git commit</span>
                        <strong>{detail.reproducibility.gitCommit || "unknown"}</strong>
                      </div>
                      <div>
                        <span>Dirty worktree</span>
                        <strong>{detail.reproducibility.gitDirty ? "yes" : "no"}</strong>
                      </div>
                      <div>
                        <span>Native version</span>
                        <strong>{detail.reproducibility.simulatorVersion || "unknown"}</strong>
                      </div>
                      <div>
                        <span>Worker threads</span>
                        <strong>{detail.reproducibility.workerThreads || "default"}</strong>
                      </div>
                      <div>
                        <span>Platform</span>
                        <strong>{detail.reproducibility.machine?.platform || "unknown"}</strong>
                      </div>
                      <div>
                        <span>CPU</span>
                        <strong>{detail.reproducibility.machine?.cpu || "unknown"}</strong>
                      </div>
                    </div>
                  </section>
                  <section>
                    <h4>Normalized configuration</h4>
                    <pre>{JSON.stringify(detail.config, null, 2)}</pre>
                  </section>
                  {detail.strategy ? (
                    <section>
                      <h4>Immutable strategy package</h4>
                      <pre>{JSON.stringify(detail.strategy, null, 2)}</pre>
                    </section>
                  ) : null}
                  {detail.reproducibility.command ? (
                    <section>
                      <h4>Executed command</h4>
                      <pre>{detail.reproducibility.command.join(" ")}</pre>
                    </section>
                  ) : null}
                </div>
              ) : null}
              {tab === "artifacts" ? (
                <div className="sim-artifact-list">
                  {detail.artifacts.map(artifact => (
                    <a
                      key={artifact.key}
                      href={simulatorApi.artifactUrl(detail.id, artifact.relativePath)}
                    >
                      <span>{artifact.label}</span>
                      <small>
                        {artifact.mediaType} · {formatBytes(artifact.sizeBytes)}
                      </small>
                    </a>
                  ))}
                </div>
              ) : null}
              {tab === "logs" ? (
                <pre className="sim-log-view">
                  {detail.logs.join("\n") || "No process logs recorded."}
                </pre>
              ) : null}
            </div>
          </>
        ) : (
          <div className="sim-empty-detail">
            <h3>Select a run</h3>
            <p>Review live work, evidence, reproducibility metadata, and retained artifacts.</p>
          </div>
        )}
      </main>
      {importPackage ? (
        <ImportReview packageBody={importPackage} onClose={() => setImportPackage(null)} />
      ) : null}
    </div>
  );
}
