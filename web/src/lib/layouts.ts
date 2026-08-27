import type { Rect } from "@/lib/shapes";

/**
 * Ready-made arrangements.
 *
 * A screen is still just widgets on a 6x6 grid - these are not a separate
 * concept the renderer knows about. They exist because "top half this, bottom
 * half that" should be one click and then two clicks, not a drag, a resize,
 * another drag and a nudge.
 *
 * Picking one arms the slots: the next widget you add lands in the next free
 * one, at that slot's size.
 */
export interface Layout {
  id: string;
  label: string;
  hint: string;
  slots: Rect[];
}

const at = (column: number, row: number, columnSpan: number, rowSpan: number): Rect => ({
  column,
  row,
  columnSpan,
  rowSpan,
});

export const LAYOUTS: Layout[] = [
  { id: "full", label: "One", hint: "A single design across the panel", slots: [at(1, 1, 6, 6)] },
  {
    id: "side_by_side",
    label: "Side by side",
    hint: "Two full-height halves",
    slots: [at(1, 1, 3, 6), at(4, 1, 3, 6)],
  },
  {
    id: "stacked",
    label: "Stacked",
    hint: "Top half and bottom half",
    slots: [at(1, 1, 6, 3), at(1, 4, 6, 3)],
  },
  {
    id: "quadrants",
    label: "Quarters",
    hint: "Four corners",
    slots: [at(1, 1, 3, 3), at(4, 1, 3, 3), at(1, 4, 3, 3), at(4, 4, 3, 3)],
  },
  {
    id: "sidebar",
    label: "Sidebar",
    hint: "A narrow column beside a wide one",
    slots: [at(1, 1, 2, 6), at(3, 1, 4, 6)],
  },
  {
    id: "banner",
    label: "Banner",
    hint: "A band across the top, the rest below",
    slots: [at(1, 1, 6, 2), at(1, 3, 6, 4)],
  },
  {
    id: "thirds",
    label: "Thirds",
    hint: "Three full-height columns",
    slots: [at(1, 1, 2, 6), at(3, 1, 2, 6), at(5, 1, 2, 6)],
  },
  {
    id: "one_and_two",
    label: "Feature and two",
    hint: "A tall half, two quarters beside it",
    slots: [at(1, 1, 3, 6), at(4, 1, 3, 3), at(4, 4, 3, 3)],
  },
];

export function layout(id: string): Layout | undefined {
  return LAYOUTS.find((candidate) => candidate.id === id);
}

/** The layout whose slots exactly match what is already placed, if any. */
export function matching(rects: Rect[]): Layout | undefined {
  const key = (list: Rect[]) =>
    [...list]
      .map((rect) => `${rect.column},${rect.row},${rect.columnSpan},${rect.rowSpan}`)
      .sort()
      .join("|");

  const wanted = key(rects);
  return LAYOUTS.find((candidate) => key(candidate.slots) === wanted);
}
