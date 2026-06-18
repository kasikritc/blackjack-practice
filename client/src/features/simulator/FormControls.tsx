import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="sim-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="sim-toggle-field">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}

export function ArrayField({
  label,
  values,
  onChange,
  integer = false,
  hint
}: {
  label: string;
  values: number[];
  onChange: (values: number[]) => void;
  integer?: boolean;
  hint?: string;
}) {
  const parse = (text: string) =>
    text
      .split(/[\s,]+/)
      .map(value => (integer ? Number.parseInt(value, 10) : Number(value)))
      .filter(Number.isFinite);
  return (
    <Field label={label} hint={hint}>
      <input
        type="text"
        value={values.join(", ")}
        onChange={event => onChange(parse(event.target.value))}
      />
    </Field>
  );
}
