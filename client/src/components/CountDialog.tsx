import { useEffect, useRef, useState, type ReactNode } from "react";

interface CountDialogProps {
  open: boolean;
  eyebrow: string;
  title: string;
  betweenRounds?: boolean;
  /** When set, the dialog is showing feedback rather than the input form. */
  feedback?: { correct: boolean; content: ReactNode } | null;
  onSubmit: (answer: number) => void;
  onContinue: () => void;
}

/** Shared count-entry modal for Table Practice and Flash Count. */
export function CountDialog({
  open,
  eyebrow,
  title,
  betweenRounds,
  feedback,
  onSubmit,
  onContinue
}: CountDialogProps) {
  const [digits, setDigits] = useState("");
  const [sign, setSign] = useState<1 | -1>(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const showingFeedback = Boolean(feedback);

  useEffect(() => {
    if (open && !showingFeedback) {
      setDigits("");
      setSign(1);
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [open, showingFeedback]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        setSign(prev => (prev === 1 ? -1 : 1));
        return;
      }
      // After feedback, Enter OR C continues (matches the original dialog).
      if (showingFeedback && (key === "c" || key === "enter")) {
        event.preventDefault();
        onContinue();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, showingFeedback, onContinue]);

  if (!open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (showingFeedback) {
      onContinue();
      return;
    }
    const clean = digits.replace(/\D/g, "");
    if (!clean) return;
    onSubmit(sign * Number.parseInt(clean, 10));
  };

  return (
    <div className="dialog-backdrop">
      <div
        className={`count-dialog${betweenRounds ? " is-between-rounds" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="count-hint">
          Keyboard: D toggles sign, Enter submits, C continues after feedback.
        </p>
        <form onSubmit={submit} className="count-form">
          {!showingFeedback ? (
            <div className="count-entry">
              <button
                type="button"
                className="sign-button"
                onClick={() => setSign(prev => (prev === 1 ? -1 : 1))}
                aria-label="Toggle count sign"
              >
                {sign === -1 ? "−" : "+"}
              </button>
              <input
                ref={inputRef}
                className="count-input"
                inputMode="numeric"
                pattern="[0-9]*"
                value={digits}
                onChange={event => setDigits(event.target.value.replace(/\D/g, ""))}
                placeholder="0"
                aria-label="Running count"
              />
            </div>
          ) : (
            <div className={`feedback ${feedback!.correct ? "correct" : "incorrect"}`}>
              {feedback!.content}
            </div>
          )}
          <div className="count-actions">
            {!showingFeedback ? (
              <button type="submit" className="primary-button">
                Submit
              </button>
            ) : (
              <button type="submit" className="primary-button" autoFocus>
                Continue
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
