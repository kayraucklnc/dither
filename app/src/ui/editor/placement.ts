// Where widgets go on the grid, and what happens when they move.

import type { Widget } from "@/project/schema";

export interface Grid {
  cols: number;
  rows: number;
}

export function clampWidget(w: Widget, grid: Grid, min: [number, number]): Widget {
  const width = Math.max(min[0], Math.min(grid.cols, w.w));
  const height = Math.max(min[1], Math.min(grid.rows, w.h));
  return {
    ...w,
    w: width,
    h: height,
    x: Math.max(0, Math.min(grid.cols - width, w.x)),
    y: Math.max(0, Math.min(grid.rows - height, w.y)),
  };
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The first free spot for a widget of this size, scanning row by row; top-left if the screen is full. */
export function freeSpot(widgets: readonly Widget[], size: [number, number], grid: Grid): { x: number; y: number; w: number; h: number } {
  const [w, h] = [Math.min(size[0], grid.cols), Math.min(size[1], grid.rows)];
  for (let y = 0; y + h <= grid.rows; y++) {
    for (let x = 0; x + w <= grid.cols; x++) {
      if (!widgets.some((o) => overlaps({ x, y, w, h }, o))) return { x, y, w, h };
    }
  }
  return { x: 0, y: 0, w, h };
}

export function overlapping(widgets: readonly Widget[]): Set<string> {
  const out = new Set<string>();
  widgets.forEach((a, i) => widgets.slice(i + 1).forEach((b) => {
    if (overlaps(a, b)) {
      out.add(a.id);
      out.add(b.id);
    }
  }));
  return out;
}
