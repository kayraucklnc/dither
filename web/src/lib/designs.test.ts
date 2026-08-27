import { describe, expect, it } from "vitest";

import {
  PRESET_RANGES,
  chooseDesign,
  covers,
  designsFor,
  drawableSizes,
  largestDrawable,
  nearestDrawable,
  presetDesign,
  supportsSize,
  type Design,
} from "./designs";
import { COLUMNS, ROWS } from "./shapes";

const design = (
  key: string,
  columns: [number, number],
  rows: [number, number],
  nominal: [number, number],
): Design => ({
  key,
  label: key,
  hint: "",
  range: {
    minColumns: columns[0],
    maxColumns: columns[1],
    minRows: rows[0],
    maxRows: rows[1],
  },
  nominal: { columns: nominal[0], rows: nominal[1] },
  declared: true,
  tick: 0,
});

const FIGURE = design("figure", [2, 12], [2, 12], [4, 4]);
const BOARD = design("board", [8, 12], [8, 12], [12, 12]);
const STRIP = design("strip", [6, 12], [2, 5], [12, 3]);

describe("a design's range", () => {
  it("covers a size only when both axes are inside it", () => {
    expect(covers(STRIP.range, { columns: 12, rows: 3 })).toBe(true);
    expect(covers(STRIP.range, { columns: 12, rows: 6 })).toBe(false);
    expect(covers(STRIP.range, { columns: 4, rows: 3 })).toBe(false);
  });
});

describe("choosing which design draws a size", () => {
  const all = [FIGURE, BOARD, STRIP];

  it("prefers the one being stretched least", () => {
    // 12x12 is exactly the board's nominal size and four times the figure's.
    expect(chooseDesign(all, { columns: 12, rows: 12 })?.key).toBe("board");
    // 4x4 is exactly the figure's, and the board refuses it outright.
    expect(chooseDesign(all, { columns: 4, rows: 4 })?.key).toBe("figure");
    expect(chooseDesign(all, { columns: 12, rows: 3 })?.key).toBe("strip");
  });

  it("honours the style asked for whenever it covers the size", () => {
    expect(chooseDesign(all, { columns: 12, rows: 12 }, "figure")?.key).toBe("figure");
  });

  it("falls back rather than refusing when the style cannot draw the size", () => {
    // The point of falling back rather than clearing: a drag that passes
    // through a size the chosen style refuses must not lose the choice.
    expect(chooseDesign(all, { columns: 4, rows: 4 }, "board")?.key).toBe("figure");
  });

  it("refuses a size no design covers, rather than scaling one to fit", () => {
    expect(chooseDesign([BOARD], { columns: 3, rows: 3 })).toBeUndefined();
    expect(supportsSize([BOARD], { columns: 3, rows: 3 })).toBe(false);
  });

  it("orders every design that fits, so a style picker can offer them all", () => {
    const usable = designsFor(all, { columns: 12, rows: 12 }).map((one) => one.key);
    expect(usable).toEqual(["board", "figure"]);
  });
});

describe("the sizes a set of designs can draw", () => {
  it("reports one row per grid row and one column per grid column", () => {
    const table = drawableSizes([FIGURE]);
    expect(table).toHaveLength(ROWS);
    expect(table[0]).toHaveLength(COLUMNS);
  });

  it("marks a size drawable exactly when some design covers it", () => {
    const table = drawableSizes([FIGURE]);
    expect(table[3][3]).toBe(true); // 4x4
    expect(table[0][0]).toBe(false); // 1x1 - below the figure's floor
  });

  it("finds the nearest drawable size, so a resize follows the pointer", () => {
    // 1x1 is not drawable; the closest thing the figure will draw is 2x2.
    expect(nearestDrawable([FIGURE], { columns: 1, rows: 1 })).toEqual({ columns: 2, rows: 2 });
    // Already drawable sizes are returned unchanged.
    expect(nearestDrawable([FIGURE], { columns: 7, rows: 5 })).toEqual({ columns: 7, rows: 5 });
  });

  it("respects a caller's veto, so a resize never lands on a neighbour", () => {
    const nowhere = nearestDrawable([FIGURE], { columns: 4, rows: 4 }, () => false);
    expect(nowhere).toBeUndefined();

    const onlySquare = nearestDrawable(
      [FIGURE],
      { columns: 4, rows: 4 },
      (size) => size.columns === size.rows && size.columns >= 8,
    );
    expect(onlySquare).toEqual({ columns: 8, rows: 8 });
  });

  it("names the largest size, for a catalogue thumbnail", () => {
    expect(largestDrawable([STRIP, FIGURE])).toEqual({ columns: 12, rows: 12 });
  });
});

describe("templates named after the original shapes", () => {
  it("inherit that shape's range, so nothing written before designs had to change", () => {
    const quarter = presetDesign("quarter")!;

    expect(quarter.declared).toBe(false);
    expect(covers(quarter.range, { columns: 6, rows: 6 })).toBe(true);
    expect(covers(quarter.range, { columns: 12, rows: 12 })).toBe(false);
  });

  it("leaves no gap across the sizes those extensions used to be placeable at", () => {
    const inherited = Object.keys(PRESET_RANGES).map((key) => presetDesign(key)!);

    // Every old shape, doubled onto the twelfth grid, still draws.
    for (const size of [
      { columns: 12, rows: 12 },
      { columns: 6, rows: 12 },
      { columns: 12, rows: 6 },
      { columns: 6, rows: 6 },
      { columns: 4, rows: 12 },
      { columns: 8, rows: 12 },
      { columns: 12, rows: 4 },
      { columns: 12, rows: 8 },
    ]) {
      expect(supportsSize(inherited, size)).toBe(true);
    }
  });

  it("is not a full-page design in a corner, which is the rule refusal exists for", () => {
    expect(supportsSize([presetDesign("full")!], { columns: 4, rows: 4 })).toBe(false);
  });
});
