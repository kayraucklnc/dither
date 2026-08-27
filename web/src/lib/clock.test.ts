import { describe, expect, it } from "vitest";

import { dayKey, offsetMinutes, startOfDay, startOfDaysAgo, startOfMonth, whenInWords } from "./clock";

/**
 * These are the tests that stop "what did we take today" being a day out.
 *
 * The interesting cases are all the same case: the local wall clock and the
 * server's clock disagree, and the answer has to follow the local one. Rome
 * two hours ahead of UTC, Auckland twelve ahead and a day over, and the two
 * mornings a year when the offset at midnight is not the offset now.
 */
describe("local days", () => {
  it("rolls the day over at local midnight, not the server's", () => {
    // 22:30 UTC on the 27th is already the 28th in Rome.
    const at = new Date("2026-08-27T22:30:00Z");

    expect(dayKey(at, "UTC")).toBe("2026-08-27");
    expect(dayKey(at, "Europe/Rome")).toBe("2026-08-28");
    expect(startOfDay(at, "Europe/Rome").toISOString()).toBe("2026-08-27T22:00:00.000Z");
  });

  it("handles a zone far enough east to be a whole day ahead", () => {
    const at = new Date("2026-08-27T22:30:00Z");
    expect(dayKey(at, "Pacific/Auckland")).toBe("2026-08-28");
  });

  it("handles a zone behind UTC, where the local day starts later", () => {
    const at = new Date("2026-08-27T03:30:00Z");

    expect(dayKey(at, "America/New_York")).toBe("2026-08-26");
    expect(startOfDay(at, "America/New_York").toISOString()).toBe("2026-08-26T04:00:00.000Z");
  });

  it("uses the offset in force at midnight, not the one in force now", () => {
    // Europe/Rome moves to CEST at 02:00 local on 29 March 2026. Midday that
    // day is UTC+2, but midnight was UTC+1 - so a naive "now minus the current
    // offset" lands an hour into the previous day.
    const midday = new Date("2026-03-29T12:00:00Z");

    expect(offsetMinutes(midday, "Europe/Rome")).toBe(120);
    expect(startOfDay(midday, "Europe/Rome").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(dayKey(midday, "Europe/Rome")).toBe("2026-03-29");
  });

  it("steps back whole local days across a clock change", () => {
    const after = new Date("2026-03-30T12:00:00Z");

    expect(dayKey(startOfDaysAgo(after, "Europe/Rome", 1), "Europe/Rome")).toBe("2026-03-29");
    expect(dayKey(startOfDaysAgo(after, "Europe/Rome", 2), "Europe/Rome")).toBe("2026-03-28");
    expect(dayKey(startOfDaysAgo(after, "Europe/Rome", 30), "Europe/Rome")).toBe("2026-02-28");
  });

  it("finds the first of the local month", () => {
    const at = new Date("2026-08-27T22:30:00Z");
    expect(startOfMonth(at, "Europe/Rome").toISOString()).toBe("2026-07-31T22:00:00.000Z");
    expect(startOfMonth(at, "UTC").toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("saying when", () => {
  it("changes unit as the distance grows, so nothing reads as 4320 minutes", () => {
    expect(whenInWords(20 * 60_000)).toBe("in 20 min");
    expect(whenInWords(5 * 3_600_000)).toBe("in 5 hours");
    expect(whenInWords(3 * 86_400_000)).toBe("in 3 days");
    expect(whenInWords(21 * 86_400_000)).toBe("in 3 weeks");
  });

  it("does not pretend the past is a forecast", () => {
    expect(whenInWords(0)).toBe("any moment");
    expect(whenInWords(-5000)).toBe("any moment");
  });
});
