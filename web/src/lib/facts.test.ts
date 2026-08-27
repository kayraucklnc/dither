import { describe, expect, it } from "vitest";

import { compare, describe as sentence, operatorsFor, readFact, showFact, valueAt } from "./facts";

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

describe("a countdown, read at the moment it is asked", () => {
  const countdown = {
    key: "next_meeting_in",
    label: "Next meeting starts in",
    type: "duration" as const,
    path: "calendar.next.minutes_until",
    until: "calendar.next.at_epoch",
    unit: "minutes",
  };

  // What one fetch at 09:00 wrote about a meeting at 09:30. The stored
  // countdown says 30 for as long as the row lives; the instant does not move.
  const fetched = {
    calendar: { next: { minutes_until: 30, at_epoch: Date.parse("2026-08-27T09:30:00Z") / 1000 } },
  };

  it("counts down from the instant rather than reciting the stored number", () => {
    expect(readFact(countdown, fetched, new Date("2026-08-27T09:00:00Z"))).toBe(30);
    expect(readFact(countdown, fetched, new Date("2026-08-27T09:20:00Z"))).toBe(10);
  });

  it("reads as nothing once the moment has gone", () => {
    // The bug this pins down: a meeting that started an hour ago still read
    // "in 30 minutes", so "somewhere to be within the hour" stayed true all
    // day and the panel sat on the leaving-now screen.
    expect(readFact(countdown, fetched, new Date("2026-08-27T10:30:00Z"))).toBeUndefined();
    expect(compare(readFact(countdown, fetched, new Date("2026-08-27T10:30:00Z")), "lt", 60)).toBe(
      false,
    );
  });

  it("reads as nothing when there is nothing to count down to", () => {
    expect(readFact(countdown, { calendar: { next: null } }, new Date())).toBeUndefined();
    expect(readFact(countdown, {}, new Date())).toBeUndefined();
  });

  it("takes epoch seconds, epoch milliseconds or anything Date can parse", () => {
    const at = Date.parse("2026-08-27T09:30:00Z");
    const now = new Date("2026-08-27T09:00:00Z");

    expect(readFact(countdown, { calendar: { next: { at_epoch: at / 1000 } } }, now)).toBe(30);
    expect(readFact(countdown, { calendar: { next: { at_epoch: at } } }, now)).toBe(30);
    expect(
      readFact(countdown, { calendar: { next: { at_epoch: "2026-08-27T09:30:00Z" } } }, now),
    ).toBe(30);
  });

  it("leaves a fact that is not a countdown alone", () => {
    const plain = { key: "rain", label: "Rain", type: "number" as const, path: "w.rain", unit: "%" };
    expect(readFact(plain, { w: { rain: 33 } }, new Date())).toBe(33);
  });
});

describe("showing a fact", () => {
  const fact = (type: "boolean" | "weekday" | "number") => ({
    key: "k",
    label: "l",
    type,
    path: "p",
    unit: "",
  });

  it("says what there is, and says so when there is nothing", () => {
    expect(showFact(fact("boolean"), false)).toBe("no");
    expect(showFact(fact("boolean"), true)).toBe("yes");
    expect(showFact(fact("weekday"), 4)).toBe("Thu");
    expect(showFact(fact("number"), 0)).toBe("0");
    expect(showFact(fact("number"), undefined)).toBe("—");
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
    const duration = { key: "m", label: "Next meeting starts in", type: "duration" as const, path: "m", unit: "min" };
    const text = { key: "a", label: "Service alert", type: "text" as const, path: "a", unit: "" };

    expect(sentence(duration, "lt", 30)).toBe("Next meeting starts in is less than 30");
    expect(sentence(text, "present", null)).toBe("Service alert has any value");
  });
});

describe("time of day", () => {
  it("matches inside a window", () => {
    expect(compare("08:15", "between", ["07:00", "09:00"])).toBe(true);
    expect(compare("06:30", "between", ["07:00", "09:00"])).toBe(false);
  });

  it("handles a window that wraps past midnight", () => {
    expect(compare("23:30", "between", ["22:00", "06:00"])).toBe(true);
    expect(compare("02:00", "between", ["22:00", "06:00"])).toBe(true);
    expect(compare("12:00", "between", ["22:00", "06:00"])).toBe(false);
  });

  it("compares before and after", () => {
    expect(compare("07:59", "before", "08:00")).toBe(true);
    expect(compare("08:00", "after", "08:00")).toBe(true);
  });
});

describe("weekday and boolean", () => {
  it("matches a set of days", () => {
    expect(compare(1, "is_one_of", [1, 2, 3, 4, 5])).toBe(true);
    expect(compare(0, "is_one_of", [1, 2, 3, 4, 5])).toBe(false);
  });

  it("asks yes or no rather than comparing to a literal", () => {
    expect(compare(true, "is_true", null)).toBe(true);
    expect(compare(false, "is_true", null)).toBe(false);
    expect(compare(false, "is_false", null)).toBe(true);
    // No value at all is not the same as "no".
    expect(compare(undefined, "is_false", null)).toBe(false);
  });

  it("names the day rather than printing its number", () => {
    const weekday = { key: "d", label: "Day of week", type: "weekday" as const, path: "d", unit: "" };
    expect(sentence(weekday, "is_one_of", [1, 2, 3])).toBe("Day of week is one of Monday, Tuesday or Wednesday");
  });
});
