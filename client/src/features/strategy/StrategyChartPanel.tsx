import { useEffect, useState } from "react";
import type { StrategyData } from "@blackjack/shared";
import { Drawer } from "../../components/Drawer";
import { api } from "../../lib/api";
import {
  STRATEGY_ACTION_ABBREVIATIONS,
  STRATEGY_ACTION_LABELS,
  STRATEGY_ACTIONS_ORDER,
  STRATEGY_DEALERS,
  cloneCriteria,
  defaultStrategyCriteria,
  getStrategyCellAction,
  isStrategyCellIncluded,
  isStrategyRowIncluded,
  parseStrategyCellId,
  strategyCellId,
  strategyChartSections,
  toggleArrayValue,
  type StrategyCriteria
} from "./strategyLogic";

interface Props {
  open: boolean;
  mode: "review" | "edit";
  setMode: (mode: "review" | "edit") => void;
  onClose: () => void;
  data: StrategyData;
  profileId: number | null;
  chartId: number | null;
  subsetId: number | null;
  criteria: StrategyCriteria;
  onCriteriaChange: (criteria: StrategyCriteria) => void;
  onSelectChart: (id: number) => void;
  onSelectSubset: (id: number) => void;
  onChartCellChange: (category: string, rowKey: string, dealer: string, action: string) => void;
  onDataChange: (data: StrategyData, sel?: { chartId?: number; subsetId?: number }) => void;
  onFeedback: (msg: string) => void;
}

export function StrategyChartPanel({
  open,
  mode,
  setMode,
  onClose,
  data,
  profileId,
  chartId,
  subsetId,
  criteria,
  onCriteriaChange,
  onSelectChart,
  onSelectSubset,
  onChartCellChange,
  onDataChange,
  onFeedback
}: Props) {
  const currentChart = data.charts.find(c => c.id === chartId) || null;
  const charts = data.charts.filter(c => c.ruleProfileId === profileId);
  const subsets = data.subsets.filter(s => s.chartId === chartId || s.isDefault);

  const [chartName, setChartName] = useState(currentChart?.name ?? "");
  const [subsetName, setSubsetName] = useState("");
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [cellAction, setCellAction] = useState("");

  useEffect(() => {
    setChartName(currentChart?.name ?? "");
    setEditingCell(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId]);

  // --- criteria (live drill subset) mutations ---
  const updateCriteria = (next: StrategyCriteria) => onCriteriaChange(next);

  const toggleCategory = (category: string) =>
    updateCriteria({
      ...criteria,
      categories: toggleArrayValue(criteria.categories, category as never),
      cells: []
    });
  const toggleDealer = (dealer: string) =>
    updateCriteria({
      ...criteria,
      dealerUpcards: toggleArrayValue(criteria.dealerUpcards, dealer),
      cells: []
    });
  const toggleRow = (category: string, rowKey: string) =>
    updateCriteria({
      ...criteria,
      rows: toggleArrayValue(criteria.rows, `${category}:${rowKey}`),
      cells: []
    });
  const toggleCell = (category: string, rowKey: string, dealer: string) =>
    updateCriteria({
      ...criteria,
      cells: toggleArrayValue(criteria.cells, strategyCellId(category, rowKey, dealer))
    });

  const onCellClick = (category: string, rowKey: string, dealer: string) => {
    const id = strategyCellId(category, rowKey, dealer);
    setEditingCell(id);
    setCellAction(getStrategyCellAction(currentChart?.chart, category, rowKey, dealer) || "");
    toggleCell(category, rowKey, dealer);
  };

  const onCellActionChange = (action: string) => {
    setCellAction(action);
    if (!editingCell) return;
    const cell = parseStrategyCellId(editingCell);
    onChartCellChange(cell.category, cell.rowKey, cell.dealer, action);
  };

  // --- persistence ---
  const saveChart = async () => {
    if (!currentChart) return;
    try {
      const result = await api.updateChart(currentChart.id, {
        name: chartName.trim() || currentChart.name,
        chart: currentChart.chart,
        ruleProfileId: currentChart.ruleProfileId
      });
      onDataChange(result, { chartId: currentChart.id });
      onFeedback("Strategy chart saved.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Could not save chart.");
    }
  };

  const cloneChart = async () => {
    if (!currentChart || profileId == null) return;
    try {
      const result = await api.createChart({
        ruleProfileId: profileId,
        cloneFromChartId: currentChart.id,
        name: `${currentChart.name} copy`
      });
      onDataChange(result, { chartId: result.id ?? undefined });
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Could not clone chart.");
    }
  };

  const clearHighlights = () => onCriteriaChange(defaultStrategyCriteria());

  const saveSubset = async () => {
    if (!currentChart) return;
    try {
      const result = await api.createSubset({
        chartId: currentChart.id,
        name: subsetName.trim() || "Custom subset",
        criteria: cloneCriteria(criteria)
      });
      onDataChange(result, { subsetId: result.id ?? undefined });
      setSubsetName("");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Could not save subset.");
    }
  };

  const sections = strategyChartSections();
  const cellsLocked = criteria.cells.length > 0;

  function CategoryToggle({ category, label }: { category: string; label: string }) {
    const included = criteria.categories.includes(category as never) && !cellsLocked;
    return (
      <button
        type="button"
        className={`strategy-row-toggle${included ? " is-included" : ""}`}
        onClick={() => toggleCategory(category)}
      >
        {label}
      </button>
    );
  }

  function DealerHeader({ dealer }: { dealer: string }) {
    const included = criteria.dealerUpcards.includes(dealer) && !cellsLocked;
    return (
      <th>
        <button
          type="button"
          className={`strategy-column-toggle${included ? " is-included" : ""}`}
          onClick={() => toggleDealer(dealer)}
        >
          {dealer}
        </button>
      </th>
    );
  }

  function Cell({
    category,
    rowKey,
    dealer
  }: {
    category: string;
    rowKey: string;
    dealer: string;
  }) {
    const action = getStrategyCellAction(currentChart?.chart, category, rowKey, dealer);
    const included = isStrategyCellIncluded(criteria, category, rowKey, dealer);
    const label = (action && STRATEGY_ACTION_ABBREVIATIONS[action]) || action || "-";
    const cls = `strategy-cell${action ? ` action-${action}` : ""}${included ? " is-included" : " is-excluded"}`;
    const title = `${(action && STRATEGY_ACTION_LABELS[action]) || action || "Unset"} - ${
      included ? "Included in drill" : "Excluded from drill"
    }`;
    return (
      <td>
        <button
          type="button"
          className={cls}
          title={title}
          onClick={() => onCellClick(category, rowKey, dealer)}
        >
          {label}
        </button>
      </td>
    );
  }

  function RowToggle({
    category,
    rowKey,
    label
  }: {
    category: string;
    rowKey: string;
    label: string;
  }) {
    const included = isStrategyRowIncluded(criteria, category, rowKey);
    return (
      <th>
        <button
          type="button"
          className={`strategy-row-toggle${included ? " is-included" : ""}`}
          onClick={() => toggleRow(category, rowKey)}
        >
          {label}
        </button>
      </th>
    );
  }

  function ChartTable({
    section,
    compact
  }: {
    section: [string, string, Array<{ key: string; label: string }>];
    compact: boolean;
  }) {
    const [category, title, rows] = section;
    return (
      <div className={`strategy-table-wrap${compact ? " compact-strategy-table-wrap" : ""}`}>
        <table className={`strategy-table${compact ? " compact-strategy-table" : ""}`}>
          <thead>
            {compact ? (
              <tr className="strategy-section-row">
                <th colSpan={STRATEGY_DEALERS.length + 1}>
                  <CategoryToggle category={category} label={title} />
                </th>
              </tr>
            ) : null}
            <tr>
              <th>Hand</th>
              {STRATEGY_DEALERS.map(dealer => (
                <DealerHeader dealer={dealer} key={dealer} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <RowToggle category={category} rowKey={row.key} label={row.label} />
                {STRATEGY_DEALERS.map(dealer => (
                  <Cell category={category} rowKey={row.key} dealer={dealer} key={dealer} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const hard = sections.find(s => s[0] === "hard")!;
  const soft = sections.find(s => s[0] === "soft")!;
  const pair = sections.find(s => s[0] === "pair")!;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      className="drawer-wide"
      eyebrow="Basic Strategy"
      title={mode === "edit" ? "Edit Strategy" : "Review Strategy"}
    >
      <section
        className="strategy-chart-tools strategy-review-selects"
        aria-label="Strategy drill setup"
      >
        <label>
          Strategy
          <select value={chartId ?? ""} onChange={e => onSelectChart(Number(e.target.value))}>
            {charts.length ? (
              charts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            ) : (
              <option value="">No chart for this profile</option>
            )}
          </select>
        </label>
        <label>
          Drill subset
          <select value={subsetId ?? ""} onChange={e => onSelectSubset(Number(e.target.value))}>
            {subsets.length ? (
              subsets.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            ) : (
              <option value="">No subsets</option>
            )}
          </select>
        </label>
        <button type="button" className="ghost-button" onClick={() => setMode("edit")}>
          Edit chart
        </button>
      </section>

      <section className="strategy-chart-tools" aria-label="Strategy chart tools">
        <label>
          Chart name
          <input type="text" value={chartName} onChange={e => setChartName(e.target.value)} />
        </label>
        <label>
          Cell action
          <select value={cellAction} onChange={e => onCellActionChange(e.target.value)}>
            {STRATEGY_ACTIONS_ORDER.map(action => (
              <option key={action} value={action}>
                {STRATEGY_ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost-button" onClick={() => void cloneChart()}>
          Clone to current rules
        </button>
        <button type="button" className="primary-button" onClick={() => void saveChart()}>
          Save chart
        </button>
      </section>

      <section className="strategy-chart-tools" aria-label="Subset tools">
        <label>
          Subset name
          <input
            type="text"
            placeholder="Custom subset"
            value={subsetName}
            onChange={e => setSubsetName(e.target.value)}
          />
        </label>
        <button type="button" className="ghost-button" onClick={clearHighlights}>
          Clear highlights
        </button>
        <button type="button" className="ghost-button" onClick={() => void saveSubset()}>
          Save highlighted subset
        </button>
      </section>

      <div className={`strategy-chart-editor${mode === "review" ? " is-compact-review" : ""}`}>
        {!currentChart ? (
          <p className="empty-state">No strategy chart loaded.</p>
        ) : mode === "review" ? (
          <>
            <div className="strategy-review-layout">
              <div className="strategy-review-main-chart">
                <ChartTable section={hard} compact />
              </div>
              <div className="strategy-review-chart-stack">
                <ChartTable section={soft} compact />
                <ChartTable section={pair} compact />
              </div>
            </div>
            <div className="strategy-review-footer">
              <section>
                <h3>Actions</h3>
                <div className="strategy-action-legend" aria-label="Strategy abbreviations">
                  {STRATEGY_ACTIONS_ORDER.map(action => (
                    <span className={`strategy-legend-chip action-${action}`} key={action}>
                      <strong>{STRATEGY_ACTION_ABBREVIATIONS[action]}</strong>
                      {STRATEGY_ACTION_LABELS[action]}
                    </span>
                  ))}
                </div>
              </section>
              <section>
                <h3>Practice Include</h3>
                <p>
                  Crossed-out cells are excluded from the drill. Click rows, columns, sections, or
                  cells to adjust the current subset.
                </p>
              </section>
            </div>
          </>
        ) : (
          sections.map(section => (
            <section className="strategy-chart-section" key={section[0]}>
              <div className="section-title">
                <h3>{section[1]}</h3>
                <CategoryToggle
                  category={section[0]}
                  label={
                    criteria.categories.includes(section[0] as never) && !cellsLocked
                      ? "Included"
                      : "Include"
                  }
                />
              </div>
              <ChartTable section={section} compact={false} />
            </section>
          ))
        )}
      </div>
    </Drawer>
  );
}
