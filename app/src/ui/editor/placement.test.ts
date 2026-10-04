import { describe, expect, it } from "vitest";
import { clampWidget, freeSpot, overlapping } from "./placement";

const w = (id: string, x: number, y: number, width: number, h: number) => ({ id, type: "text", x, y, w: width, h, frame: "none" as const, settings: {} });
const grid = { cols: 20, rows: 12 };

describe("placement", () => {
  it("keeps a widget on the grid and at least its minimum size", () => {
    expect(clampWidget(w("a", 18, 11, 6, 4), grid, [2, 2])).toMatchObject({ x: 14, y: 8, w: 6, h: 4 });
    expect(clampWidget(w("a", -3, 0, 1, 1), grid, [3, 2])).toMatchObject({ x: 0, w: 3, h: 2 });
  });
  it("finds the first free spot", () => {
    expect(freeSpot([w("a", 0, 0, 10, 12)], [5, 4], grid)).toEqual({ x: 10, y: 0, w: 5, h: 4 });
    expect(freeSpot([w("a", 0, 0, 20, 12)], [5, 4], grid)).toEqual({ x: 0, y: 0, w: 5, h: 4 });
  });
  it("reports overlaps", () => {
    expect([...overlapping([w("a", 0, 0, 5, 5), w("b", 4, 4, 2, 2), w("c", 10, 0, 2, 2)])].sort()).toEqual(["a", "b"]);
  });
});
