import type { StrategyRules } from "@blackjack/shared";
import { Field, NumberField, ToggleField } from "./FormControls";

export function RulesEditor({
  rules,
  onChange
}: {
  rules: StrategyRules;
  onChange: (rules: StrategyRules) => void;
}) {
  const patch = (values: Partial<StrategyRules>) => onChange({ ...rules, ...values });
  return (
    <div className="sim-rules-editor">
      <div className="sim-form-grid sim-form-grid-4">
        <NumberField
          label="Decks"
          value={rules.decks}
          min={1}
          max={8}
          onChange={decks => patch({ decks })}
        />
        <Field label="Blackjack payout">
          <select
            value={rules.blackjackPayout}
            onChange={event => patch({ blackjackPayout: event.target.value })}
          >
            <option value="3:2">3:2</option>
            <option value="6:5">6:5</option>
            <option value="1:1">1:1</option>
          </select>
        </Field>
        <Field label="Double rule">
          <select
            value={rules.doubleRule}
            onChange={event => patch({ doubleRule: event.target.value })}
          >
            <option value="anyTwo">Any two cards</option>
            <option value="hardOnly">Hard totals only</option>
            <option value="nineToEleven">9–11</option>
            <option value="tenToEleven">10–11</option>
            <option value="none">No doubling</option>
          </select>
        </Field>
        <Field label="Surrender">
          <select
            value={rules.surrender}
            onChange={event =>
              patch({ surrender: event.target.value as StrategyRules["surrender"] })
            }
          >
            <option value="none">None</option>
            <option value="late">Late</option>
            <option value="early">Early</option>
          </select>
        </Field>
        <NumberField
          label="Maximum split hands"
          value={rules.maxSplitHands}
          min={1}
          max={8}
          onChange={maxSplitHands => patch({ maxSplitHands })}
        />
      </div>
      <div className="sim-toggle-grid">
        <ToggleField
          label="Dealer hits soft 17"
          checked={rules.dealerHitsSoft17}
          onChange={dealerHitsSoft17 => patch({ dealerHitsSoft17 })}
        />
        <ToggleField
          label="Dealer peek"
          checked={rules.dealerPeek}
          onChange={dealerPeek => patch({ dealerPeek })}
        />
        <ToggleField
          label="Dealer hole card"
          checked={rules.dealerHoleCard}
          onChange={dealerHoleCard => patch({ dealerHoleCard })}
        />
        <ToggleField
          label="Double after split"
          checked={rules.doubleAfterSplit}
          onChange={doubleAfterSplit => patch({ doubleAfterSplit })}
        />
        <ToggleField
          label="Resplit aces"
          checked={rules.resplitAces}
          onChange={resplitAces => patch({ resplitAces })}
        />
        <ToggleField
          label="Hit split aces"
          checked={rules.hitSplitAces}
          onChange={hitSplitAces => patch({ hitSplitAces })}
        />
        <ToggleField
          label="One card on split aces"
          checked={rules.oneCardSplitAces}
          onChange={oneCardSplitAces => patch({ oneCardSplitAces })}
        />
        <ToggleField
          label="Insurance offered"
          checked={rules.insurance}
          onChange={insurance => patch({ insurance })}
        />
        <ToggleField
          label="Split tens by exact rank"
          checked={rules.splitTensByValue}
          onChange={splitTensByValue => patch({ splitTensByValue })}
        />
      </div>
    </div>
  );
}
