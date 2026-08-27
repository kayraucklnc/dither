import { describe, expect, it } from "vitest";

import { compare, describe as sentence, operatorsFor, valueAt } from "./facts";

describe("reading a fact out of fetched data", () => {
  it("walks a dotted path", () => {
    expect(valueAt({ source_1: { current: { temp: 7.4 } } }, "source_1.current.temp")).toBe(7.4);
  });

  it("indexes an array with a numeric step", () => {
    const data = { transit: { departures: [{ minutes_until: 6 }, { minutes_until: 21 }] } };
    expect(valueAt(data, "transit.departures.0.minutes_until")).toBe(6);
    expect(valueAt(data, "transit.departures.1.minutes_until")).toBe(21);
  });

  it("answers undefined rather than throwing when the path runs out", () => {
    expect(valueAt({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(valueAt(null, "a")).toBeUndefined();
  });
});

describe("comparing", () => {
  it("treats missing data as not matching, so a dead API leaves the screen alone", () => {
    expect(compare(undefined, "lt", 30)).toBe(false);
    expect(compare(null, "gt", 0)).toBe(false);
    expect(compare("", "eq", "")).toBe(false);
  });

  it("still answers present and absent when there is no value", () => {
    expect(compare(undefined, "absent", null)).toBe(true);
    expect(compare(undefined, "present", null)).toBe(false);
    expect(compare(0, "present", null)).toBe(true);
  });

  it("compares numbers written as strings, which is what a template yields", () => {
    expect(compare(6, "lt", "30")).toBe(true);
    expect(compare("6", "lt", 30)).toBe(true);
    expect(compare("31", "lt", "30")).toBe(false);
  });

  it("matches text case-insensitively", () => {
    expect(compare("Milano Centrale", "contains", "milano")).toBe(true);
    expect(compare("Zoom", "contains", "milano")).toBe(false);
    expect(compare("S3", "eq", "s3")).toBe(true);
  });

  it("understands booleans however they arrive", () => {
    expect(compare(true, "eq", "true")).toBe(true);
    expect(compare("false", "eq", false)).toBe(true);
  });
});

describe("what the editor may offer", () => {
  it("never offers a comparison the type cannot answer", () => {
    const duration = operatorsFor("duration").map((operator) => operator.id);

    expect(duration).toContain("lt");
    // "contains" on a duration would build a rule that can never be true.
    expect(duration).not.toContain("contains");
    expect(operatorsFor("text").map((o) => o.id)).not.toContain("gt");
  });

  it("reads a condition back as a sentence", () => {
    expect(sentence("Next meeting starts in", "lt", 30)).toBe("Next meeting starts in is less than 30");
    expect(sentence("Service alert", "present", null)).toBe("Service alert has any value");
  });
});
