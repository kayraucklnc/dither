// The handful of controls the whole app is built from.

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong disabled:opacity-50",
  secondary: "bg-raised text-ink border border-line hover:border-muted disabled:opacity-50",
  ghost: "text-ink hover:bg-ink/5 disabled:opacity-40",
  danger: "text-danger hover:bg-danger-soft disabled:opacity-40",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", icon, className = "", children, ...rest }: ButtonProps) {
  const sizes = { sm: "h-7 px-2 text-[13px] gap-1.5", md: "h-9 px-3 gap-2", lg: "h-11 px-5 text-[15px] gap-2" };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-grid place-items-center size-8 rounded-md text-muted hover:text-ink hover:bg-ink/5 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({ label, help, children }: { label: string; help?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {help && <p className="text-[12px] text-muted leading-snug">{help}</p>}
    </div>
  );
}

const INPUT = "w-full h-9 rounded-md border border-line bg-raised px-2.5 text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none";

export function TextInput({ id, value, onChange, onBlur, placeholder, type = "text", autoFocus }: {
  id?: string; value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return <input id={id} type={type} className={INPUT} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />;
}

export function TextArea({ id, value, onChange, placeholder, rows = 3 }: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      id={id}
      rows={rows}
      className={`${INPUT} h-auto py-2 resize-y`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Typing may pass through empty or out-of-range text; the value is clamped when the field is left. */
export function NumberInput({ id, value, onChange, min, max, step, unit }: {
  id?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n) && clamp(n) !== value) onChange(clamp(n));
    setDraft(null);
  };
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        className={`${INPUT} ${unit ? "pr-12" : ""}`}
        value={draft ?? (Number.isFinite(value) ? String(value) : "")}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n) && n === clamp(n)) onChange(n);
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {unit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-[13px]">{unit}</span>}
    </div>
  );
}

export function Select<T extends string>({ id, value, onChange, options }: {
  id?: string; value: T; onChange: (v: T) => void; options: readonly { value: T; label: string }[];
}) {
  return (
    <select id={id} className={`${INPUT} pr-8`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: readonly { value: T; label: ReactNode }[]; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-7 px-2.5 rounded text-[13px] font-medium ${o.value === value ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** With `dismissible` false, Esc, the backdrop and the close button do nothing — for work that must not be interrupted. */
export function Dialog({ open, onClose, title, children, wide, dismissible = true }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => !dismissible && e.preventDefault()}
      onClose={() => {
        // Chrome lets a repeated Esc close a dialog even when cancel is prevented.
        if (!dismissible && open) ref.current?.showModal();
        else onClose();
      }}
      onClick={(e) => dismissible && e.target === ref.current && onClose()}
      className={`m-auto rounded-xl bg-surface text-ink p-0 shadow-2xl backdrop:bg-black/40 ${wide ? "w-[min(920px,94vw)]" : "w-[min(520px,94vw)]"}`}
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {dismissible && (
              <IconButton label="Close" onClick={onClose}>
                <X size={16} />
              </IconButton>
            )}
          </header>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "ok"; children: ReactNode }) {
  const tones = {
    info: "bg-raised border-line text-ink",
    warn: "bg-danger-soft border-danger/30 text-ink",
    ok: "bg-accent-soft border-accent/30 text-ink",
  };
  return <div className={`rounded-md border px-3 py-2 text-[13px] ${tones[tone]}`}>{children}</div>;
}
