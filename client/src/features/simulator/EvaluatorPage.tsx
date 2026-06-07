import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type {
  EvaluatorRunRequest,
  SimulatorPresetId,
  SimulatorPresetsResponse,
  SimulatorStrategySource,
  SimulatorValidationResponse,
  StrategyEvaluationPackage,
  StrategyEvaluationRunConfig
} from "@blackjack/shared";
import { useNavigate } from "react-router-dom";
import { simulatorApi } from "./api";
import { ArrayField, Field, NumberField, ToggleField } from "./FormControls";
import { formatBytes, formatCompactNumber } from "./format";
import { StrategyPackageEditor } from "./StrategyPackageEditor";

function cloneConfig(config: StrategyEvaluationRunConfig): StrategyEvaluationRunConfig {
  return structuredClone(config);
}

export function EvaluatorPage() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<SimulatorPresetsResponse["evaluator"]>([]);
  const [sources, setSources] = useState<SimulatorStrategySource[]>([]);
  const [presetId, setPresetId] = useState<SimulatorPresetId>("standard");
  const [sourceId, setSourceId] = useState("");
  const [config, setConfig] = useState<StrategyEvaluationRunConfig | null>(null);
  const [strategyPackage, setStrategyPackage] = useState<StrategyEvaluationPackage | null>(null);
  const [workerThreads, setWorkerThreads] = useState(0);
  const [expert, setExpert] = useState(false);
  const [validation, setValidation] = useState<SimulatorValidationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([simulatorApi.presets(), simulatorApi.strategySources()])
      .then(([presetResponse, sourceResponse]) => {
        setPresets(presetResponse.evaluator);
        setSources(sourceResponse.sources);
        const standard =
          presetResponse.evaluator.find(preset => preset.id === "standard") ||
          presetResponse.evaluator[0];
        if (standard) {
          setPresetId(standard.id);
          setConfig(cloneConfig(standard.config));
        }
        const first = sourceResponse.sources[0];
        if (first) {
          setSourceId(first.id);
          setStrategyPackage(first.package ? structuredClone(first.package) : null);
          setConfig(current => (current ? { ...current, strategy: first.id } : current));
        }
      })
      .catch(error =>
        setMessage(error instanceof Error ? error.message : "Could not load evaluator inputs.")
      );
  }, []);

  const request = useMemo<EvaluatorRunRequest | null>(() => {
    if (!config) return null;
    return {
      workflow: "evaluator",
      name: config.name,
      presetId,
      config,
      strategyPackage: strategyPackage || undefined,
      workerThreads: workerThreads || undefined
    };
  }, [config, presetId, strategyPackage, workerThreads]);

  const patch = (values: Partial<StrategyEvaluationRunConfig>) => {
    setConfig(current => (current ? { ...current, ...values } : current));
    setValidation(null);
  };

  const choosePreset = (id: SimulatorPresetId) => {
    const preset = presets.find(item => item.id === id);
    if (!preset) return;
    setPresetId(id);
    setConfig({ ...cloneConfig(preset.config), strategy: sourceId || preset.config.strategy });
    setValidation(null);
  };

  const chooseSource = (id: string) => {
    const source = sources.find(item => item.id === id);
    setSourceId(id);
    setStrategyPackage(source?.package ? structuredClone(source.package) : null);
    patch({ strategy: id });
  };

  const uploadPackage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const packageBody = JSON.parse(await file.text()) as StrategyEvaluationPackage;
      setStrategyPackage(packageBody);
      const id = `uploaded:${file.name}`;
      setSourceId(id);
      setSources(current => [
        {
          id,
          kind: "uploaded",
          name: packageBody.name || file.name,
          description: file.name,
          package: packageBody
        },
        ...current.filter(source => source.id !== id)
      ]);
      patch({ strategy: id });
      setMessage("");
    } catch {
      setMessage("The selected file is not valid JSON.");
    }
  };

  const validate = async () => {
    if (!request) return null;
    setBusy(true);
    setMessage("");
    try {
      const result = await simulatorApi.validate(request);
      setValidation(result);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validation failed.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!request) return;
    setBusy(true);
    setMessage("");
    try {
      const result = validation || (await simulatorApi.validate(request));
      setValidation(result);
      if (!result.valid) return;
      const run = await simulatorApi.submit(request);
      navigate(`/simulator/runs?selected=${encodeURIComponent(run.id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not queue evaluation.");
    } finally {
      setBusy(false);
    }
  };

  if (!config)
    return (
      <section className="simulator-panel simulator-loading">Loading evaluator presets…</section>
    );
  const selectedSource = sources.find(source => source.id === sourceId);

  return (
    <div className="sim-builder-layout">
      <main className="sim-builder-main">
        <section className="simulator-panel sim-builder-intro">
          <div>
            <p className="eyebrow">Aggregate performance analysis</p>
            <h2>Performance Evaluator</h2>
            <p>
              Execute one complete strategy over deterministic independent paths to measure EV,
              house edge, variance, hourly return, drawdown, and finite-horizon risk of ruin.
            </p>
          </div>
          <label className="sim-expert-switch">
            <input
              type="checkbox"
              checked={expert}
              onChange={event => setExpert(event.target.checked)}
            />
            <span>Expert controls</span>
          </label>
        </section>

        <section className="simulator-panel sim-section">
          <div className="sim-section-heading">
            <div>
              <span className="sim-step">1</span>
              <h3>Choose a workload preset</h3>
            </div>
          </div>
          <div className="sim-preset-grid">
            {presets.map(preset => (
              <button
                type="button"
                key={preset.id}
                className={`sim-preset-card${presetId === preset.id ? " is-selected" : ""}`}
                onClick={() => choosePreset(preset.id)}
              >
                <strong>{preset.name}</strong>
                <span>{preset.description}</span>
                <small>
                  {formatCompactNumber(preset.config.rounds)} rounds · {preset.config.paths} paths
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="simulator-panel sim-section">
          <div className="sim-section-heading">
            <div>
              <span className="sim-step">2</span>
              <h3>Select and inspect a strategy</h3>
            </div>
            <small>
              Built-ins, saved charts, generated buckets, and uploaded strict packages are
              supported.
            </small>
          </div>
          <div className="sim-source-row">
            <Field label="Strategy source">
              <select value={sourceId} onChange={event => chooseSource(event.target.value)}>
                {sources.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.kind.replace("-", " ")} · {source.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="ghost-button sim-file-button">
              Upload package
              <input
                type="file"
                accept="application/json,.json"
                onChange={event => void uploadPackage(event)}
              />
            </label>
          </div>
          {selectedSource ? (
            <div className="sim-source-summary">
              <div>
                <span>Source</span>
                <strong>{selectedSource.name}</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{selectedSource.kind}</strong>
              </div>
              <div>
                <span>Package ID</span>
                <strong>{strategyPackage?.id || "Not loaded"}</strong>
              </div>
              <div>
                <span>Deviations</span>
                <strong>{strategyPackage?.deviations.length || 0}</strong>
              </div>
              <div>
                <span>Ramp steps</span>
                <strong>{strategyPackage?.bettingRamp.length || 0}</strong>
              </div>
            </div>
          ) : null}
          {expert && strategyPackage ? (
            <StrategyPackageEditor
              value={strategyPackage}
              onChange={value => {
                setStrategyPackage(value);
                setValidation(null);
              }}
            />
          ) : (
            <p className="sim-guided-note">
              Enable Expert controls to edit every chart cell, fallback, count deviation,
              side-decision threshold, rule, and betting-ramp step visually.
            </p>
          )}
        </section>

        <section className="simulator-panel sim-section">
          <div className="sim-section-heading">
            <div>
              <span className="sim-step">3</span>
              <h3>Run structure</h3>
            </div>
          </div>
          <div className="sim-form-grid sim-form-grid-4">
            <Field label="Run name">
              <input value={config.name} onChange={event => patch({ name: event.target.value })} />
            </Field>
            <Field label="Deterministic seed">
              <input value={config.seed} onChange={event => patch({ seed: event.target.value })} />
            </Field>
            <Field label="Shoe mode">
              <select
                value={config.mode}
                onChange={event =>
                  patch({ mode: event.target.value as StrategyEvaluationRunConfig["mode"] })
                }
              >
                <option value="continuous-shoe">Continuous shoe</option>
                <option value="fresh-round">Fresh shoe every round</option>
              </select>
            </Field>
            <NumberField
              label="Worker threads"
              value={workerThreads}
              min={0}
              max={256}
              onChange={setWorkerThreads}
              hint="0 uses all available CPU cores."
            />
            <NumberField
              label="Table rounds"
              value={config.rounds}
              min={1}
              step={1000}
              onChange={rounds => patch({ rounds })}
            />
            <NumberField
              label="Independent paths"
              value={config.paths}
              min={1}
              onChange={paths => patch({ paths })}
            />
            <NumberField
              label="Penetration %"
              value={config.penetrationPercent}
              min={0.1}
              max={99.9}
              step={0.1}
              onChange={penetrationPercent => patch({ penetrationPercent })}
            />
            <NumberField
              label="Observer seats"
              value={config.observerSeats}
              min={0}
              max={7}
              onChange={observerSeats => patch({ observerSeats })}
              hint="Used during zero-unit rounds."
            />
          </div>
        </section>

        <section className={`simulator-panel sim-section${expert ? "" : " sim-expert-collapsed"}`}>
          <div className="sim-section-heading">
            <div>
              <span className="sim-step">4</span>
              <h3>Statistics and retention</h3>
            </div>
            {!expert ? <small>Enable Expert controls to edit these preset values.</small> : null}
          </div>
          {expert ? (
            <>
              <div className="sim-form-grid sim-form-grid-4">
                <NumberField
                  label="Rounds per hour"
                  value={config.roundsPerHour}
                  min={0.1}
                  step={1}
                  onChange={roundsPerHour => patch({ roundsPerHour })}
                />
                <NumberField
                  label="Confidence Z"
                  value={config.confidenceZ}
                  min={0.1}
                  step={0.01}
                  onChange={confidenceZ => patch({ confidenceZ })}
                />
                <ArrayField
                  label="Risk bankroll units"
                  values={config.riskBankrollUnits}
                  onChange={riskBankrollUnits => patch({ riskBankrollUnits })}
                />
                <Field label="Retention mode">
                  <select
                    value={config.retention.mode}
                    onChange={event =>
                      patch({
                        retention: {
                          ...config.retention,
                          mode: event.target
                            .value as StrategyEvaluationRunConfig["retention"]["mode"]
                        }
                      })
                    }
                  >
                    <option value="aggregate">Aggregate only</option>
                    <option value="sampled">Sampled raw rounds</option>
                    <option value="full">Full raw rounds</option>
                  </select>
                </Field>
                <NumberField
                  label="Sample every N rounds"
                  value={config.retention.sampleEvery}
                  min={1}
                  onChange={sampleEvery =>
                    patch({ retention: { ...config.retention, sampleEvery } })
                  }
                />
              </div>
              <div className="sim-retention-warning">
                <ToggleField
                  label="Acknowledge large full-retention output"
                  checked={config.retention.acknowledgeLargeOutput}
                  onChange={acknowledgeLargeOutput =>
                    patch({ retention: { ...config.retention, acknowledgeLargeOutput } })
                  }
                  hint="Required for full raw output above ten million rounds."
                />
              </div>
            </>
          ) : (
            <div className="sim-summary-values">
              <span>{config.roundsPerHour} rounds/hour</span>
              <span>Z {config.confidenceZ}</span>
              <span>{config.riskBankrollUnits.length} bankroll thresholds</span>
              <span>{config.retention.mode} retention</span>
            </div>
          )}
        </section>
      </main>

      <aside className="sim-builder-sidebar">
        <section className="simulator-panel sim-launch-card">
          <p className="eyebrow">Preflight</p>
          <h3>Queue evaluation</h3>
          <dl>
            <div>
              <dt>Preset</dt>
              <dd>{presets.find(item => item.id === presetId)?.name}</dd>
            </div>
            <div>
              <dt>Strategy</dt>
              <dd>{strategyPackage?.name || config.strategy}</dd>
            </div>
            <div>
              <dt>Rounds</dt>
              <dd>{formatCompactNumber(config.rounds)}</dd>
            </div>
            <div>
              <dt>Paths</dt>
              <dd>{config.paths.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{config.mode}</dd>
            </div>
            <div>
              <dt>Retention</dt>
              <dd>{config.retention.mode}</dd>
            </div>
            {validation?.estimatedStorageBytes ? (
              <div>
                <dt>Estimated storage</dt>
                <dd>{formatBytes(validation.estimatedStorageBytes)}</dd>
              </div>
            ) : null}
          </dl>
          {validation ? (
            <div
              className={`sim-validation-summary${validation.valid ? " is-valid" : " is-invalid"}`}
            >
              <strong>
                {validation.valid ? "Configuration valid" : "Configuration needs attention"}
              </strong>
              {validation.issues.map(issue => (
                <span key={`${issue.path}:${issue.message}`}>
                  {issue.path}: {issue.message}
                </span>
              ))}
            </div>
          ) : null}
          {message ? <p className="sim-error-message">{message}</p> : null}
          <button className="ghost-button" disabled={busy} onClick={() => void validate()}>
            Validate configuration
          </button>
          <button
            className="primary-button"
            disabled={busy || !strategyPackage}
            onClick={() => void submit()}
          >
            {busy ? "Working…" : "Queue evaluation"}
          </button>
          {validation?.equivalentCommand ? (
            <details className="sim-command-preview">
              <summary>Equivalent CLI command</summary>
              <code>{validation.equivalentCommand.join(" ")}</code>
            </details>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
