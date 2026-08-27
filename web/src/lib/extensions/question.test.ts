import { describe, expect, it } from "vitest";

import { canonicalSettings, sameQuestion } from "./question";

/**
 * The bug this exists to prevent: "Also watch this" filing the same source
 * again on every click.
 *
 * Settings go into Postgres as jsonb and come back in *its* key order -
 * shortest first, then bytewise - while a browser holds them in the order the
 * form built them. Both sides compared the two as JSON, found a difference
 * that was not one, and neither the button nor the guard behind it ever
 * noticed the question had already been asked.
 */
describe("the same question", () => {
  it("does not care what order the settings are written in", () => {
    const held = { latitude: "45.4642", longitude: "9.19", place: "Milan", units: "celsius" };
    // What Postgres hands back: place, units, latitude, longitude.
    const stored = { place: "Milan", units: "celsius", latitude: "45.4642", longitude: "9.19" };

    expect(sameQuestion({ extension: "weather", settings: held }, { extension: "weather", settings: stored })).toBe(true);
  });

  it("separates questions that differ in any answer", () => {
    expect(
      sameQuestion(
        { extension: "weather", settings: { place: "Milan" } },
        { extension: "weather", settings: { place: "Rome" } },
      ),
    ).toBe(false);
  });

  it("separates a setting that is absent from one that is empty", () => {
    // A widget with no heading and one with a blank heading ask the world the
    // same thing, but they are not the same configuration, and merging them
    // would quietly rewrite somebody's settings.
    expect(
      sameQuestion(
        { extension: "weather", settings: { place: "Milan" } },
        { extension: "weather", settings: { place: "Milan", heading: "" } },
      ),
    ).toBe(false);
  });

  it("separates the same settings asked of different extensions", () => {
    expect(
      sameQuestion(
        { extension: "weather", settings: { place: "Milan" } },
        { extension: "markets", settings: { place: "Milan" } },
      ),
    ).toBe(false);
  });

  it("treats nothing and no settings at all as one question", () => {
    expect(
      sameQuestion({ extension: "clock", settings: {} }, { extension: "clock", settings: null }),
    ).toBe(true);
  });

  it("leaves a list alone, because its order is already settled where it is stored", () => {
    // A multiselect is sorted before it is saved, so two orders here are two
    // different values rather than one written twice.
    expect(canonicalSettings({ calendars: ["a", "b"] })).not.toBe(
      canonicalSettings({ calendars: ["b", "a"] }),
    );
  });
});
