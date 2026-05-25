import { useEffect, useState } from "react";
import type { StrategyData, StrategyRules } from "@blackjack/shared";
import { Drawer } from "../../components/Drawer";
import { api } from "../../lib/api";
import {
  formatStrategyRuleName,
  normalizedStrategyRules,
  strategyRuleSignature
} from "./strategyLogic";

interface Props {
  open: boolean;
  onClose: () => void;
  data: StrategyData;
  profileId: number | null;
  chartId: number | null;
  onSelectProfile: (id: number) => void;
  onDataChange: (data: StrategyData, sel?: { profileId?: number; chartId?: number }) => void;
  onFeedback: (msg: string) => void;
}

interface RulesForm extends StrategyRules {
  customJson: string;
}

function toForm(rules?: Partial<StrategyRules>): RulesForm {
  const r = normalizedStrategyRules(rules ?? {});
  return { ...r, customJson: JSON.stringify(r.customRules || {}, null, 2) };
}

export function StrategyRulesPanel({
  open,
  onClose,
  data,
  profileId,
  chartId,
  onSelectProfile,
  onDataChange,
  onFeedback
}: Props) {
  const profile = data.profiles.find(p => p.id === profileId) || null;
  const [form, setForm] = useState<RulesForm>(() => toForm(profile?.rules));

  // Re-sync the form whenever the panel opens or the selected profile changes.
  useEffect(() => {
    if (open) setForm(toForm(profile?.rules));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profileId]);

  function set<K extends keyof RulesForm>(key: K, value: RulesForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function collectRules(): { name: string; rules: StrategyRules } {
    let customRules: Record<string, unknown> = {};
    if (form.customJson.trim()) {
      try {
        customRules = JSON.parse(form.customJson);
      } catch {
        throw new Error("Custom rule notes must be valid JSON.");
      }
    }
    const rules: StrategyRules = {
      decks: Number(form.decks),
      dealerHitsSoft17: form.dealerHitsSoft17,
      dealerPeek: form.dealerPeek,
      dealerHoleCard: form.dealerHoleCard,
      blackjackPayout: form.blackjackPayout,
      doubleRule: form.doubleRule,
      doubleAfterSplit: form.doubleAfterSplit,
      surrender: form.surrender,
      maxSplitHands: Number(form.maxSplitHands),
      resplitAces: form.resplitAces,
      hitSplitAces: form.hitSplitAces,
      oneCardSplitAces: form.oneCardSplitAces,
      insurance: form.insurance,
      splitTensByValue: form.splitTensByValue,
      customRules
    };
    return { name: formatStrategyRuleName(rules), rules };
  }

  const saveRules = async () => {
    if (!profile) return;
    try {
      const body = collectRules();
      const result = await api.updateRuleProfile(profile.id, body);
      onDataChange(result, { profileId: profile.id });
      onFeedback("Rules saved.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Could not save rules.");
    }
  };

  const createProfile = async () => {
    try {
      const body = collectRules();
      const existing = data.profiles.find(
        p => strategyRuleSignature(p.rules) === strategyRuleSignature(body.rules)
      );
      if (existing) {
        onSelectProfile(existing.id);
        return;
      }
      const created = await api.createRuleProfile(body);
      const newProfileId = created.id ?? null;
      if (newProfileId == null) {
        onFeedback("Could not create profile.");
        return;
      }
      const withChart = await api.createChart({
        ruleProfileId: newProfileId,
        cloneFromChartId: chartId ?? undefined,
        name: chartId
          ? `${data.charts.find(c => c.id === chartId)?.name ?? "Strategy"} copy`
          : "Default strategy"
      });
      onDataChange(withChart, { profileId: newProfileId, chartId: withChart.id ?? undefined });
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Could not create profile.");
    }
  };

  return (
    <Drawer open={open} onClose={onClose} eyebrow="Basic Strategy" title="Settings">
      <section className="strategy-form-grid" aria-label="Rule profile editor">
        <label className="strategy-wide-field">
          Rules
          <select value={profileId ?? ""} onChange={e => onSelectProfile(Number(e.target.value))}>
            {data.profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Decks
          <select value={form.decks} onChange={e => set("decks", Number(e.target.value))}>
            {[1, 2, 4, 6, 8].map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dealer soft 17
          <select
            value={String(form.dealerHitsSoft17)}
            onChange={e => set("dealerHitsSoft17", e.target.value === "true")}
          >
            <option value="true">Hit</option>
            <option value="false">Stand</option>
          </select>
        </label>
        <label>
          Blackjack payout
          <select
            value={form.blackjackPayout}
            onChange={e => set("blackjackPayout", e.target.value)}
          >
            <option value="3:2">3:2</option>
            <option value="6:5">6:5</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
        <label>
          Double rule
          <select value={form.doubleRule} onChange={e => set("doubleRule", e.target.value)}>
            <option value="anyTwo">Any two cards</option>
            <option value="hardOnly">Hard totals only</option>
            <option value="nineToEleven">9-11 only</option>
            <option value="tenToEleven">10-11 only</option>
            <option value="none">No double</option>
          </select>
        </label>
        <label>
          Surrender
          <select
            value={form.surrender}
            onChange={e => set("surrender", e.target.value as StrategyRules["surrender"])}
          >
            <option value="none">None</option>
            <option value="late">Late</option>
            <option value="early">Early</option>
          </select>
        </label>
        <label>
          Max split hands
          <input
            type="number"
            min={1}
            max={8}
            value={form.maxSplitHands}
            onChange={e => set("maxSplitHands", Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.doubleAfterSplit}
            onChange={e => set("doubleAfterSplit", e.target.checked)}
          />{" "}
          Double after split
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.resplitAces}
            onChange={e => set("resplitAces", e.target.checked)}
          />{" "}
          Resplit aces
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.hitSplitAces}
            onChange={e => set("hitSplitAces", e.target.checked)}
          />{" "}
          Hit split aces
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.oneCardSplitAces}
            onChange={e => set("oneCardSplitAces", e.target.checked)}
          />{" "}
          One card after split aces
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.insurance}
            onChange={e => set("insurance", e.target.checked)}
          />{" "}
          Insurance
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.splitTensByValue}
            onChange={e => set("splitTensByValue", e.target.checked)}
          />{" "}
          Split any 10-value pair
        </label>
      </section>

      <label className="strategy-custom-json">
        Custom rule notes JSON
        <textarea
          rows={5}
          spellCheck={false}
          value={form.customJson}
          onChange={e => set("customJson", e.target.value)}
        />
      </label>

      <div className="data-tools">
        <button type="button" className="ghost-button" onClick={() => void createProfile()}>
          New profile
        </button>
        <button type="button" className="primary-button" onClick={() => void saveRules()}>
          Save rules
        </button>
      </div>
    </Drawer>
  );
}
