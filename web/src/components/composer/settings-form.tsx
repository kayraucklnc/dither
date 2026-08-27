"use client";

import type { Field } from "@/lib/extensions/manifest";
import { cn } from "@/lib/cn";

/**
 * The settings form is generated from the extension's manifest.
 *
 * This is what makes "each extension brings its own UI" true rather than
 * aspirational: an extension that declares a new field gets a new control here
 * without a line of dashboard code. It edits the *widget's* settings - this
 * placement of this extension - never the extension itself.
 */

const inputClass =
  "w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] text-ink " +
  "outline-none transition-colors placeholder:text-faint focus:border-accent/70";

function optionsOf(field: Field) {
  return (field.options ?? []).map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

export function SettingsForm({
  fields,
  values,
  onChange,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (!fields.length) {
    return <p className="text-[13px] text-faint">This extension takes no settings.</p>;
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const value = values[field.keyname] ?? "";
        const id = `field-${field.keyname}`;

        return (
          <div key={field.keyname}>
            <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-ink">{field.name}</span>
              {field.optional && <span className="text-[11px] text-faint">optional</span>}
            </label>

            {field.field_type === "text" ? (
              <textarea
                id={id}
                rows={3}
                value={String(value)}
                onChange={(event) => onChange(field.keyname, event.target.value)}
                className={cn(inputClass, "resize-y")}
              />
            ) : field.field_type === "select" ? (
              <select
                id={id}
                value={String(value)}
                onChange={(event) => onChange(field.keyname, event.target.value)}
                className={inputClass}
              >
                {optionsOf(field).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                    "h-4.5 w-4.5 rounded-full transition-transform",
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
