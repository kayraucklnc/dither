"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, TriangleAlert } from "lucide-react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { Field } from "@/lib/extensions/manifest";

/**
 * The settings form is generated from the extension's manifest.
 *
 * This is what makes "each extension brings its own UI" true rather than
 * aspirational: an extension that declares a field gets a control here without
 * a line of dashboard code, and one that names an option source gets a list
 * the code already knows - which countries are supported, which operators
 * answer for a city, which stations exist. Typing a station code from memory
 * is not a settings form, it is a quiz.
 *
 * It edits the *widget's* settings - this placement of this extension - never
 * the extension itself.
 */

interface Choice {
  value: string;
  label: string;
  hint?: string;
}

const inputClass =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors placeholder:text-faint focus:border-accent/70";

function optionsOf(field: Field): Choice[] {
  return (field.options ?? []).map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

/**
 * A field you type into, with matches from the server.
 *
 * For lists too long to open: three hundred stations in a dropdown is a
 * dropdown nobody scrolls.
 */
function SearchField({
  field,
  value,
  settings,
  onChange,
}: {
  field: Field;
  value: string;
  settings: Record<string, unknown>;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    if (!open) return;

    const dismiss = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("mousedown", dismiss);
    return () => window.removeEventListener("mousedown", dismiss);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setBusy(true);

    const timer = setTimeout(async () => {
      const response = await fetch("/api/field-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: [field.options_from], settings, query }),
      });

      if (cancelled) return;
      setBusy(false);

      if (!response.ok) return setProblem("Could not reach the list.");

      const body = await response.json();
      const result = body.options?.[field.options_from!];

      if (result && "error" in result) setProblem(result.error);
      else {
        setProblem(undefined);
        setChoices(result ?? []);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, field.options_from]);

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Start typing…"
          className={cn(inputClass, "pl-8")}
        />
        {busy && (
          <Loader2 size={13} className="absolute top-1/2 right-2.5 -translate-y-1/2 animate-spin text-faint" />
        )}
      </div>

      {open && (
        <div className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-[0_18px_40px_-12px_oklch(0_0_0/0.7)]">
          {problem && (
            <p className="flex items-start gap-1.5 px-2 py-2 text-[11px] leading-relaxed text-warn">
              <TriangleAlert size={11} className="mt-0.5 shrink-0" />
              {problem}
            </p>
          )}

          {!problem && choices.length === 0 && !busy && (
            <p className="px-2 py-2 text-[12px] text-faint">Nothing matches.</p>
          )}

          {choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              onClick={() => {
                onChange(choice.value);
                setQuery(choice.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{choice.label}</span>
                {choice.hint && (
                  <span className="block truncate text-[11px] text-faint">{choice.hint}</span>
                )}
              </span>
              {choice.value === value && <Check size={13} className="shrink-0 text-accent-bright" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsForm({
  fields,
  values,
  capabilitiesFrom,
  onChange,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  /** Where "what can these settings do" is answered, for `needs_capability`. */
  capabilitiesFrom?: string;
  onChange: (key: string, value: unknown) => void;
}) {
  const [remote, setRemote] = useState<Record<string, Choice[]>>({});
  const [can, setCan] = useState<string[]>([]);

  const listed = fields.filter(
    (field) => field.options_from && field.field_type !== "search",
  );

  const wanted = listed.map((field) => field.options_from!).join(",");
  const signature = JSON.stringify(values);

  const load = useCallback(async () => {
    if (!wanted && !capabilitiesFrom) return;

    const response = await fetch("/api/field-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: wanted ? wanted.split(",") : [],
        capabilities: capabilitiesFrom ? [capabilitiesFrom] : [],
        settings: JSON.parse(signature),
      }),
    });

    if (!response.ok) return;

    const body = await response.json();
    const options: Record<string, Choice[]> = {};

    for (const [id, value] of Object.entries(body.options ?? {})) {
      if (Array.isArray(value)) options[id] = value as Choice[];
    }

    setRemote(options);
    setCan(body.can ?? []);
  }, [wanted, capabilitiesFrom, signature]);

  // Choosing a different country changes the cities, so this reruns whenever
  // any setting moves. Debounced, because it reruns on every keystroke too.
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  if (!fields.length) {
    return <p className="text-[13px] text-faint">This extension takes no settings.</p>;
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        // A field for something the chosen operator ignores is worse than a
        // missing one, because it looks like it works.
        if (field.needs_capability && !can.includes(field.needs_capability)) return null;

        const value = values[field.keyname] ?? "";
        const id = `field-${field.keyname}`;
        const choices = field.options_from ? (remote[field.options_from] ?? []) : optionsOf(field);

        return (
          <div key={field.keyname}>
            <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-ink">{field.name}</span>
              {field.optional && <span className="text-[11px] text-faint">optional</span>}
            </label>

            {field.field_type === "search" ? (
              <SearchField
                field={field}
                value={String(value)}
                settings={values}
                onChange={(next) => onChange(field.keyname, next)}
              />
            ) : field.field_type === "text" ? (
              <textarea
                id={id}
                rows={3}
                value={String(value)}
                onChange={(event) => onChange(field.keyname, event.target.value)}
                className={cn(inputClass, "resize-y")}
              />
            ) : field.field_type === "select" ? (
              <Select
                value={String(value)}
                ariaLabel={field.name}
                options={
                  choices.length
                    ? choices
                    : [{ value: String(value), label: String(value) || "Nothing to choose" }]
                }
                onChange={(next) => onChange(field.keyname, next)}
              />
            ) : field.field_type === "boolean" ? (
              <button
                id={id}
                type="button"
                role="switch"
                aria-checked={Boolean(value)}
                onClick={() => onChange(field.keyname, !value)}
                className={cn(
                  "flex h-6 w-11 items-center rounded-full border p-0.5 transition-colors",
                  value ? "border-accent/60 bg-accent/30" : "border-line bg-ground",
                )}
              >
                <span
                  className={cn(
                    "block h-4.5 w-4.5 rounded-full transition-transform",
                    value ? "translate-x-5 bg-accent" : "translate-x-0 bg-faint",
                  )}
                />
              </button>
            ) : (
              <input
                id={id}
                type={
                  field.field_type === "number"
                    ? "number"
                    : field.field_type === "time"
                      ? "time"
                      : field.field_type === "url"
                        ? "url"
                        : "text"
                }
                value={String(value)}
                min={field.min}
                max={field.max}
                onChange={(event) =>
                  onChange(
                    field.keyname,
                    field.field_type === "number" ? event.target.valueAsNumber : event.target.value,
                  )
                }
                className={inputClass}
              />
            )}

            {field.help_text && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{field.help_text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
