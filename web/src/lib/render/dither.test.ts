import { describe, expect, it } from "vitest";

import { floydSteinberg, grayPalette, paletteFromCodes } from "./dither";

const solid = (width: number, height: number, value: number) =>
  Buffer.alloc(width * height * 3, value);

describe("the dither", () => {
  it("leaves pure black and pure white untouched", () => {
    const white = floydSteinberg(solid(8, 8, 255), 8, 8, 3, grayPalette(2));
    const black = floydSteinberg(solid(8, 8, 0), 8, 8, 3, grayPalette(2));

    expect([...new Set(white)]).toEqual([255]);
    expect([...new Set(black)]).toEqual([0]);
  });

  it("turns a flat mid grey into a mix of both inks, not one of them", () => {
    const output = floydSteinberg(solid(32, 32, 128), 32, 32, 3, grayPalette(2));
    const values = new Set(output);

    expect(values).toEqual(new Set([0, 255]));

    // Half grey should come out roughly half lit; this is the whole point.
    const lit = output.filter((value) => value === 255).length / output.length;
    expect(lit).toBeGreaterThan(0.4);
    expect(lit).toBeLessThan(0.6);
  });

  it("emits only palette colours", () => {
    const palette = paletteFromCodes(["#000000", "#ffffff", "#ff0000"]);
    const output = floydSteinberg(solid(16, 16, 100), 16, 16, 3, palette);

    for (let at = 0; at < output.length; at += 3) {
      const pixel = [output[at], output[at + 1], output[at + 2]];
      expect(palette.colors).toContainEqual(pixel);
    }
  });

  it("reads four channel input, ignoring alpha", () => {
    const rgba = Buffer.alloc(4 * 4 * 4);
    for (let at = 0; at < rgba.length; at += 4) {
      rgba[at] = 255;
      rgba[at + 1] = 255;
      rgba[at + 2] = 255;
      rgba[at + 3] = 255;
    }

    const output = floydSteinberg(rgba, 4, 4, 4, grayPalette(2));

    expect(output.length).toBe(4 * 4 * 3);
    expect([...new Set(output)]).toEqual([255]);
  });

  it("falls back to black and white when the palette codes are unusable", () => {
    expect(paletteFromCodes(["nonsense"]).colors).toEqual(grayPalette(2).colors);
  });
});
