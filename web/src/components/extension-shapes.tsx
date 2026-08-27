"use client";

import { useState } from "react";
import { Bell, BellOff, Link2 } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { cn } from "@/lib/cn";
import { COLUMNS, ROWS, type ShapeId } from "@/lib/shapes";

export interface ShapeEntry {
  id: ShapeId;
  label: string;
  columns: number;
  rows: number;
  width: number;
  height: number;
  /** Whether this shape has a template of its own, or borrows one. */
  authored: boolean;
  standInFor?: string;
  /** Whether the design that draws it renders notices. */
  takesNotices: boolean;
}

export interface ShapeFamily {
  id: string;
  label: string;
  hint: string;
  shapes: ShapeEntry[];
}

/**
 * The sizes an extension can be drawn at, drawn at those sizes.
 *
 * Every preview used to be rendered into a card of the same width, which made
 * a half-width design look *wider* than a full-screen one - the opposite of
 * the truth, and the only thing this page really has to communicate. Each
 * preview is now a true fraction of the panel, so half width is half the
 * width of full screen, on the page as on the wall.
 */
export function ExtensionShapes({
  name,
  families,
  acceptsNotices,
}: {
  name: string;
  families: ShapeFamily[];
  acceptsNotices: boolean;
}) {
  const [withNotice, setWithNotice] = useState(false);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">Sizes it can be drawn at</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-faint">
            Shown at their true fraction of the panel — half width really is half the width. A
            widget takes the size you draw it, and any size not here is refused rather than scaled.
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

      <div className="space-y-8">
        {families.map((family) => (
          <div key={family.id}>
            <div className="mb-3 flex items-baseline gap-3">
              <h3 className="text-[13px] font-medium">{family.label}</h3>
              <p className="text-[12px] text-faint">{family.hint}</p>
            </div>

            <div className="flex flex-wrap items-start gap-5">
              {family.shapes.map((shape) => (
                <div
                  key={shape.id}
                  // True relative scale: a shape's width is its share of the
                  // six-column grid, minus what the gaps take.
                  style={{ width: `calc(${(shape.columns / COLUMNS) * 100}% - ${(1 - shape.columns / COLUMNS) * 20}px)` }}
                  className="min-w-[150px]"
                >
                  <ScreenPreview
                    src={`/api/preview/extension/${name}?shape=${shape.id}${withNotice ? "&notice=1" : ""}`}
                    width={shape.width}
                    height={shape.height}
                    alt={`${shape.label}`}
                    className="paper-shadow"
                  />

                  <div className="mt-2 px-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-medium">{shape.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-faint">
                        {shape.width}×{shape.height}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {!shape.authored && (
                        <span
                          title={`Drawn by the ${shape.standInFor} design, which is the same family`}
                          className="flex items-center gap-1 text-[11px] text-faint"
                        >
                          <Link2 size={10} />
                          from {shape.standInFor}
                        </span>
                      )}
                      {shape.takesNotices && (
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-faint">
        Rows are out of {ROWS}, columns out of {COLUMNS}. A design covers its whole family — a wide
        band works in a taller wide band — but never crosses one, so a full-screen design is never
        crammed into a corner.
      </p>
    </section>
  );
}
