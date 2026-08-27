import { describe, expect, it } from "vitest";

import { DEFAULT_MARKS, SCREENS, isScreen, screened, type Screen } from "./screen";

/**
 * What every screen has to be true of, whatever it looks like.
 *
 * The look is a matter of taste and is checked by looking. These are the
 * properties that are not: a screen that leaves a grey behind quietly breaks
 * the reason it is safe to reduce a picture here at all, and one that is not
 * reproducible breaks the render cache above it.
 */

const WIDTH = 24;
const HEIGHT = 16;

const flat = (value: number, width = WIDTH, height = HEIGHT) =>
  new Uint8Array(width * height).fill(value);

/** A left-to-right ramp, which is the hardest thing for a screen to be even on. */
function ramp(): Uint8Array {
  const out = new Uint8Array(WIDTH * HEIGHT);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) out[y * WIDTH + x] = Math.round((x / (WIDTH - 1)) * 255);
  }

  return out;
}

const inked = (marks: Uint8Array) => marks.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);

const reducing = SCREENS.filter((screen): screen is Screen => screen !== "panel");

describe("isScreen", () => {
  it("knows its own names and nothing else", () => {
    expect(isScreen("halftone")).toBe(true);
    expect(isScreen("panel")).toBe(true);
    expect(isScreen("crosshatch")).toBe(false);
    expect(isScreen("")).toBe(false);
  });
});

describe("every screen", () => {
  it.each(reducing)("%s leaves nothing but ink and paper", (screen) => {
    // The whole reason a picture may be reduced here rather than by the page
    // dither is that what comes back lands exactly on the panel's two values.
    // One stray grey and the pipeline has error to diffuse, and the marks
    // arrive smeared.
    const marks = screened(ramp(), WIDTH, HEIGHT, screen);

    expect(marks.length).toBe(WIDTH * HEIGHT);
    expect([...new Set(marks)].sort((a, b) => a - b)).toEqual([0, 255]);
  });

  it.each(reducing)("%s draws paper as paper and ink as ink", (screen) => {
    expect(inked(screened(flat(255), WIDTH, HEIGHT, screen))).toBe(0);
    expect(inked(screened(flat(0), WIDTH, HEIGHT, screen))).toBe(WIDTH * HEIGHT);
  });

  it.each(reducing)("%s gives the same answer twice", (screen) => {
    // A render is cached by its inputs, so a screen that reached for a random
    // number would hand the panel a different picture every time it redrew the
    // same thing.
    const once = screened(ramp(), WIDTH, HEIGHT, screen);
    const again = screened(ramp(), WIDTH, HEIGHT, screen);

    expect([...again]).toEqual([...once]);
  });

  it.each(reducing)("%s puts roughly half the ink on a mid grey", (screen) => {
    const marks = screened(flat(128, 64, 64), 64, 64, screen);
    const share = inked(marks) / marks.length;

    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.7);
  });

  it.each(reducing)("%s darkens as the picture darkens", (screen) => {
    const light = inked(screened(flat(200, 64, 64), 64, 64, screen));
    const middle = inked(screened(flat(128, 64, 64), 64, 64, screen));
    const dark = inked(screened(flat(60, 64, 64), 64, 64, screen));

    expect(middle).toBeGreaterThan(light);
    expect(dark).toBeGreaterThan(middle);
  });
});

describe("panel", () => {
  it("changes nothing, because the page dither has not run yet", () => {
    const grey = ramp();
    expect(screened(grey, WIDTH, HEIGHT, "panel")).toBe(grey);
  });
});

describe("mark size", () => {
  it("makes the ordered pattern coarser without changing how dark it is", () => {
    const fine = screened(flat(128, 64, 64), 64, 64, "ordered", 1);
    const coarse = screened(flat(128, 64, 64), 64, 64, "ordered", 4);

    // Same threshold matrix, four times the cell: the same proportion of ink,
    // in blocks rather than in single pixels.
    expect(inked(coarse)).toBe(inked(fine));
    expect([...coarse]).not.toEqual([...fine]);

    // Every pixel of a 4x4 block agrees with its top-left corner.
    for (let y = 0; y < 64; y += 4) {
      for (let x = 0; x < 64; x += 4) {
        const corner = coarse[y * 64 + x];
        expect(coarse[(y + 3) * 64 + x + 3]).toBe(corner);
      }
    }
  });

  it("is clamped rather than trusted", () => {
    // Zero would be a division by zero and a blank panel; a huge one would be
    // a single mark. Both arrive from a settings form, so neither is theoretical.
    for (const marks of [0, -3, 500, Number.NaN]) {
      const out = screened(ramp(), WIDTH, HEIGHT, "halftone", marks);
      expect([...new Set(out)].every((value) => value === 0 || value === 255)).toBe(true);
    }
  });

  it("defaults to something visible", () => {
    expect(DEFAULT_MARKS).toBeGreaterThan(1);
  });
});

describe("halftone", () => {
  it("reads a region rather than a pixel", () => {
    // A checkerboard averages to mid grey. Sampling one pixel per cell reads it
    // as pure black or pure white at random and the picture turns to confetti;
    // averaging first is what makes a dot screen stand in for a tone.
    const checks = new Uint8Array(64 * 64);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) checks[y * 64 + x] = (x + y) % 2 ? 255 : 0;
    }

    const share = inked(screened(checks, 64, 64, "halftone", 6)) / checks.length;

    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.7);
  });
});
