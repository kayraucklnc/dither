import { COLUMNS, ROWS, sizeLabel, type Size } from "@/lib/shapes";

/**
 * A design is a template plus the sizes it is willing to be drawn at.
 *
 * This replaces the old fixed list of eight shapes. The reason it had to go is
 * that a shape was both "how big is this widget" and "which template draws
 * it", so a widget could only ever be one of eight sizes - and an extension
 * could only ever offer one look per size.
 *
 * Splitting them gets both things at once:
 *
 *   - Size is free. Draw a widget at 5x7 if you like; the design whose range
 *     covers 5x7 draws it, and if none does the size is refused rather than
 *     scaled. Refusal is still the rule - a full-page design crammed into a
 *     corner is six-point type nobody can read.
 *   - Look is a choice. Where several designs cover the size you drew, the
 *     widget picks one. That is what "style" means in the inspector: revenue
 *     at half width can be one enormous figure, or a figure with the month
 *     behind it, or a ledger of every window - same size, same data, three
 *     designs, and the person arranging the screen decides.
 */

export interface SizeRange {
  minColumns: number;
  maxColumns: number;
  minRows: number;
  maxRows: number;
}

export interface Design {
  /** Template file stem. `full` is the root template.html.liquid. */
  key: string;
  label: string;
  hint: string;
  range: SizeRange;
  /** The size it was really drawn for. Decides which design wins a tie. */
  nominal: Size;
  /** True when the manifest declared it, false when it fell back to a preset. */
  declared: boolean;
}

/**
 * What the eight original template names mean as ranges.
 *
 * Extensions written before designs existed name their templates after the old
 * shapes, and those names still have to mean something on a twelfth grid.
 * These are those meanings: `quarter` is any corner-ish box between a quarter
 * and two thirds of each axis, `third_height` is any shallow full-width band,
 * and so on. Nothing had to be edited for the grid to get four times finer.
 */
export const PRESET_RANGES: Record<string, { range: SizeRange; nominal: Size; label: string; hint: string }> = {
  full: {
    range: { minColumns: 9, maxColumns: 12, minRows: 9, maxRows: 12 },
    nominal: { columns: 12, rows: 12 },
    label: "Full screen",
    hint: "The whole panel, or nearly.",
  },
  two_thirds_height: {
    range: { minColumns: 8, maxColumns: 12, minRows: 6, maxRows: 10 },
    nominal: { columns: 12, rows: 8 },
    label: "Tall band",
    hint: "Full width, most of the height.",
  },
  half_height: {
    range: { minColumns: 8, maxColumns: 12, minRows: 4, maxRows: 8 },
    nominal: { columns: 12, rows: 6 },
    label: "Half height",
    hint: "Full width, half the height.",
  },
  third_height: {
    range: { minColumns: 8, maxColumns: 12, minRows: 2, maxRows: 5 },
    nominal: { columns: 12, rows: 4 },
    label: "Wide band",
    hint: "Full width, shallow.",
  },
  two_thirds_width: {
    range: { minColumns: 6, maxColumns: 10, minRows: 8, maxRows: 12 },
    nominal: { columns: 8, rows: 12 },
    label: "Wide column",
    hint: "Full height, most of the width.",
  },
  half_width: {
    range: { minColumns: 4, maxColumns: 8, minRows: 8, maxRows: 12 },
    nominal: { columns: 6, rows: 12 },
    label: "Half width",
    hint: "Full height, half the width.",
  },
  third_width: {
    range: { minColumns: 2, maxColumns: 5, minRows: 8, maxRows: 12 },
    nominal: { columns: 4, rows: 12 },
    label: "Narrow column",
    hint: "Full height, narrow.",
  },
  quarter: {
    // Four columns, not three. A corner design was authored at 400px wide and
    // three columns is 200px: the sweep caught "Laptop" rendering as "L…".
    // Inheriting a range means inheriting one the author would recognise.
    range: { minColumns: 4, maxColumns: 8, minRows: 3, maxRows: 8 },
    nominal: { columns: 6, rows: 6 },
    label: "Corner",
    hint: "A box in the middle of the range, neither band nor column.",
  },
};

export function isPresetTemplate(key: string): boolean {
  return key in PRESET_RANGES;
}

/** A design for a template named after one of the original shapes. */
export function presetDesign(key: string): Design | undefined {
  const found = PRESET_RANGES[key];
  if (!found) return undefined;

  return {
    key,
    label: found.label,
    hint: found.hint,
    range: found.range,
    nominal: found.nominal,
    declared: false,
  };
}

export function covers(range: SizeRange, size: Size): boolean {
  return (
    size.columns >= range.minColumns &&
    size.columns <= range.maxColumns &&
    size.rows >= range.minRows &&
    size.rows <= range.maxRows
  );
}

/**
 * How badly a design is being stretched to draw this size.
 *
 * Squared log-ratio on each axis, so it is scale-free: drawing a 12-column
 * design at 6 columns is exactly as wrong as drawing a 6-column one at 12, and
 * a design nominally square stays square-preferring at every size.
 */
export function strain(design: Design, size: Size): number {
  return (
    Math.log(size.columns / design.nominal.columns) ** 2 +
    Math.log(size.rows / design.nominal.rows) ** 2
  );
}

/** Every design that will draw this size, least strained first. */
export function designsFor(designs: Design[], size: Size): Design[] {
  return designs
    .filter((design) => covers(design.range, size))
    .sort((a, b) => strain(a, size) - strain(b, size) || a.key.localeCompare(b.key));
}

/**
 * The design that draws a size: the one asked for when it fits, otherwise the
 * least strained.
 *
 * A widget remembers the style it was given even while it is being resized
 * through sizes that style cannot draw, so the choice is not silently lost by
 * a drag that passes through a size it does not cover - it is only overridden
 * for as long as it does not fit.
 */
export function chooseDesign(designs: Design[], size: Size, wanted?: string): Design | undefined {
  const usable = designsFor(designs, size);
  if (!usable.length) return undefined;

  return (wanted && usable.find((design) => design.key === wanted)) || usable[0];
}

export function supportsSize(designs: Design[], size: Size): boolean {
  return designs.some((design) => covers(design.range, size));
}

/** Every size on the grid this set of designs can draw. Used to grey out a picker. */
export function drawableSizes(designs: Design[]): boolean[][] {
  return Array.from({ length: ROWS }, (_, rowIndex) =>
    Array.from({ length: COLUMNS }, (_, columnIndex) =>
      supportsSize(designs, { columns: columnIndex + 1, rows: rowIndex + 1 }),
    ),
  );
}

/**
 * The nearest size to the one wanted that these designs can actually draw.
 *
 * Dragging a corner is continuous and the set of allowed sizes is not, so a
 * drag has to land somewhere sensible rather than refusing to move. Searched
 * by grid distance, which keeps a resize feeling like it follows the pointer.
 */
export function nearestDrawable(
  designs: Design[],
  wanted: Size,
  allowed: (size: Size) => boolean = () => true,
): Size | undefined {
  let best: Size | undefined;
  let bestDistance = Infinity;

  for (let rows = 1; rows <= ROWS; rows += 1) {
    for (let columns = 1; columns <= COLUMNS; columns += 1) {
      const size = { columns, rows };
      if (!supportsSize(designs, size) || !allowed(size)) continue;

      const distance = (columns - wanted.columns) ** 2 + (rows - wanted.rows) ** 2;
      if (distance < bestDistance) {
        best = size;
        bestDistance = distance;
      }
    }
  }

  return best;
}

/** The largest size these designs can draw, for a catalogue thumbnail. */
export function largestDrawable(designs: Design[]): Size | undefined {
  let best: Size | undefined;

  for (const design of designs) {
    const size = { columns: design.range.maxColumns, rows: design.range.maxRows };
    if (!best || size.columns * size.rows > best.columns * best.rows) best = size;
  }

  return best;
}

/** "between a quarter and half width, full height" - for explaining a refusal. */
export function describeRange(range: SizeRange): string {
  const columns =
    range.minColumns === range.maxColumns
      ? `${range.minColumns}`
      : `${range.minColumns}–${range.maxColumns}`;
  const rows =
    range.minRows === range.maxRows ? `${range.minRows}` : `${range.minRows}–${range.maxRows}`;

  return `${columns} × ${rows} cells`;
}

export function refusal(label: string, size: Size, designs: Design[]): string {
  if (!designs.length) return `${label} has no designs, so it cannot be drawn.`;

  return (
    `${label} has no design for ${sizeLabel(size)} (${size.columns}×${size.rows} cells). ` +
    `It draws: ${designs.map((design) => `${design.label} at ${describeRange(design.range)}`).join("; ")}.`
  );
}
