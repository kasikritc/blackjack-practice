import { useEffect } from "react";
import type { AppSettings, CountCheckMode, DealerSpeed, ShoeDisplayMode } from "@blackjack/shared";
import { SPEED_PRESETS } from "../lib/useSettings";
import { clampFlashCount } from "../lib/settings";
import { Drawer } from "./Drawer";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  variant: "table" | "flash";
  /** Live persist on every change, matching the original save-on-change behaviour. */
  onChange: (next: AppSettings) => void;
  /** Finalize: reshuffle the shoe (table) — the drawer also closes afterwards. */
  onApply: () => void;
}

function InfoTip({ label }: { label: string }) {
  return (
    <span className="info-tip opens-left" tabIndex={0} aria-label={label}>
      i
    </span>
  );
}

export function SettingsDrawer({
  open,
  onClose,
  settings,
  variant,
  onChange,
  onApply
}: SettingsDrawerProps) {
  function update(patch: Partial<AppSettings>) {
    onChange({ ...settings, ...patch });
  }

  function applySpeed(speed: DealerSpeed) {
    const preset = SPEED_PRESETS[speed];
    update({
      dealerSpeed: speed,
      ...(preset
        ? {
            dealDelayMs: preset.deal,
            playerThinkDelayMs: preset.player,
            dealerThinkDelayMs: preset.dealer,
            countPromptDelayMs: preset.quiz
          }
        : {})
    });
  }

  const apply = () => {
    onApply();
    onClose();
  };

  // Original keyboard affordance: "A applies", Esc closes (Drawer handles Esc).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        apply();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={variant === "flash" ? "Flash Count" : "Table rules"}
      title="Settings"
      footer={
        <button type="button" className="primary-button wide" onClick={apply}>
          {variant === "flash" ? "Apply" : "Apply and shuffle"}
        </button>
      }
    >
      <p className="settings-hint shortcut-help">A applies · Esc closes</p>

      {variant === "flash" ? (
        <div className="settings-grid">
          <label>
            Min cards
            <input
              type="number"
              min={1}
              max={8}
              value={settings.flashMinCards}
              onChange={e => update({ flashMinCards: Number(e.target.value) })}
              onBlur={e => update({ flashMinCards: clampFlashCount(e.target.value) })}
            />
          </label>
          <label>
            Max cards
            <input
              type="number"
              min={1}
              max={8}
              value={settings.flashMaxCards}
              onChange={e => update({ flashMaxCards: Number(e.target.value) })}
              onBlur={e => update({ flashMaxCards: clampFlashCount(e.target.value) })}
            />
          </label>
          <label>
            Flash duration
            <input
              type="range"
              min={300}
              max={4000}
              step={100}
              value={settings.flashDurationMs}
              onChange={e => update({ flashDurationMs: Number(e.target.value) })}
            />
            <span>{settings.flashDurationMs} ms</span>
          </label>
        </div>
      ) : (
        <>
          <div className="settings-grid">
            <label>
              Decks
              <select
                value={settings.numberOfDecks}
                onChange={e => update({ numberOfDecks: Number(e.target.value) })}
              >
                {[1, 2, 4, 6, 8].map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label-title">
                Penetration
                <InfoTip label="Penetration is how far into the shoe cards are dealt before reshuffling. Higher penetration means more cards are seen before the shuffle." />
              </span>
              <input
                type="range"
                min={50}
                max={90}
                value={settings.penetrationPercent}
                onChange={e => update({ penetrationPercent: Number(e.target.value) })}
              />
              <span>{settings.penetrationPercent}%</span>
            </label>
            <label>
              Dealer rule
              <select
                value={String(settings.dealerHitsSoft17)}
                onChange={e => update({ dealerHitsSoft17: e.target.value === "true" })}
              >
                <option value="true">Hit soft 17</option>
                <option value="false">Stand soft 17</option>
              </select>
            </label>
            <label>
              <span className="label-title">
                Dealer peek
                <InfoTip label="When enabled, the dealer checks for blackjack right away when showing an ace or ten-value card." />
              </span>
              <select
                value={String(settings.dealerPeek)}
                onChange={e => update({ dealerPeek: e.target.value === "true" })}
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>
            <label>
              Blackjack payout
              <select
                value={settings.blackjackPayout}
                onChange={e => update({ blackjackPayout: e.target.value })}
              >
                <option value="3:2">3:2</option>
                <option value="6:5">6:5</option>
              </select>
            </label>
            <label>
              Other players
              <select
                value={settings.numberOfOtherPlayers}
                onChange={e => update({ numberOfOtherPlayers: Number(e.target.value) })}
              >
                {[0, 1, 2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Shoe display
              <select
                value={settings.shoeDisplayMode}
                onChange={e => update({ shoeDisplayMode: e.target.value as ShoeDisplayMode })}
              >
                <option value="decks">Decks left</option>
                <option value="numbers">Card numbers</option>
                <option value="graphic">Tray graphic</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <label>
              Dealer speed
              <select
                value={settings.dealerSpeed}
                onChange={e => applySpeed(e.target.value as DealerSpeed)}
              >
                <option value="firstLesson">First lesson</option>
                <option value="learning">Learning pace</option>
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
                <option value="manual">Manual step</option>
              </select>
            </label>
            <label>
              Deal delay
              <input
                type="range"
                min={150}
                max={5000}
                step={50}
                value={settings.dealDelayMs}
                onChange={e => update({ dealDelayMs: Number(e.target.value) })}
              />
              <span>{settings.dealDelayMs} ms</span>
            </label>
            <label>
              Player thinking
              <input
                type="range"
                min={0}
                max={7000}
                step={100}
                value={settings.playerThinkDelayMs}
                onChange={e => update({ playerThinkDelayMs: Number(e.target.value) })}
              />
              <span>{settings.playerThinkDelayMs} ms</span>
            </label>
            <label>
              Dealer pause
              <input
                type="range"
                min={0}
                max={5000}
                step={100}
                value={settings.dealerThinkDelayMs}
                onChange={e => update({ dealerThinkDelayMs: Number(e.target.value) })}
              />
              <span>{settings.dealerThinkDelayMs} ms</span>
            </label>
            <label>
              Quiz pause
              <input
                type="range"
                min={0}
                max={10000}
                step={100}
                value={settings.countPromptDelayMs}
                onChange={e => update({ countPromptDelayMs: Number(e.target.value) })}
              />
              <span>{settings.countPromptDelayMs} ms</span>
            </label>
            <label>
              Running count quiz
              <select
                value={settings.countCheckMode}
                onChange={e => update({ countCheckMode: e.target.value as CountCheckMode })}
              >
                <option value="everyRound">End of round (recommended)</option>
                <option value="random">Random during play (beginner drill)</option>
                <option value="everyNCards">Every N cards</option>
                <option value="manual">Manual only</option>
              </select>
            </label>
            <label>
              Card interval
              <input
                type="number"
                min={3}
                max={30}
                value={settings.countCheckCardInterval}
                onChange={e => update({ countCheckCardInterval: Number(e.target.value) })}
              />
            </label>
            <label>
              Shuffle behavior
              <select
                value={String(settings.shuffleImmediately)}
                onChange={e => update({ shuffleImmediately: e.target.value === "true" })}
              >
                <option value="false">Finish round</option>
                <option value="true">Immediately</option>
              </select>
            </label>
          </div>

          <div className="toggle-grid">
            <label>
              <input
                type="checkbox"
                checked={settings.surrenderAllowed}
                onChange={e => update({ surrenderAllowed: e.target.checked })}
              />{" "}
              Surrender
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.doubleAfterSplit}
                onChange={e => update({ doubleAfterSplit: e.target.checked })}
              />
              <span className="label-title">
                Double after split
                <InfoTip label="When enabled, a player may double down after splitting a pair." />
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.resplitAces}
                onChange={e => update({ resplitAces: e.target.checked })}
              />{" "}
              Resplit aces
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.hitSplitAces}
                onChange={e => update({ hitSplitAces: e.target.checked })}
              />{" "}
              Hit split aces
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.sideBetsEnabled}
                onChange={e => update({ sideBetsEnabled: e.target.checked })}
              />{" "}
              Side bets
            </label>
          </div>

          <div className="toggle-grid">
            <label>
              <input
                type="checkbox"
                checked={settings.animationsEnabled}
                onChange={e => update({ animationsEnabled: e.target.checked })}
              />{" "}
              Animation
            </label>
          </div>
        </>
      )}
    </Drawer>
  );
}
