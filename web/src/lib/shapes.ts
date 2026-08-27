/**
 * The composition vocabulary.
 *
 * A screen is a 6x6 grid. Six is the smallest number of tracks where halves
 * and thirds both divide evenly, which is why a widget can be half a screen
 * or a third of one without any fractional columns.
 *
 * A widget does not choose a "shape" from a menu. It is dragged to a size on
 * the grid, and the shape is whatever that size means. Shapes exist so an
 * extension can say which sizes it knows how to draw - and so we can refuse
 * the ones it does not, rather than scaling a design that was never meant to
 * be that size.
 */

export const COLUMNS = 6;
export const ROWS = 6;

export type ShapeId =
  | "full"
  | "half_width"
  | "half_height"
  | "quarter"
  | "third_width"
  | "two_thirds_width"
  | "third_height"
  | "two_thirds_height";

export interface Shape {
  readonly id: ShapeId;
  readonly label: string;
  readonly columns: number;
  readonly rows: number;
  readonly hint: string;
}

export const SHAPES: readonly Shape[] = [
  { id: "full", label: "Full screen", columns: 6, rows: 6, hint: "The whole panel." },
  { id: "half_width", label: "Half width", columns: 3, rows: 6, hint: "Left or right half, full height." },
  { id: "half_height", label: "Half height", columns: 6, rows: 3, hint: "Top or bottom half, full width." },
  { id: "quarter", label: "Quarter", columns: 3, rows: 3, hint: "One corner." },
  { id: "third_width", label: "Third width", columns: 2, rows: 6, hint: "A narrow full-height column." },
  { id: "two_thirds_width", label: "Two thirds width", columns: 4, rows: 6, hint: "The wide side of a sidebar." },
  { id: "third_height", label: "Third height", columns: 6, rows: 2, hint: "A full-width band." },
  { id: "two_thirds_height", label: "Two thirds height", columns: 6, rows: 4, hint: "The tall side of a banner." },
] as const;

const BY_ID = new Map(SHAPES.map((shape) => [shape.id, shape]));
const BY_SIZE = new Map(SHAPES.map((shape) => [`${shape.columns}x${shape.rows}`, shape]));

export function shape(id: string): Shape | undefined {
  return BY_ID.get(id as ShapeId);
}

export function isShapeId(id: string): id is ShapeId {
  return BY_ID.has(id as ShapeId);
}

/** The shape a widget takes on because of the size it was drawn at. */
export function shapeForSize(columns: number, rows: number): Shape | undefined {
  return BY_SIZE.get(`${columns}x${rows}`);
}

/** Pixel size of a shape on a given panel. */
export function pixelsFor(shape: Shape, panelWidth: number, panelHeight: number): [number, number] {
  return [
    Math.round((panelWidth * shape.columns) / COLUMNS),
    Math.round((panelHeight * shape.rows) / ROWS),
  ];
}

/**
 * Shapes that share an aspect class.
 *
 * A design authored for one wide band works in a taller wide band: it is the
 * same markup reflowing in a box of a similar proportion, which the layout
 * primitives already handle. That is not the same as scaling a full-page
 * design into a corner, which is what the refusal rule exists to prevent - so
 * an extension covers its family, and only its family, for free.
 *
 * An author who wants a different design at a different height still writes
 * one; an exact template always wins over a family match.
 */
export const FAMILIES: Record<string, ShapeId[]> = {
  full: ["full"],
  band: ["third_height", "half_height", "two_thirds_height"],
  column: ["third_width", "half_width", "two_thirds_width"],
  block: ["quarter"],
};

const FAMILY_OF = new Map<ShapeId, string>(
  Object.entries(FAMILIES).flatMap(([family, members]) =>
    members.map((member) => [member, family] as [ShapeId, string]),
  ),
);

export function familyOf(id: ShapeId): string | undefined {
  return FAMILY_OF.get(id);
}

/**
 * Which authored shape should draw `wanted`: itself if it exists, otherwise
 * the nearest one in its family by area.
 */
export function standIn(wanted: ShapeId, authored: ShapeId[]): ShapeId | undefined {
  if (authored.includes(wanted)) return wanted;

  const family = FAMILY_OF.get(wanted);
  const target = shape(wanted);
  if (!family || !target) return undefined;

  const area = target.columns * target.rows;

  return authored
    .filter((candidate) => FAMILY_OF.get(candidate) === family)
    .map((candidate) => ({ candidate, shape: shape(candidate)! }))
    .sort(
      (a, b) =>
        Math.abs(a.shape.columns * a.shape.rows - area) -
        Math.abs(b.shape.columns * b.shape.rows - area),
    )
    .map(({ candidate }) => candidate)[0];
}

export interface Rect {
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

/** Whether a rect sits inside the grid. */
export function fits(rect: Rect): boolean {
  return (
    rect.column >= 1 &&
    rect.row >= 1 &&
    rect.column + rect.columnSpan - 1 <= COLUMNS &&
    rect.row + rect.rowSpan - 1 <= ROWS
  );
}

/** Whether two rects share any cell. Used to stop widgets landing on each other. */
export function overlaps(one: Rect, other: Rect): boolean {
  return (
    one.column < other.column + other.columnSpan &&
    other.column < one.column + one.columnSpan &&
    one.row < other.row + other.rowSpan &&
    other.row < one.row + one.rowSpan
  );
}

/** Pixel rectangle of a placed widget on a panel, for cropping a render. */
export function rectPixels(rect: Rect, panelWidth: number, panelHeight: number) {
  const cell = { width: panelWidth / COLUMNS, height: panelHeight / ROWS };

  return {
    x: Math.round((rect.column - 1) * cell.width),
    y: Math.round((rect.row - 1) * cell.height),
    width: Math.round(rect.columnSpan * cell.width),
    height: Math.round(rect.rowSpan * cell.height),
  };
}
