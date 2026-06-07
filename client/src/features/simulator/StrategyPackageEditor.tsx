import type {
  EvaluationAction,
  SideDecision,
  StrategyCategory,
  StrategyCountDeviation,
  StrategyEvaluationPackage,
  StrategySideDecisionPolicy,
  ThresholdComparison
} from "@blackjack/shared";
import { Field, NumberField } from "./FormControls";
import { RulesEditor } from "./RulesEditor";

const DEALERS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
const ACTIONS: EvaluationAction[] = ["hit", "stand", "double", "split", "surrender"];
const ROWS: Record<StrategyCategory, Array<{ key: string; label: string }>> = {
  hard: Array.from({ length: 18 }, (_, index) => ({
    key: `h${index + 4}`,
    label: String(index + 4)
  })),
  soft: Array.from({ length: 9 }, (_, index) => ({
    key: `s${index + 13}`,
    label: `A,${index + 2}`
  })),
  pair: ["A", "10", "9", "8", "7", "6", "5", "4", "3", "2"].map(rank => ({
    key: `p${rank}`,
    label: `${rank},${rank}`
  }))
};

function clonePackage(value: StrategyEvaluationPackage): StrategyEvaluationPackage {
  return structuredClone(value);
}

function SidePolicyEditor({
  title,
  policy,
  onChange
}: {
  title: string;
  policy: StrategySideDecisionPolicy;
  onChange: (policy: StrategySideDecisionPolicy) => void;
}) {
  const patchDeviation = (
    index: number,
    values: Partial<StrategySideDecisionPolicy["deviations"][number]>
  ) => {
    const deviations = policy.deviations.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...values } : item
    );
    onChange({ ...policy, deviations });
  };
  return (
    <div className="sim-policy-editor">
      <div className="sim-policy-heading">
        <h4>{title}</h4>
        <Field label="Base decision">
          <select
            value={policy.base}
            onChange={event => onChange({ ...policy, base: event.target.value as SideDecision })}
          >
            <option value="decline">Decline</option>
            <option value="take">Take</option>
          </select>
        </Field>
      </div>
      <div className="sim-inline-table">
        {policy.deviations.map((deviation, index) => (
          <div
            className="sim-inline-row"
            key={`${deviation.comparison}:${deviation.trueCount}:${index}`}
          >
            <select
              value={deviation.comparison}
              onChange={event =>
                patchDeviation(index, { comparison: event.target.value as ThresholdComparison })
              }
            >
              <option value="atOrAbove">At or above</option>
              <option value="atOrBelow">At or below</option>
            </select>
            <input
              type="number"
              value={deviation.trueCount}
              onChange={event => patchDeviation(index, { trueCount: Number(event.target.value) })}
            />
            <select
              value={deviation.decision}
              onChange={event =>
                patchDeviation(index, { decision: event.target.value as SideDecision })
              }
            >
              <option value="take">Take</option>
              <option value="decline">Decline</option>
            </select>
            <button
              type="button"
              className="sim-row-remove"
              onClick={() =>
                onChange({
                  ...policy,
                  deviations: policy.deviations.filter((_, itemIndex) => itemIndex !== index)
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="sim-add-row"
        onClick={() =>
          onChange({
            ...policy,
            deviations: [
              ...policy.deviations,
              { comparison: "atOrAbove", trueCount: 3, decision: "take" }
            ]
          })
        }
      >
        + Add threshold
      </button>
    </div>
  );
}

export function StrategyPackageEditor({
  value,
  onChange
}: {
  value: StrategyEvaluationPackage;
  onChange: (value: StrategyEvaluationPackage) => void;
}) {
  const patch = (values: Partial<StrategyEvaluationPackage>) => onChange({ ...value, ...values });
  const patchChart = (
    category: StrategyCategory,
    row: string,
    dealer: string,
    action: EvaluationAction
  ) => {
    const next = clonePackage(value);
    next.chart[category][row][dealer] = action;
    if (!["double", "split", "surrender"].includes(action)) {
      delete next.fallbacks[category]?.[row]?.[dealer];
    } else {
      next.fallbacks[category] ||= {};
      next.fallbacks[category]![row] ||= {};
      next.fallbacks[category]![row][dealer] ||= action === "surrender" ? "hit" : "stand";
    }
    onChange(next);
  };
  const patchFallback = (
    category: StrategyCategory,
    row: string,
    dealer: string,
    fallback: "hit" | "stand"
  ) => {
    const next = clonePackage(value);
    next.fallbacks[category] ||= {};
    next.fallbacks[category]![row] ||= {};
    next.fallbacks[category]![row][dealer] = fallback;
    onChange(next);
  };
  const patchDeviation = (index: number, values: Partial<StrategyCountDeviation>) =>
    patch({
      deviations: value.deviations.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...values } : item
      )
    });

  return (
    <div className="sim-package-editor">
      <div className="sim-form-grid sim-form-grid-3">
        <Field label="Package ID">
          <input value={value.id} onChange={event => patch({ id: event.target.value })} />
        </Field>
        <Field label="Package name">
          <input value={value.name} onChange={event => patch({ name: event.target.value })} />
        </Field>
        <Field label="True-count rounding">
          <select
            value={value.trueCountRounding}
            onChange={event =>
              patch({
                trueCountRounding: event.target
                  .value as StrategyEvaluationPackage["trueCountRounding"]
              })
            }
          >
            <option value="nearest">Nearest integer</option>
            <option value="truncate">Truncate toward zero</option>
            <option value="floor">Floor</option>
          </select>
        </Field>
      </div>

      <details className="sim-editor-details">
        <summary>Blackjack rule profile</summary>
        <RulesEditor rules={value.rules} onChange={rules => patch({ rules })} />
      </details>

      <details className="sim-editor-details">
        <summary>Complete strategy chart and conditional fallbacks</summary>
        <p>
          Every opening action is explicit. Double, split, and surrender cells also expose the
          action used when the preferred action is unavailable.
        </p>
        <div className="sim-package-chart-stack">
          {(Object.keys(ROWS) as StrategyCategory[]).map(category => (
            <div className="sim-package-chart" key={category}>
              <h4>
                {category === "hard"
                  ? "Hard totals"
                  : category === "soft"
                    ? "Soft totals"
                    : "Pairs"}
              </h4>
              <div className="sim-package-table-wrap">
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
                    {ROWS[category].map(row => (
                      <tr key={row.key}>
                        <th>{row.label}</th>
                        {DEALERS.map(dealer => {
                          const action = value.chart[category][row.key]?.[
                            dealer
                          ] as EvaluationAction;
                          const needsFallback = ["double", "split", "surrender"].includes(action);
                          const fallback = value.fallbacks[category]?.[row.key]?.[dealer];
                          return (
                            <td key={dealer} className={`action-${action}`}>
                              <select
                                aria-label={`${category} ${row.label} versus ${dealer}`}
                                value={action}
                                onChange={event =>
                                  patchChart(
                                    category,
                                    row.key,
                                    dealer,
                                    event.target.value as EvaluationAction
                                  )
                                }
                              >
                                {ACTIONS.map(option => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              {needsFallback ? (
                                <select
                                  className="sim-fallback-select"
                                  aria-label={`Fallback for ${category} ${row.label} versus ${dealer}`}
                                  value={fallback || "hit"}
                                  onChange={event =>
                                    patchFallback(
                                      category,
                                      row.key,
                                      dealer,
                                      event.target.value as "hit" | "stand"
                                    )
                                  }
                                >
                                  <option value="hit">then hit</option>
                                  <option value="stand">then stand</option>
                                </select>
                              ) : null}
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
      </details>

      <details className="sim-editor-details" open>
        <summary>Play deviations</summary>
        <div className="sim-deviation-list">
          {value.deviations.map((deviation, index) => (
            <div
              className="sim-deviation-row"
              key={`${deviation.category}:${deviation.rowKey}:${deviation.dealerUpcard}:${index}`}
            >
              <select
                value={deviation.category}
                onChange={event =>
                  patchDeviation(index, { category: event.target.value as StrategyCategory })
                }
              >
                <option value="hard">Hard</option>
                <option value="soft">Soft</option>
                <option value="pair">Pair</option>
              </select>
              <input
                value={deviation.rowKey}
                onChange={event => patchDeviation(index, { rowKey: event.target.value })}
                aria-label="Row key"
              />
              <select
                value={deviation.dealerUpcard}
                onChange={event => patchDeviation(index, { dealerUpcard: event.target.value })}
              >
                {DEALERS.map(dealer => (
                  <option key={dealer}>{dealer}</option>
                ))}
              </select>
              <select
                value={deviation.comparison}
                onChange={event =>
                  patchDeviation(index, { comparison: event.target.value as ThresholdComparison })
                }
              >
                <option value="atOrAbove">At or above</option>
                <option value="atOrBelow">At or below</option>
              </select>
              <input
                type="number"
                value={deviation.trueCount}
                onChange={event => patchDeviation(index, { trueCount: Number(event.target.value) })}
                aria-label="True count"
              />
              <select
                value={deviation.action}
                onChange={event =>
                  patchDeviation(index, { action: event.target.value as EvaluationAction })
                }
              >
                {ACTIONS.map(action => (
                  <option key={action}>{action}</option>
                ))}
              </select>
              <select
                value={deviation.fallback || ""}
                onChange={event =>
                  patchDeviation(index, {
                    fallback: (event.target.value || undefined) as "hit" | "stand" | undefined
                  })
                }
              >
                <option value="">No fallback</option>
                <option value="hit">Fallback hit</option>
                <option value="stand">Fallback stand</option>
              </select>
              <button
                type="button"
                className="sim-row-remove"
                onClick={() =>
                  patch({
                    deviations: value.deviations.filter((_, itemIndex) => itemIndex !== index)
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="sim-add-row"
          onClick={() =>
            patch({
              deviations: [
                ...value.deviations,
                {
                  category: "hard",
                  rowKey: "h16",
                  dealerUpcard: "10",
                  comparison: "atOrAbove",
                  trueCount: 0,
                  action: "stand"
                }
              ]
            })
          }
        >
          + Add play deviation
        </button>
      </details>

      <div className="sim-side-policy-grid">
        <SidePolicyEditor
          title="Insurance policy"
          policy={value.insurance}
          onChange={insurance => patch({ insurance })}
        />
        <SidePolicyEditor
          title="Even-money policy"
          policy={value.evenMoney}
          onChange={evenMoney => patch({ evenMoney })}
        />
      </div>

      <details className="sim-editor-details" open>
        <summary>Betting ramp</summary>
        <div className="sim-ramp-grid">
          {value.bettingRamp.map((step, index) => (
            <div className="sim-ramp-step" key={`${step.atOrAbove}:${index}`}>
              <NumberField
                label="At or above TC"
                value={step.atOrAbove}
                onChange={atOrAbove =>
                  patch({
                    bettingRamp: value.bettingRamp.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, atOrAbove } : item
                    )
                  })
                }
              />
              <NumberField
                label="Wager units"
                value={step.units}
                min={0}
                step={0.25}
                onChange={units =>
                  patch({
                    bettingRamp: value.bettingRamp.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, units } : item
                    )
                  })
                }
              />
              <button
                type="button"
                className="sim-row-remove"
                onClick={() =>
                  patch({
                    bettingRamp: value.bettingRamp.filter((_, itemIndex) => itemIndex !== index)
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="sim-add-row"
          onClick={() => patch({ bettingRamp: [...value.bettingRamp, { atOrAbove: 1, units: 2 }] })}
        >
          + Add ramp step
        </button>
      </details>
    </div>
  );
}
