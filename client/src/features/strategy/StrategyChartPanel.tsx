import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type {
  StrategyAnalyticsMetric,
  StrategyAnalyticsSummary,
  StrategyData
} from "@blackjack/shared";
import { Drawer } from "../../components/Drawer";
import { api } from "../../lib/api";
import { formatMs, formatPercent } from "../../lib/format";
import {
  STRATEGY_ACTION_ABBREVIATIONS,
  STRATEGY_ACTION_LABELS,
  STRATEGY_ACTIONS_ORDER,
  STRATEGY_DEALERS,
  STRATEGY_FALLBACK_ACTIONS_ORDER,
  cloneCriteria,
  defaultStrategyCriteria,
  getStrategyCellAction,
  getStrategyViewCellAction,
  isStrategyCellIncluded,
  isStrategyRowIncluded,
  parseStrategyCellId,
  strategyCellId,
  strategyChartSections,
  strategyFallbackActionRequired,
  toggleArrayValue,
  type StrategyChartView,
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
  onChartCellChange: (
    category: string,
    rowKey: string,
    dealer: string,
    action: string,
    target: StrategyChartView
  ) => void;
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
  const [chartView, setChartView] = useState<StrategyChartView>("opening");
  const [analyticsMode, setAnalyticsMode] = useState(false);
  const [analytics, setAnalytics] = useState<StrategyAnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  useEffect(() => {
    setChartName(currentChart?.name ?? "");
    setEditingCell(null);
    setCellAction("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, chartView]);

  useEffect(() => {
    if (mode === "edit") setAnalyticsMode(false);
  }, [mode]);

  const refreshAnalytics = useCallback(() => {
    if (!open) return;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    api
      .strategyAnalyticsSummary()
      .then(setAnalytics)
      .catch(error => {
        setAnalytics(null);
        setAnalyticsError(error instanceof Error ? error.message : "Could not load analytics.");
      })
      .finally(() => setAnalyticsLoading(false));
  }, [open]);

  useEffect(() => {
    if (open && mode === "review") refreshAnalytics();
  }, [open, mode, refreshAnalytics]);

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

  const fallbackEditable = (category: string, rowKey: string, dealer: string) =>
    strategyFallbackActionRequired(
      category,
      getStrategyCellAction(currentChart?.chart, category, rowKey, dealer)
    );

  const analyticsCells = new Map((analytics?.cells ?? []).map(metric => [metric.key, metric]));
  const analyticsRows = new Map((analytics?.rows ?? []).map(metric => [metric.key, metric]));
  const analyticsDealers = new Map(
    (analytics?.dealerUpcards ?? []).map(metric => [metric.dealerUpcard ?? metric.key, metric])
  );
  const analyticsCategories = new Map(
    (analytics?.categories ?? []).map(metric => [metric.category ?? metric.key, metric])
  );

  const onCellClick = (category: string, rowKey: string, dealer: string) => {
    if (analyticsMode) return;
    if (chartView === "fallback" && !fallbackEditable(category, rowKey, dealer)) return;
    const id = strategyCellId(category, rowKey, dealer);
    setEditingCell(id);
    setCellAction(
      getStrategyViewCellAction(currentChart?.chart, chartView, category, rowKey, dealer) || ""
    );
    if (chartView === "opening") toggleCell(category, rowKey, dealer);
  };

  const onCellActionChange = (action: string) => {
    setCellAction(action);
    if (!editingCell || !action) return;
    const cell = parseStrategyCellId(editingCell);
    onChartCellChange(cell.category, cell.rowKey, cell.dealer, action, chartView);
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

  const resetAnalytics = async () => {
    if (
      !window.confirm("Reset only Basic Strategy analytics? Other drill analytics stay intact.")
    ) {
      return;
    }
    try {
      await api.resetStrategyAnalytics();
      await api.strategyAnalyticsSummary().then(setAnalytics);
      onFeedback("Basic strategy analytics reset.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Could not reset strategy analytics.");
    }
  };

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
    const metric = analyticsCategories.get(category);
    const included = criteria.categories.includes(category as never) && !cellsLocked;
    return (
      <button
        type="button"
        className={`strategy-row-toggle${included && !analyticsMode ? " is-included" : ""}${analyticsMode ? " is-analytics-header" : ""}`}
        onClick={() => (analyticsMode ? undefined : toggleCategory(category))}
      >
        <span>{label}</span>
        {analyticsMode ? <MetricTiny metric={metric} /> : null}
      </button>
    );
  }

  function DealerHeader({ dealer }: { dealer: string }) {
    const metric = analyticsDealers.get(dealer);
    const included = criteria.dealerUpcards.includes(dealer) && !cellsLocked;
    return (
      <th>
        <button
          type="button"
          className={`strategy-column-toggle${included && !analyticsMode ? " is-included" : ""}${analyticsMode ? " is-analytics-header" : ""}`}
          onClick={() => (analyticsMode ? undefined : toggleDealer(dealer))}
        >
          <span>{dealer}</span>
          {analyticsMode ? <MetricTiny metric={metric} /> : null}
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
    const metric = analyticsCells.get(strategyCellId(category, rowKey, dealer));
    const action = getStrategyViewCellAction(
      currentChart?.chart,
      chartView,
      category,
      rowKey,
      dealer
    );
    const primaryAction = getStrategyCellAction(currentChart?.chart, category, rowKey, dealer);
    const editableFallback = fallbackEditable(category, rowKey, dealer);
    const included = isStrategyCellIncluded(criteria, category, rowKey, dealer);
    const label =
      (action && STRATEGY_ACTION_ABBREVIATIONS[action]) ||
      (chartView === "fallback" && editableFallback ? "·" : "-");
    const cls = analyticsMode
      ? "strategy-cell is-analytics-cell"
      : `strategy-cell${action ? ` action-${action}` : ""}${included ? " is-included" : " is-excluded"}${chartView === "fallback" && editableFallback ? " is-fallback-needed" : ""}${chartView === "fallback" && !editableFallback ? " is-fallback-disabled" : ""}`;
    const title = analyticsMode
      ? `${metric?.label ?? "No attempts"}: ${metric ? `${formatPercent(metric.accuracy)}%` : "no data"}`
      : chartView === "fallback"
        ? editableFallback
          ? `${(action && STRATEGY_ACTION_LABELS[action]) || "Unset"} fallback for ${STRATEGY_ACTION_LABELS[primaryAction || ""] || primaryAction}`
          : "No after-hit fallback needed for this cell"
        : `${(action && STRATEGY_ACTION_LABELS[action]) || action || "Unset"} - ${
            included ? "Included in drill" : "Excluded from drill"
          }`;
    return (
      <td>
        <button
          type="button"
          className={cls}
          title={title}
          style={analyticsMode ? analyticsCellStyle(metric) : undefined}
          disabled={!analyticsMode && chartView === "fallback" && !editableFallback}
          onClick={() => onCellClick(category, rowKey, dealer)}
        >
          {analyticsMode ? <MetricCell metric={metric} /> : label}
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
    const metric = analyticsRows.get(`${category}:${rowKey}`);
    const included = isStrategyRowIncluded(criteria, category, rowKey);
    return (
      <th>
        <button
          type="button"
          className={`strategy-row-toggle${included && !analyticsMode ? " is-included" : ""}${analyticsMode ? " is-analytics-header" : ""}`}
          onClick={() => (analyticsMode ? undefined : toggleRow(category, rowKey))}
        >
          <span>{label}</span>
          {analyticsMode ? <MetricTiny metric={metric} /> : null}
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
        <div className="strategy-view-toggle" role="group" aria-label="Strategy chart view">
          <button
            type="button"
            className={!analyticsMode && chartView === "opening" ? "is-active" : ""}
            onClick={() => {
              setAnalyticsMode(false);
              setChartView("opening");
            }}
          >
            Opening hand
          </button>
          <button
            type="button"
            className={!analyticsMode && chartView === "fallback" ? "is-active" : ""}
            onClick={() => {
              setAnalyticsMode(false);
              setChartView("fallback");
            }}
          >
            After hit fallback
          </button>
          {mode === "review" ? (
            <button
              type="button"
              className={analyticsMode ? "is-active" : ""}
              onClick={() => setAnalyticsMode(true)}
            >
              Analytics
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setAnalyticsMode(false);
            setMode("edit");
          }}
        >
          Edit chart
        </button>
      </section>

      {analyticsMode ? (
        <StrategyAnalyticsTools
          analytics={analytics}
          loading={analyticsLoading}
          error={analyticsError}
          onRefresh={refreshAnalytics}
          onReset={() => void resetAnalytics()}
        />
      ) : (
        <>
          <section className="strategy-chart-tools" aria-label="Strategy chart tools">
            <label>
              Chart name
              <input type="text" value={chartName} onChange={e => setChartName(e.target.value)} />
            </label>
            <label>
              Cell action
              <select
                value={cellAction}
                disabled={!editingCell}
                onChange={e => onCellActionChange(e.target.value)}
              >
                <option value="">Select a cell</option>
                {(chartView === "fallback"
                  ? STRATEGY_FALLBACK_ACTIONS_ORDER
                  : STRATEGY_ACTIONS_ORDER
                ).map(action => (
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
        </>
      )}

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
              {analyticsMode ? (
                <StrategyAnalyticsInsights analytics={analytics} />
              ) : (
                <>
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
                    <h3>{chartView === "fallback" ? "Fallbacks" : "Practice Include"}</h3>
                    <p>
                      {chartView === "fallback"
                        ? "Dot cells need an after-hit answer. Select one, choose Hit or Stand, then save the chart."
                        : "Crossed-out cells are excluded from the drill. Click rows, columns, sections, or cells to adjust the current subset."}
                    </p>
                  </section>
                </>
              )}
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

function mix(start: number, end: number, weight: number): number {
  return Math.round(start + (end - start) * weight);
}

function analyticsCellStyle(metric: StrategyAnalyticsMetric | undefined): CSSProperties {
  if (!metric?.attempts) return {};
  const accuracy = Math.max(0, Math.min(100, metric.accuracy));
  const red = [228, 95, 95];
  const gold = [217, 180, 90];
  const green = [103, 213, 138];
  const left = accuracy < 50;
  const from = left ? red : gold;
  const to = left ? gold : green;
  const weight = left ? accuracy / 50 : (accuracy - 50) / 50;
  const [r, g, b] = from.map((value, index) => mix(value, to[index], weight));
  return {
    background: `rgba(${r}, ${g}, ${b}, ${0.18 + accuracy / 420})`,
    color: accuracy >= 65 ? "#e8fff0" : accuracy >= 40 ? "#fff3ca" : "#ffe1e1"
  };
}

function MetricCell({ metric }: { metric: StrategyAnalyticsMetric | undefined }) {
  if (!metric?.attempts) {
    return (
      <span className="strategy-analytics-cell-content">
        <strong>—</strong>
        <small>0 / 0</small>
      </span>
    );
  }
  return (
    <span className="strategy-analytics-cell-content">
      <strong>{formatPercent(metric.accuracy)}%</strong>
      <small>
        {metric.correct} / {metric.attempts}
      </small>
    </span>
  );
}

function MetricTiny({ metric }: { metric: StrategyAnalyticsMetric | undefined }) {
  if (!metric?.attempts) return <small className="strategy-analytics-tiny">0 / 0</small>;
  return (
    <small className="strategy-analytics-tiny">
      {formatPercent(metric.accuracy)}% · {metric.correct}/{metric.attempts}
    </small>
  );
}

function MetricPill({ metric }: { metric: StrategyAnalyticsMetric }) {
  return (
    <span className="strategy-analytics-pill">
      <strong>{metric.label}</strong>
      <span>
        {formatPercent(metric.accuracy)}% · {metric.correct}/{metric.attempts}
      </span>
    </span>
  );
}

function StrategyAnalyticsTools({
  analytics,
  loading,
  error,
  onRefresh,
  onReset
}: {
  analytics: StrategyAnalyticsSummary | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const totals = analytics?.totals;
  return (
    <section
      className="strategy-chart-tools strategy-analytics-tools"
      aria-label="Strategy analytics tools"
    >
      <div className="strategy-analytics-total">
        <span>Overall accuracy</span>
        <strong>{totals?.attempts ? `${formatPercent(totals.accuracy)}%` : "—"}</strong>
        <small>
          {totals?.correct ?? 0} / {totals?.attempts ?? 0} decisions · median{" "}
          {formatMs(totals?.medianResponse ?? 0)}
        </small>
      </div>
      <p>
        {error ||
          (loading
            ? "Loading analytics…"
            : "Cell, row, column, and category accuracy use all tracked Basic Strategy decisions.")}
      </p>
      <button type="button" className="ghost-button" onClick={onRefresh} disabled={loading}>
        Refresh
      </button>
      <button type="button" className="ghost-button is-off" onClick={onReset}>
        Reset strategy analytics
      </button>
    </section>
  );
}

function InsightList({ title, rows }: { title: string; rows: StrategyAnalyticsMetric[] }) {
  return (
    <div className="strategy-analytics-insight-list">
      <h4>{title}</h4>
      {rows.length ? (
        rows.map(metric => <MetricPill metric={metric} key={metric.key} />)
      ) : (
        <p className="empty-state">No data</p>
      )}
    </div>
  );
}

function StrategyAnalyticsInsights({ analytics }: { analytics: StrategyAnalyticsSummary | null }) {
  return (
    <section className="strategy-analytics-insights">
      <h3>Strengths</h3>
      <InsightList title="Cells" rows={analytics?.strengths.cells ?? []} />
      <InsightList title="Rows" rows={analytics?.strengths.rows ?? []} />
      <InsightList title="Dealer columns" rows={analytics?.strengths.dealerUpcards ?? []} />
      <InsightList title="Categories" rows={analytics?.strengths.categories ?? []} />
      <h3>Weaknesses</h3>
      <InsightList title="Cells" rows={analytics?.weaknesses.cells ?? []} />
      <InsightList title="Rows" rows={analytics?.weaknesses.rows ?? []} />
      <InsightList title="Dealer columns" rows={analytics?.weaknesses.dealerUpcards ?? []} />
      <InsightList title="Categories" rows={analytics?.weaknesses.categories ?? []} />
    </section>
  );
}
