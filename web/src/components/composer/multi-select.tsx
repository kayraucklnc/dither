"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Choice } from "@/lib/fields/sources";

/**
 * Several answers to one question.
 *
 * Drawn as a list of toggles rather than a dropdown with checkboxes in it: the
 * lists this is for are short - the calendars on an account, a handful of
 * feeds - and the thing you most want to see is which ones are on, without
 * opening anything. A dropdown hides exactly that.
 *
 * Order is not meaningful and is not preserved. The value is sorted before it
 * leaves, because the settings are hashed into the key an answer is cached
 * under, and "work then family" must not be a different question from "family
 * then work".
 */
export function MultiSelect({
  value,
  options,
  ariaLabel,
  emptyLabel,
  onChange,
}: {
  value: string[];
  options: Choice[];
  ariaLabel: string;
  /** What to say when the source has nothing to offer yet. */
  emptyLabel: string;
  onChange: (next: string[]) => void;
}) {
  const chosen = new Set(value);

  const toggle = (option: string) => {
    const next = new Set(chosen);
    if (next.has(option)) next.delete(option);
    else next.add(option);

    onChange([...next].sort());
  };

  if (!options.length) {
    return <p className="text-[12px] text-faint">{emptyLabel}</p>;
  }

  return (
    <div role="group" aria-label={ariaLabel} className="space-y-1">
      {options.map((option) => {
        const on = chosen.has(option.value);

        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(option.value)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
              on ? "border-accent/60 bg-accent/10" : "border-line bg-ground hover:border-line/80",
            )}
          >
            <span
              className={cn(
                "grid h-4 w-4 shrink-0 place-items-center rounded border",
                on ? "border-accent bg-accent text-accent-ink" : "border-line",
              )}
            >
              {on && <Check size={11} />}
            </span>

            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{option.label}</span>
            {option.hint && (
              <span className="shrink-0 text-[11px] text-faint">{option.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
