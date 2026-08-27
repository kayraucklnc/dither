"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * A dropdown that is ours.
 *
 * A native <select> cannot show a second line, cannot show an icon, and looks
 * like whatever the operating system feels like - which in a dark, dense
 * editor reads as an unfinished control. This one is styled, keyboard
 * operable, and grouped.
 *
 * It renders into a portal because the inspector scrolls: a dropdown that is a
 * child of an `overflow-auto` column gets clipped by it.
 */

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Second line, for disambiguating similarly named things. */
  hint?: string;
  group?: string;
  disabled?: boolean;
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = "Choose…",
  className,
  ariaLabel,
}: {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);

  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  const selected = options.find((option) => option.value === value);
  const enabled = options.filter((option) => !option.disabled);

  const reposition = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;

    const below = window.innerHeight - rect.bottom;
    const height = Math.min(320, Math.max(160, below - 16));

    setBox({
      left: rect.left,
      // Flip above the trigger when there is more room up there.
      top: below < 180 && rect.top > below ? rect.top - height - 6 : rect.bottom + 6,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;

    reposition();
    setActive(Math.max(0, enabled.findIndex((option) => option.value === value)));

    const close = (event: MouseEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !list.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") return setOpen(false);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => {
          const next = current + (event.key === "ArrowDown" ? 1 : -1);
          return Math.min(enabled.length - 1, Math.max(0, next));
        });
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const option = enabled[active];
        if (option) {
          onChange(option.value);
          setOpen(false);
        }
      }
    };

    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [open, active, enabled, onChange]);

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-line bg-ground px-2.5 py-1.5",
          "text-left text-[13px] transition-colors hover:border-line-strong",
          open && "border-accent/70",
          className,
        )}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", selected ? "text-ink" : "text-faint")}>
            {selected?.label ?? placeholder}
          </span>
          {selected?.hint && (
            <span className="block truncate text-[11px] text-faint">{selected.hint}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-faint transition-transform", open && "rotate-180")}
        />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={list}
            role="listbox"
            id={id}
            style={{ left: box.left, top: box.top, width: box.width }}
            className="fixed z-50 max-h-80 overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-[0_18px_40px_-12px_oklch(0_0_0/0.7)]"
          >
            {options.map((option) => {
              const index = enabled.indexOf(option);
              const heading = option.group && option.group !== lastGroup ? option.group : undefined;
              lastGroup = option.group;

              return (
                <div key={String(option.value)}>
                  {heading && (
                    <p className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-faint">
                      {heading}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    disabled={option.disabled}
                    onMouseEnter={() => index >= 0 && setActive(index)}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                      option.disabled
                        ? "cursor-not-allowed text-faint opacity-50"
                        : index === active
                          ? "bg-surface text-ink"
                          : "text-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{option.label}</span>
                      {option.hint && (
                        <span className="block truncate text-[11px] text-faint">{option.hint}</span>
                      )}
                    </span>
                    {option.value === value && (
                      <Check size={13} className="shrink-0 text-accent-bright" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
