import { describe, expect, it } from "vitest";

import { COLUMNS, ROWS, SHAPES, fits, overlaps, pixelsFor, shape, shapeForSize } from "./shapes";

describe("the grid", () => {
  it("divides evenly into halves and thirds, which is why it is six", () => {
    expect(COLUMNS % 2).toBe(0);
    expect(COLUMNS % 3).toBe(0);
    expect(ROWS % 2).toBe(0);
    expect(ROWS % 3).toBe(0);
  });

  it("gives every shape a unique size, so a size names exactly one shape", () => {
    const sizes = SHAPES.map((candidate) => `${candidate.columns}x${candidate.rows}`);
    expect(new Set(sizes).size).toBe(SHAPES.length);
  });

  it("derives the shape from the size a widget was drawn at", () => {
    expect(shapeForSize(3, 6)?.id).toBe("half_width");
    expect(shapeForSize(6, 6)?.id).toBe("full");
    expect(shapeForSize(2, 6)?.id).toBe("third_width");
    expect(shapeForSize(5, 4)).toBeUndefined();
  });

  it("converts a shape to whole pixels on a panel", () => {
    expect(pixelsFor(shape("quarter")!, 800, 480)).toEqual([400, 240]);
    expect(pixelsFor(shape("third_width")!, 800, 480)).toEqual([267, 480]);
  });
});

describe("placement", () => {
  const at = (column: number, row: number, columnSpan = 3, rowSpan = 3) => ({
    column,
    row,
    columnSpan,
    rowSpan,
  });

  it("keeps widgets on the panel", () => {
    expect(fits(at(1, 1))).toBe(true);
    expect(fits(at(4, 4))).toBe(true);
    expect(fits(at(5, 1))).toBe(false);
    expect(fits(at(0, 1))).toBe(false);
  });

  it("catches widgets landing on each other", () => {
    expect(overlaps(at(1, 1), at(1, 1))).toBe(true);
    expect(overlaps(at(1, 1), at(3, 3))).toBe(true);
    expect(overlaps(at(1, 1), at(4, 1))).toBe(false);
    expect(overlaps(at(1, 1), at(1, 4))).toBe(false);
  });

  it("lets a half and two quarters fill the panel exactly", () => {
    const placed = [at(1, 1, 3, 6), at(4, 1, 3, 3), at(4, 4, 3, 3)];

    expect(placed.every(fits)).toBe(true);
    expect(
      placed.some((one, index) => placed.slice(index + 1).some((other) => overlaps(one, other))),
    ).toBe(false);
  });
});
