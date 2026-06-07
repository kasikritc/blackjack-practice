import { useEffect, useMemo, useState } from "react";
import type {
  GeneratorRunRequest,
  SimulatorPresetId,
  SimulatorPresetsResponse,
  SimulatorValidationResponse,
  StrategySimulationConfig
} from "@blackjack/shared";
import { useNavigate } from "react-router-dom";
import { simulatorApi } from "./api";
import { ArrayField, Field, NumberField } from "./FormControls";
import { formatBytes, formatCompactNumber } from "./format";
import { RulesEditor } from "./RulesEditor";

function cloneConfig(config: StrategySimulationConfig): StrategySimulationConfig {
  return structuredClone(config);
}

export function StrategyGeneratorPage() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<SimulatorPresetsResponse["generator"]>([]);
  const [presetId, setPresetId] = useState<SimulatorPresetId>("standard");
  const [config, setConfig] = useState<StrategySimulationConfig | null>(null);
  const [workerThreads, setWorkerThreads] = useState(0);
  const [expert, setExpert] = useState(false);
  const [validation, setValidation] = useState<SimulatorValidationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    simulatorApi
      .presets()
      .then(response => {
        setPresets(response.generator);
        const standard =
          response.generator.find(preset => preset.id === "standard") || response.generator[0];
        if (standard) {
          setPresetId(standard.id);
          setConfig(cloneConfig(standard.config));
        }
      })
      .catch(error =>
        setMessage(error instanceof Error ? error.message : "Could not load presets.")
      );
  }, []);

  const request = useMemo<GeneratorRunRequest | null>(() => {
    if (!config) return null;
    return {
      workflow: "generator",
      name: config.name,
      presetId,
      config,
      workerThreads: workerThreads || undefined
    };
  }, [config, presetId, workerThreads]);

  const choosePreset = (id: SimulatorPresetId) => {
    const preset = presets.find(item => item.id === id);
    if (!preset) return;
    setPresetId(id);
    setConfig(cloneConfig(preset.config));
    setValidation(null);
  };

  const patch = (values: Partial<StrategySimulationConfig>) => {
    setConfig(current => (current ? { ...current, ...values } : current));
    setValidation(null);
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
      setMessage(error instanceof Error ? error.message : "Could not queue the run.");
    } finally {
      setBusy(false);
    }
  };

  if (!config) {
    return (
      <section className="simulator-panel simulator-loading">Loading generator presets…</section>
    );
  }

  const bucketCount = config.trueCountBuckets.length * config.decksRemainingBuckets.length;

  return (
    <div className="sim-builder-layout">
      <main className="sim-builder-main">
        <section className="simulator-panel sim-builder-intro">
          <div>
            <p className="eyebrow">Decision optimization</p>
            <h2>Strategy Generator</h2>
            <p>
              Search every hard, soft, and pair cell with paired Monte Carlo rollouts, frozen-policy
              iterations, and explicit confidence gates.
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
            <small>Presets are fixed starting points; every field remains editable.</small>
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
                  {formatCompactNumber(preset.config.maxSamplesPerAction)} max samples/action
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="simulator-panel sim-section">
          <div className="sim-section-heading">
            <div>
              <span className="sim-step">2</span>
              <h3>Run identity and target buckets</h3>
            </div>
          </div>
          <div className="sim-form-grid sim-form-grid-3">
            <Field label="Run name">
              <input value={config.name} onChange={event => patch({ name: event.target.value })} />
            </Field>
            <Field label="Deterministic seed">
              <input value={config.seed} onChange={event => patch({ seed: event.target.value })} />
            </Field>
            <NumberField
              label="Worker threads"
              value={workerThreads}
              min={0}
              max={256}
              onChange={setWorkerThreads}
              hint="0 uses all available CPU cores."
            />
            <ArrayField
              label="True-count buckets"
              values={config.trueCountBuckets}
              integer
              onChange={trueCountBuckets => patch({ trueCountBuckets })}
              hint="Comma-separated rounded true counts."
            />
            <ArrayField
              label="Decks-remaining buckets"
              values={config.decksRemainingBuckets}
              onChange={decksRemainingBuckets => patch({ decksRemainingBuckets })}
              hint="Decision-point shoe depth in decks."
            />
            <Field label="True-count rounding">
              <select
                value={config.trueCountRounding}
                onChange={event =>
                  patch({
                    trueCountRounding: event.target
                      .value as StrategySimulationConfig["trueCountRounding"]
                  })
                }
              >
                <option value="nearest">Nearest integer</option>
                <option value="truncate">Truncate toward zero</option>
              </select>
            </Field>
          </div>
          <div className="sim-derived-strip">
            <span>
              <strong>{bucketCount}</strong> count/depth buckets
            </span>
            <span>
              <strong>{bucketCount * 370}</strong> chart cells per policy iteration
            </span>
          </div>
        </section>

        <section className="simulator-panel sim-section">
          <div className="sim-section-heading">
            <div>
              <span className="sim-step">3</span>
              <h3>Blackjack rules</h3>
            </div>
            <small>
              Native generation currently supports American hole-card games with dealer peek.
            </small>
          </div>
          <RulesEditor rules={config.rules} onChange={rules => patch({ rules })} />
        </section>

        <section className={`simulator-panel sim-section${expert ? "" : " sim-expert-collapsed"}`}>
          <div className="sim-section-heading">
            <div>
              <span className="sim-step">4</span>
              <h3>Sampling and convergence</h3>
            </div>
            {!expert ? <small>Enable Expert controls to edit these preset values.</small> : null}
          </div>
          {expert ? (
            <div className="sim-form-grid sim-form-grid-4">
              <NumberField
                label="Minimum samples/action"
                value={config.minSamplesPerAction}
                min={1}
                step={100}
                onChange={minSamplesPerAction => patch({ minSamplesPerAction })}
              />
              <NumberField
                label="Maximum samples/action"
                value={config.maxSamplesPerAction}
                min={1}
                step={100}
                onChange={maxSamplesPerAction => patch({ maxSamplesPerAction })}
              />
              <NumberField
                label="Batch size"
                value={config.batchSize}
                min={1}
                onChange={batchSize => patch({ batchSize })}
                hint="Must divide maximum samples."
              />
              <NumberField
                label="Reachable shoes/bucket"
                value={config.shoeSamplesPerBucket}
                min={1}
                onChange={shoeSamplesPerBucket => patch({ shoeSamplesPerBucket })}
              />
              <NumberField
                label="Policy iterations"
                value={config.maxPolicyIterations}
                min={1}
                onChange={maxPolicyIterations => patch({ maxPolicyIterations })}
              />
              <NumberField
                label="Minimum EV margin"
                value={config.minimumEvMargin}
                min={0}
                step={0.00001}
                onChange={minimumEvMargin => patch({ minimumEvMargin })}
              />
              <NumberField
                label="Confidence Z"
                value={config.confidenceZ}
                min={0.1}
                step={0.01}
                onChange={confidenceZ => patch({ confidenceZ })}
                hint="1.96 corresponds to a 95% interval."
              />
            </div>
          ) : (
            <div className="sim-summary-values">
              <span>
                {formatCompactNumber(config.minSamplesPerAction)}–
                {formatCompactNumber(config.maxSamplesPerAction)} samples/action
              </span>
              <span>{config.shoeSamplesPerBucket.toLocaleString()} reachable shoes/bucket</span>
              <span>{config.maxPolicyIterations} policy iterations</span>
              <span>
                Z {config.confidenceZ} · margin {config.minimumEvMargin}
              </span>
            </div>
          )}
        </section>
      </main>

      <aside className="sim-builder-sidebar">
        <section className="simulator-panel sim-launch-card">
          <p className="eyebrow">Preflight</p>
          <h3>Queue generator run</h3>
          <dl>
            <div>
              <dt>Preset</dt>
              <dd>{presets.find(item => item.id === presetId)?.name}</dd>
            </div>
            <div>
              <dt>Buckets</dt>
              <dd>{bucketCount}</dd>
            </div>
            <div>
              <dt>Max cell samples</dt>
              <dd>{formatCompactNumber(config.maxSamplesPerAction)}</dd>
            </div>
            {validation?.estimatedWorkUnits ? (
              <div>
                <dt>Estimated rollouts</dt>
                <dd>{formatCompactNumber(validation.estimatedWorkUnits)}</dd>
              </div>
            ) : null}
            {validation?.estimatedStorageBytes ? (
              <div>
                <dt>Estimated artifacts</dt>
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
          <button className="primary-button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Working…" : "Queue run"}
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
