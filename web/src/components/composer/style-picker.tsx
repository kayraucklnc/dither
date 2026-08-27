"use client";

import { Check, Wand2 } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { cn } from "@/lib/cn";
import { designsFor, type Design } from "@/lib/designs";
import { pixelsFor, type Size } from "@/lib/shapes";

/**
 * Picking which design draws this widget.
 *
 * Every style is previewed at the size the widget actually is, with the
 * settings the widget actually has - not with the extension's defaults. That
 * matters more than it sounds: choosing between five revenue designs is
 * useless if all five are drawn showing today's takings when the widget is set
 * to monthly recurring revenue. You are choosing between *these five*, of
 * *your* number, in *your* box.
 *
 * Only styles that cover the current size are offered. A style that does not
 * is not greyed out, it is simply not a choice here - resize and it appears.
 */
export function StylePicker({
  extension,
  designs,
  size,
  settings,
  value,
  onChange,
}: {
  extension: string;
  designs: Design[];
  size: Size;
  settings: Record<string, unknown>;
  /** Empty means "whichever fits best". */
  value: string;
  onChange: (design: string) => void;
}) {
  const available = designsFor(designs, size);
  if (available.length < 2) return null;

  const [width, height] = pixelsFor(size, 800, 480);
  const query = encodeURIComponent(JSON.stringify(settings));
  const automatic = available[0];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Style</p>
        <button
          type="button"
          onClick={() => onChange("")}
          className={cn(
            "flex items-center gap-1 text-[11px] transition-colors",
            value ? "text-faint hover:text-ink" : "text-accent-bright",
          )}
        >
          <Wand2 size={10} />
          {value ? "let it choose" : "chosen for you"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {available.map((design) => {
          const active = value ? value === design.key : design.key === automatic.key;

          return (
            <button
              key={design.key}
              type="button"
              title={design.hint}
              onClick={() => onChange(design.key)}
              className={cn(
                "group rounded-lg border p-1.5 text-left transition-colors",
                active
                  ? "border-accent bg-accent/10"
                  : "border-line bg-raised hover:border-line-strong",
              )}
            >
              <ScreenPreview
                src={
                  `/api/preview/extension/${extension}` +
                  `?size=${size.columns}x${size.rows}&design=${design.key}&settings=${query}`
                }
                width={width}
                height={height}
                alt={design.label}
                className="rounded"
              />
              <span className="mt-1.5 flex items-center gap-1 px-0.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                  {design.label}
                </span>
                {active && <Check size={11} className="shrink-0 text-accent-bright" />}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
        {value
          ? "Kept while you resize. If a size this style cannot draw comes up, another draws it until you go back."
          : `${automatic.label} fits this size best, so it is what you get until you pick.`}
      </p>
    </div>
  );
}
