import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/settings", () => ({
  environment: async () => ({ locale: "en-GB", timezone: "UTC", timezoneOffset: 0 }),
}));

const { fingerprint } = await import("./index");
const { DEFAULT_PANEL } = await import("@/lib/panel");
import type { PlacedWidget } from "./compose";

/**
 * The bug this exists to prevent: a clock that never changes.
 *
 * A render is cached by everything that can change the picture. A clock
 * fetches nothing, so before designs could declare a tick its data never
 * changed, its fingerprint never changed, and the device was handed the
 * picture from whenever the screen was last edited - forever.
 */
const widget = (extension: string, design: string): PlacedWidget => ({
  id: 1,
  extension,
  label: extension,
  settings: {},
  data: {},
  design,
  column: 1,
  row: 1,
  columnSpan: 6,
  rowSpan: 6,
});

const at = (minutes: number) => new Date(Date.UTC(2026, 7, 27, 10, minutes));

describe("the clock in the cache key", () => {
  it("moves a clock face on when its own tick has passed", async () => {
    const face = [widget("clock", "digital")];

    const early = await fingerprint(face, DEFAULT_PANEL, [], undefined, { now: at(0) });
    const later = await fingerprint(face, DEFAULT_PANEL, [], undefined, { now: at(2) });

    expect(early).not.toBe(later);
  });

  it("holds still inside one tick, so the panel is not redrawn for nothing", async () => {
    // The readout says `tick: 60`, so two renders in the same minute are the
    // same picture and must hash the same - every changed filename costs the
    // device a redraw and a slice of battery.
    const face = [widget("clock", "digital")];

    const early = await fingerprint(face, DEFAULT_PANEL, [], undefined, {
      now: new Date(Date.UTC(2026, 7, 27, 10, 30, 1)),
    });
    const later = await fingerprint(face, DEFAULT_PANEL, [], undefined, {
      now: new Date(Date.UTC(2026, 7, 27, 10, 30, 59)),
    });

    expect(early).toBe(later);
  });

  it("keeps a face that only claims a quarter of an hour still for a quarter of an hour", async () => {
    const face = [widget("clock", "dial")];

    const early = await fingerprint(face, DEFAULT_PANEL, [], undefined, { now: at(0) });
    const soon = await fingerprint(face, DEFAULT_PANEL, [], undefined, { now: at(4) });
    const after = await fingerprint(face, DEFAULT_PANEL, [], undefined, { now: at(6) });

    // The dial declares `tick: 300`, so it changes on the five-minute mark and
    // not before it.
    expect(early).toBe(soon);
    expect(early).not.toBe(after);
  });

  it("leaves a screen that does not draw the clock out of it entirely", async () => {
    const board = [widget("revenue", "figure")];

    const early = await fingerprint(board, DEFAULT_PANEL, [], undefined, { now: at(0) });
    const later = await fingerprint(board, DEFAULT_PANEL, [], undefined, { now: at(40) });

    expect(early).toBe(later);
  });

  it("takes the finest tick on the screen, because the picture is one picture", async () => {
    const both = [widget("clock", "dial"), { ...widget("clock", "digital"), id: 2, column: 7 }];

    const early = await fingerprint(both, DEFAULT_PANEL, [], undefined, { now: at(0) });
    const later = await fingerprint(both, DEFAULT_PANEL, [], undefined, { now: at(2) });

    expect(early).not.toBe(later);
  });

  it("draws a different picture when the device sleeps for longer", async () => {
    // The refresh rate is drawn, not just obeyed - a face that says how long it
    // is claiming to be right looks different when that window changes.
    const face = [widget("clock", "dial")];

    const quarter = await fingerprint(face, DEFAULT_PANEL, [], undefined, { now: at(0), refreshSeconds: 900 });
    const hour = await fingerprint(face, DEFAULT_PANEL, [], undefined, { now: at(0), refreshSeconds: 3600 });

    expect(quarter).not.toBe(hour);
  });
});
