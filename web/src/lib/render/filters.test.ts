import { describe, expect, it } from "vitest";

import { renderTemplate } from "./liquid";
import type { Extension } from "@/lib/extensions/registry";

/**
 * The filters exist so that a design is a layout problem rather than a
 * hundred lines of arithmetic in a templating language. They are checked
 * through a real render, because that is the only place their names, their
 * argument order and their output all have to agree.
 */
const extension = {
  name: "test",
  manifest: { label: "Test" },
} as unknown as Extension;

const render = (template: string, settings: Record<string, unknown> = {}) =>
  renderTemplate(template, { extension, settings, data: {} });

describe("clock-face geometry", () => {
  it("measures angles the way a clock face does: zero at twelve, clockwise", async () => {
    // Twelve o'clock is straight up, so the point is directly above the centre.
    expect(await render("{{ 0 | cos_of }},{{ 0 | sin_of }}")).toBe("0,-1");
    // Three o'clock is to the right.
    expect(await render("{{ 90 | cos_of }},{{ 90 | sin_of }}")).toBe("1,0");
    expect(await render("{{ 180 | cos_of }},{{ 180 | sin_of }}")).toBe("0,1");
  });
});

describe("time in words", () => {
  it("hedges by the window it is given", async () => {
    expect(await render("{{ 607 | time_in_words: 15 }}")).toBe("after ten o'clock");
    expect(await render("{{ 607 | time_in_words: 5 }}")).toBe("just gone ten o'clock");
  });

  it("names the part of the day, and says how long a span is", async () => {
    expect(await render("{{ 900 | part_of_day }}")).toBe("afternoon");
    expect(await render("{{ 260 | span_in_words }}")).toBe("4h 20m");
  });
});

describe("minutes_of", () => {
  it("turns a time setting into arithmetic", async () => {
    expect(await render('{{ "07:30" | minutes_of }}')).toBe("450");
    expect(await render('{{ "" | minutes_of }}')).toBe("0");
  });
});

describe("through_day", () => {
  it("measures the way through a waking day", async () => {
    expect(await render("{{ 900 | through_day: 420, 1380 }}")).toBe("50");
  });
});

describe("the window a design has to survive", () => {
  it("is on the context, in both the units a template thinks in", async () => {
    const shown = await renderTemplate(
      "{{ dither.refresh_seconds }}/{{ dither.window_minutes }}",
      { extension, settings: {}, data: {}, refreshSeconds: 900 },
    );

    expect(shown).toBe("900/15");
  });

  it("defaults to a quarter of an hour, which is what a panel does", async () => {
    expect(await render("{{ dither.window_minutes }}")).toBe("15");
  });
});
