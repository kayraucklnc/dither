"use client";

import { useState } from "react";
import { Bell, BellOff, Maximize2 } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { cn } from "@/lib/cn";
import { COLUMNS, ROWS } from "@/lib/shapes";

export interface DesignEntry {
  key: string;
  label: string;
  hint: string;
  /** The size it is previewed at, which is the one it was really drawn for. */
  columns: number;
  rows: number;
  width: number;
  height: number;
  /** The range of sizes it will be drawn at, as words. */
  range: string;
  /** Whether this design renders another extension's alert. */
  takesNotices: boolean;
  /** True when the manifest gave it a range, false when it inherited one. */
  declared: boolean;
}

/**
 * The looks an extension offers, drawn at the size each was designed for.
 *
 * This used to be "the sizes it can be drawn at", back when a size *was* a
 * design and the eight of them were the whole vocabulary. Now size is free and
 * a design covers a range of them, so what is worth showing is the range each
 * one covers and what it looks like in the middle of it - the thing you are
 * actually choosing between when you pick a style.
 *
 * Previews are true fractions of the panel, so a half-width design really is
 * half the width of a full-screen one, on the page as on the wall.
 */
export function ExtensionDesigns({
  name,
  designs,
  acceptsNotices,
}: {
  name: string;
  designs: DesignEntry[];
  acceptsNotices: boolean;
}) {
  const [withNotice, setWithNotice] = useState(false);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">Styles it can be drawn in</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-faint">
            A widget takes whatever size you draw it on the {COLUMNS}×{ROWS} grid, and the style
            whose range covers that size draws it. Where more than one covers it, you choose. A
            size no style covers is refused rather than scaled.
          </p>
        </div>

        {acceptsNotices && (
          <button
            type="button"
            onClick={() => setWithNotice((value) => !value)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors",
              withNotice
                ? "border-accent bg-accent/10 text-ink"
                : "border-line bg-raised text-muted hover:text-ink",
            )}
          >
            {withNotice ? <Bell size={13} className="text-accent-bright" /> : <BellOff size={13} />}
            {withNotice ? "Showing an alert" : "Preview with an alert"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {designs.map((design) => (
          <div
            key={design.key}
            // True relative scale: a design's width is its share of the grid,
            // minus what the gaps between cards take.
            style={{
              width: `calc(${(design.columns / COLUMNS) * 100}% - ${(1 - design.columns / COLUMNS) * 24}px)`,
            }}
            className="min-w-[170px]"
          >
            <ScreenPreview
              src={`/api/preview/extension/${name}?size=${design.columns}x${design.rows}&design=${design.key}${withNotice ? "&notice=1" : ""}`}
              width={design.width}
              height={design.height}
              alt={design.label}
              className="paper-shadow"
            />

            <div className="mt-2 px-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] font-medium">{design.label}</span>
                <span className="shrink-0 font-mono text-[11px] text-faint">
                  {design.width}×{design.height}
                </span>
              </div>

              {design.hint && (
                <p className="mt-1 text-[11px] leading-relaxed text-faint">{design.hint}</p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span
                  title="Every size on the grid this style will be drawn at"
                  className="flex items-center gap-1 text-[11px] text-faint"
                >
                  <Maximize2 size={10} />
                  {design.range}
                </span>
                {design.takesNotices && (
                  <span
                    title="This design has a strip where another extension's alert can appear"
                    className={cn(
                      "flex items-center gap-1 text-[11px] transition-colors",
                      withNotice ? "text-accent-bright" : "text-faint",
                    )}
                  >
                    <Bell size={10} />
                    takes alerts
                  </span>
                )}
                {!design.declared && (
                  <span
                    title="Named after one of the original shapes, so it inherited that shape's range"
                    className="text-[11px] text-faint"
                  >
                    inherited range
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
