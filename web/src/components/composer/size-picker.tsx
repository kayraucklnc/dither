"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import { drawableSizes, supportsSize, type Design } from "@/lib/designs";
import { COLUMNS, PRESETS, ROWS, sizeLabel, type Size } from "@/lib/shapes";

/**
 * Choosing a widget's size by sweeping a grid.
 *
 * The old picker was eight buttons, because there were eight sizes. There are
 * a hundred and forty-four now, which no list of buttons can carry - so this is
 * the thing every spreadsheet already taught everyone: drag out the rectangle
 * you want.
 *
 * Two things are drawn, and they are not the same thing:
 *
 *   - the *rectangle*, which is every cell from the corner back to the origin.
 *     It is filled whether or not each of those cells is itself a size you
 *     could pick, because it is the shape you are choosing, not a set.
 *   - which *corners* are pickable, which is where the extension's designs and
 *     the widget's neighbours come in.
 *
 * Conflating them was the first version of this, and it drew the selection as
 * a ragged blob - every cell whose own size happened to be drawable, lit, and
 * every cell whose size was not, dark, inside one rectangle.
 *
 * Unavailable sizes are shown rather than hidden, and the caption says which
 * of the two reasons applies. That is the point of refusing rather than
 * scaling: you can see the shape exists and that this extension will not draw
 * it, which is a fact about the extension rather than a mystery about the
 * editor.
 */
export function SizePicker({
  designs,
  value,
  /** Sizes that would land on another widget, so they can be refused too. */
  blocked,
  onChange,
}: {
  designs: Design[];
  value: Size;
  blocked?: (size: Size) => boolean;
  onChange: (size: Size) => void;
}) {
  const [hover, setHover] = useState<Size | undefined>();
  const drawable = drawableSizes(designs);

  const hasDesign = (size: Size) => drawable[size.rows - 1]?.[size.columns - 1] === true;
  const isBlocked = (size: Size) => blocked?.(size) === true;
  const pickable = (size: Size) => hasDesign(size) && !isBlocked(size);

  const shown = hover ?? value;
  const cornerPickable = pickable(shown);
  const why = !hasDesign(shown)
    ? "no design"
    : isBlocked(shown)
      ? "something is there"
      : undefined;

  return (
    <div>
      <div
        onPointerLeave={() => setHover(undefined)}
        className="grid gap-px rounded-md border border-line bg-line p-px"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          aspectRatio: "800 / 480",
        }}
      >
        {Array.from({ length: COLUMNS * ROWS }, (_, index) => {
          const columns = (index % COLUMNS) + 1;
          const rows = Math.floor(index / COLUMNS) + 1;
          const size = { columns, rows };

          // Inside the rectangle being previewed - which is about the shape,
          // not about whether this cell is a corner you could pick.
          const inside = columns <= shown.columns && rows <= shown.rows;
          const usable = pickable(size);

          return (
            <button
              key={index}
              type="button"
              aria-label={`${columns} by ${rows}`}
              aria-disabled={!usable}
              title={
                usable
                  ? `${columns} × ${rows}`
                  : hasDesign(size)
                    ? "Something is already there."
                    : "No design for this size."
              }
              // Hover always previews, even where the corner cannot be picked,
              // so the caption can say *why* rather than the grid going dead
              // under the pointer.
              onPointerEnter={() => setHover(size)}
              onFocus={() => setHover(size)}
              onClick={() => usable && onChange(size)}
              className={cn(
                "transition-colors",
                !usable && "cursor-not-allowed",
                inside
                  // The whole rectangle turns amber when its corner cannot be
                  // picked, so a refusal reads as "not this shape" rather than
                  // as one dead cell under the pointer.
                  ? cornerPickable
                    ? "bg-accent"
                    : "bg-warn/60"
                  : usable
                    ? "bg-raised hover:bg-line-strong"
                    : hasDesign(size)
                      ? "bg-line/60"
                      : "bg-ground",
              )}
            />
          );
        })}
      </div>

      <p className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate text-faint">{sizeLabel(shown)}</span>
        <span className="shrink-0 font-mono text-faint">
          {shown.columns}×{shown.rows} cells
          {why && <span className="ml-1.5 text-warn">{why}</span>}
        </span>
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        {PRESETS.filter((entry) => supportsSize(designs, entry)).map((entry) => {
          const current = value.columns === entry.columns && value.rows === entry.rows;
          const usable = pickable(entry);

          return (
            <button
              key={entry.id}
              type="button"
              title={usable ? entry.hint : "Something is already there."}
              disabled={!usable}
              onClick={() => onChange({ columns: entry.columns, rows: entry.rows })}
              onPointerEnter={() => setHover({ columns: entry.columns, rows: entry.rows })}
              onPointerLeave={() => setHover(undefined)}
              className={cn(
                "rounded border px-1.5 py-1 text-[10px] transition-colors",
                current
                  ? "border-accent/60 bg-accent/10 text-ink"
                  : usable
                    ? "border-line bg-raised text-muted hover:text-ink"
                    : "cursor-not-allowed border-line/50 bg-ground text-faint/50",
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
