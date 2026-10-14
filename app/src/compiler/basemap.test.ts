import { describe, expect, it } from "vitest";
import { decodeBitmap } from "@/runtime/assets";
import { classify } from "./basemap-browser";

/** A 40 × 40 tile: land, a motorway across row 10, the sea below row 30. */
function tile(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(40 * 40 * 4);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const c = y === 10 || y === 11 ? [232, 146, 162] : y >= 30 ? [170, 211, 223] : [242, 239, 233];
      data.set([...c, 255], (y * 40 + x) * 4);
    }
  }
  return data;
}

describe("basemap", () => {
  it("draws motorways and shores, and leaves land white", () => {
    const map = decodeBitmap(classify(tile(), 40, 40, 20, 20));
    const ink = (x: number, y: number) => (map.bytes[map.data + y * map.stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
    expect(ink(10, 5)).toBe(true); // the motorway, halved
    expect(ink(10, 2)).toBe(false); // land
    expect(ink(10, 15)).toBe(true); // the shore
    expect(ink(10, 17)).toBe(false); // open water between dots
    expect(ink(8, 16)).toBe(true); // a dot of the sea's pattern
  });
});
