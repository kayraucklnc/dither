// The editor's grid. A widget occupies whole cells; the compiler turns cells
// into pixels, leaving a gutter so neighbouring widgets never touch.

import type { Box } from "@/extensions/api";

export const CELL = 40;
export const GUTTER = 6;
/** Extra inset inside an outlined or inverted widget. */
export const FRAME_PADDING = 12;

export interface Panel {
  width: number;
  height: number;
}

export function rotated(panel: Panel, rotation: number): Panel {
  return rotation === 90 || rotation === 270 ? { width: panel.height, height: panel.width } : panel;
}

export function gridOf(panel: Panel): { cols: number; rows: number } {
  return { cols: Math.floor(panel.width / CELL), rows: Math.floor(panel.height / CELL) };
}

/** Pixel box of a widget's cells, gutter applied. */
export function cellsToBox(x: number, y: number, w: number, h: number, panel: Panel): Box {
  // Spread any remainder so the grid is centred on panels that are not a multiple of CELL.
  const { cols, rows } = gridOf(panel);
  const ox = Math.floor((panel.width - cols * CELL) / 2);
  const oy = Math.floor((panel.height - rows * CELL) / 2);
  return {
    x: ox + x * CELL + GUTTER,
    y: oy + y * CELL + GUTTER,
    w: w * CELL - 2 * GUTTER,
    h: h * CELL - 2 * GUTTER,
  };
}
