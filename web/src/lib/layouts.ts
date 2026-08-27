import type { Rect } from "@/lib/shapes";

/**
 * Ready-made arrangements.
 *
 * A screen is still just widgets on a 12x12 grid - these are not a separate
 * concept the renderer knows about. They exist because "top half this, bottom
 * half that" should be one click and then two clicks, not a drag, a resize,
 * another drag and a nudge.
 *
 * Picking one arms the slots: the next widget you add lands in the next free
 * one, at that slot's size. Nothing stops you dragging away from it afterwards
 * - the grid is free, and a layout is a starting point rather than a mould.
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
  { id: "full", label: "One", hint: "A single design across the panel", slots: [at(1, 1, 12, 12)] },
  {
    id: "side_by_side",
    label: "Side by side",
    hint: "Two full-height halves",
    slots: [at(1, 1, 6, 12), at(7, 1, 6, 12)],
  },
  {
    id: "stacked",
    label: "Stacked",
    hint: "Top half and bottom half",
    slots: [at(1, 1, 12, 6), at(1, 7, 12, 6)],
  },
  {
    id: "quadrants",
    label: "Quarters",
    hint: "Four corners",
    slots: [at(1, 1, 6, 6), at(7, 1, 6, 6), at(1, 7, 6, 6), at(7, 7, 6, 6)],
  },
  {
    id: "sidebar",
    label: "Sidebar",
    hint: "A narrow column beside a wide one",
    slots: [at(1, 1, 4, 12), at(5, 1, 8, 12)],
  },
  {
    id: "banner",
    label: "Banner",
    hint: "A band across the top, the rest below",
    slots: [at(1, 1, 12, 4), at(1, 5, 12, 8)],
  },
  {
    id: "thirds",
    label: "Thirds",
    hint: "Three full-height columns",
    slots: [at(1, 1, 4, 12), at(5, 1, 4, 12), at(9, 1, 4, 12)],
  },
  {
    id: "one_and_two",
    label: "Feature and two",
    hint: "A tall half, two quarters beside it",
    slots: [at(1, 1, 6, 12), at(7, 1, 6, 6), at(7, 7, 6, 6)],
  },
  /* The twelfth grid pays for itself in these: none of them was expressible
     when a widget could only be one of eight sizes. */
  {
    id: "headline_and_strip",
    label: "Headline and strip",
    hint: "A tall feature over a shallow band",
    slots: [at(1, 1, 12, 9), at(1, 10, 12, 3)],
  },
  {
    id: "six_tiles",
    label: "Six tiles",
    hint: "Three across, two down",
    slots: [
      at(1, 1, 4, 6), at(5, 1, 4, 6), at(9, 1, 4, 6),
      at(1, 7, 4, 6), at(5, 7, 4, 6), at(9, 7, 4, 6),
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    hint: "A wide feature with three figures down the side",
    slots: [at(1, 1, 8, 12), at(9, 1, 4, 4), at(9, 5, 4, 4), at(9, 9, 4, 4)],
  },
  {
    id: "band_and_thirds",
    label: "Band and thirds",
    hint: "A band on top, three boxes under it",
    slots: [at(1, 1, 12, 4), at(1, 5, 4, 8), at(5, 5, 4, 8), at(9, 5, 4, 8)],
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
