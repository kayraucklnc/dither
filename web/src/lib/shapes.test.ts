import { describe, expect, it } from "vitest";

import {
  COLUMNS,
  PRESETS,
  ROWS,
  fits,
  overlaps,
  parseSize,
  pixelsFor,
  preset,
  presetFor,
  sizeToken,
} from "./shapes";

describe("the grid", () => {
  it("divides evenly into halves, thirds, quarters and sixths, which is why it is twelve", () => {
    for (const divisor of [2, 3, 4, 6]) {
      expect(COLUMNS % divisor).toBe(0);
      expect(ROWS % divisor).toBe(0);
    }
  });

  it("gives every preset a unique size, so a size names at most one preset", () => {
    const sizes = PRESETS.map((entry) => `${entry.columns}x${entry.rows}`);
    expect(new Set(sizes).size).toBe(PRESETS.length);
  });

  it("keeps every preset on the grid", () => {
    for (const entry of PRESETS) {
      expect(entry.columns).toBeLessThanOrEqual(COLUMNS);
      expect(entry.rows).toBeLessThanOrEqual(ROWS);
    }
  });

  it("names a size when a preset happens to be exactly it, and not otherwise", () => {
    expect(presetFor(6, 12)?.id).toBe("half_width");
    expect(presetFor(12, 12)?.id).toBe("full");
    expect(presetFor(5, 7)).toBeUndefined();
  });

  it("converts a size to whole pixels on a panel", () => {
    expect(pixelsFor(preset("quarter")!, 800, 480)).toEqual([400, 240]);
    expect(pixelsFor(preset("third_width")!, 800, 480)).toEqual([267, 480]);
    expect(pixelsFor({ columns: 5, rows: 7 }, 800, 480)).toEqual([333, 280]);
  });
});

describe("naming a size", () => {
  it("reads a preset id and a plain WxH, because most sizes have no name", () => {
    expect(parseSize("quarter")).toEqual({ columns: 6, rows: 6 });
    expect(parseSize("5x7")).toEqual({ columns: 5, rows: 7 });
  });

  it("refuses anything off the grid, rather than clamping it into range", () => {
    expect(parseSize("13x4")).toBeUndefined();
    expect(parseSize("0x4")).toBeUndefined();
    expect(parseSize("banana")).toBeUndefined();
    expect(parseSize(null)).toBeUndefined();
  });

  it("round-trips, so a preview URL built from a size resolves back to it", () => {
    for (const size of [{ columns: 6, rows: 6 }, { columns: 5, rows: 7 }, { columns: 12, rows: 3 }]) {
      expect(parseSize(sizeToken(size))).toEqual(size);
    }
  });
});

describe("placement", () => {
  const at = (column: number, row: number, columnSpan = 6, rowSpan = 6) => ({
    column,
    row,
    columnSpan,
    rowSpan,
  });

  it("keeps widgets on the panel", () => {
    expect(fits(at(1, 1))).toBe(true);
    expect(fits(at(7, 7))).toBe(true);
    expect(fits(at(8, 1))).toBe(false);
    expect(fits(at(0, 1))).toBe(false);
    expect(fits(at(1, 1, 0, 4))).toBe(false);
  });

  it("catches widgets landing on each other", () => {
    expect(overlaps(at(1, 1), at(1, 1))).toBe(true);
    expect(overlaps(at(1, 1), at(5, 5))).toBe(true);
    expect(overlaps(at(1, 1), at(7, 1))).toBe(false);
    expect(overlaps(at(1, 1), at(1, 7))).toBe(false);
  });

  it("lets sizes the old eight could not express tile the panel exactly", () => {
    // A 5-wide feature, a 7-wide pair - none of which was a shape before.
    const placed = [at(1, 1, 5, 12), at(6, 1, 7, 5), at(6, 6, 7, 7)];

    expect(placed.every(fits)).toBe(true);
    expect(
      placed.some((one, index) => placed.slice(index + 1).some((other) => overlaps(one, other))),
    ).toBe(false);
  });
});
