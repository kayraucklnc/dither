/**
 * The composition grid.
 *
 * A screen is a 12x12 grid. Twelve is the smallest number that divides evenly
 * by two, three, four and six, so halves, thirds, quarters and sixths all land
 * on whole tracks - and at 800x480 one cell is 67x40 pixels, fine enough that
 * a widget can be nudged a cell at a time rather than jumping between eight
 * fixed sizes.
 *
 * A widget does not pick a "shape" from a menu. It is drawn at a size on this
 * grid, and *any* size is expressible. What decides whether a size is allowed
 * is the extension: it declares designs, each covering a range of sizes, and a
 * size no design covers is refused rather than scaled. See lib/designs.ts.
 *
 * Presets below are shortcuts, not a vocabulary. They exist so "half width" is
 * one click; they constrain nothing.
 */

export const COLUMNS = 12;
export const ROWS = 12;

export interface Size {
  readonly columns: number;
  readonly rows: number;
}

export interface Preset extends Size {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

/**
 * One-click sizes.
 *
 * The eight original names are kept, at their twelfth-grid equivalents, so
 * `templates/quarter.html.liquid` still means what it always meant and a
 * preview URL of `?size=quarter` still resolves. The rest are sizes the finer
 * grid made worth naming.
 */
export const PRESETS: readonly Preset[] = [
  { id: "full", label: "Full screen", columns: 12, rows: 12, hint: "The whole panel." },
  { id: "half_width", label: "Half width", columns: 6, rows: 12, hint: "Left or right half, full height." },
  { id: "half_height", label: "Half height", columns: 12, rows: 6, hint: "Top or bottom half, full width." },
  { id: "quarter", label: "Quarter", columns: 6, rows: 6, hint: "One corner." },
  { id: "third_width", label: "Third width", columns: 4, rows: 12, hint: "A narrow full-height column." },
  { id: "two_thirds_width", label: "Two thirds width", columns: 8, rows: 12, hint: "The wide side of a sidebar." },
  { id: "third_height", label: "Third height", columns: 12, rows: 4, hint: "A full-width band." },
  { id: "two_thirds_height", label: "Two thirds height", columns: 12, rows: 8, hint: "The tall side of a banner." },
  { id: "narrow_column", label: "Narrow column", columns: 3, rows: 12, hint: "A quarter-width full-height strip." },
  { id: "slim_band", label: "Slim band", columns: 12, rows: 3, hint: "A shallow full-width band." },
  { id: "card", label: "Card", columns: 6, rows: 4, hint: "A wide box, a third of the height." },
  { id: "tile", label: "Tile", columns: 4, rows: 4, hint: "A small square." },
  { id: "sixth", label: "Sixth", columns: 4, rows: 6, hint: "A narrow half-height box." },
] as const;

const BY_ID = new Map(PRESETS.map((entry) => [entry.id, entry]));
const BY_SIZE = new Map(PRESETS.map((entry) => [`${entry.columns}x${entry.rows}`, entry]));

export function preset(id: string): Preset | undefined {
  return BY_ID.get(id);
}

export function isPresetId(id: string): boolean {
  return BY_ID.has(id);
}

/** The preset a size happens to be, if it is exactly one. Only ever a label. */
export function presetFor(columns: number, rows: number): Preset | undefined {
  return BY_SIZE.get(`${columns}x${rows}`);
}

export const sameSize = (one: Size, other: Size) =>
  one.columns === other.columns && one.rows === other.rows;

/**
 * A size out of a token: a preset id, or "6x4".
 *
 * Preview URLs and scripts name sizes as text, and both spellings have to work
 * - the named one because it reads, the numeric one because with a free grid
 * most sizes have no name.
 */
export function parseSize(token: string | null | undefined): Size | undefined {
  if (!token) return undefined;

  const named = BY_ID.get(token);
  if (named) return { columns: named.columns, rows: named.rows };

  const match = /^(\d{1,2})x(\d{1,2})$/.exec(token.trim());
  if (!match) return undefined;

  const columns = Number(match[1]);
  const rows = Number(match[2]);

  if (columns < 1 || columns > COLUMNS || rows < 1 || rows > ROWS) return undefined;
  return { columns, rows };
}

/** The canonical text for a size. A preset id where there is one, else "6x4". */
export function sizeToken(size: Size): string {
  return presetFor(size.columns, size.rows)?.id ?? `${size.columns}x${size.rows}`;
}

/** What to call a size in a sentence. */
export function sizeLabel(size: Size): string {
  return presetFor(size.columns, size.rows)?.label ?? `${size.columns}×${size.rows}`;
}

/** Pixel size of a grid size on a given panel. */
export function pixelsFor(size: Size, panelWidth: number, panelHeight: number): [number, number] {
  return [
    Math.round((panelWidth * size.columns) / COLUMNS),
    Math.round((panelHeight * size.rows) / ROWS),
  ];
}

export interface Rect {
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

/** The size a rect occupies. Rects carry their span; everything else wants a size. */
export const sizeOf = (rect: { columnSpan: number; rowSpan: number }): Size => ({
  columns: rect.columnSpan,
  rows: rect.rowSpan,
});

/** Whether a rect sits inside the grid. */
export function fits(rect: { column: number; row: number; columnSpan: number; rowSpan: number }): boolean {
  return (
    rect.column >= 1 &&
    rect.row >= 1 &&
    rect.columnSpan >= 1 &&
    rect.rowSpan >= 1 &&
    rect.column + rect.columnSpan - 1 <= COLUMNS &&
    rect.row + rect.rowSpan - 1 <= ROWS
  );
}

/** Whether two rects share any cell. Used to stop widgets landing on each other. */
export function overlaps(
  one: { column: number; row: number; columnSpan: number; rowSpan: number },
  other: { column: number; row: number; columnSpan: number; rowSpan: number },
): boolean {
  return (
    one.column < other.column + other.columnSpan &&
    other.column < one.column + one.columnSpan &&
    one.row < other.row + other.rowSpan &&
    other.row < one.row + one.rowSpan
  );
}

/** Pixel rectangle of a placed widget on a panel, for cropping a render. */
export function rectPixels(
  rect: { column: number; row: number; columnSpan: number; rowSpan: number },
  panelWidth: number,
  panelHeight: number,
) {
  const cell = { width: panelWidth / COLUMNS, height: panelHeight / ROWS };

  return {
    x: Math.round((rect.column - 1) * cell.width),
    y: Math.round((rect.row - 1) * cell.height),
    width: Math.round(rect.columnSpan * cell.width),
    height: Math.round(rect.rowSpan * cell.height),
  };
}
