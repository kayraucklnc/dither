import { describe, expect, it } from "vitest";

import { windowFor } from "./range";

/**
 * "The rest of today" is a boundary in a place, not a duration.
 *
 * At 22:00 the difference is the whole point: the rest of today is two hours,
 * and the next twelve is most of tomorrow morning as well. Everything here is
 * about the end of the window landing on the right local midnight - including
 * on the two mornings a year when a local day is not twenty-four hours long.
 */

describe("where a window ends", () => {
  it("ends today at the panel's midnight, not the server's", () => {
    // 21:00 UTC is 23:00 in Rome and 22:00 in London, so "the rest of today"
    // is one hour in one place and two in the other.
    const now = new Date("2026-08-27T21:00:00Z");

    expect(windowFor({ range: "today" }, now, "Europe/Rome", "en-GB").to.toISOString()).toBe(
      "2026-08-27T22:00:00.000Z",
    );
    expect(windowFor({ range: "today" }, now, "Europe/London", "en-GB").to.toISOString()).toBe(
      "2026-08-27T23:00:00.000Z",
    );
  });

  it("reaches the end of tomorrow, not twenty-four hours out", () => {
    const now = new Date("2026-08-27T21:00:00Z");
    const window = windowFor({ range: "tomorrow" }, now, "UTC", "en-GB");

    expect(window.to.toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });

  it("ends the week on the day the locale starts one", () => {
    // Thursday 27 August 2026. A week beginning Monday ends at midnight
    // starting Monday the 31st; one beginning Sunday ends a day earlier.
    const now = new Date("2026-08-27T09:00:00Z");

    expect(windowFor({ range: "week" }, now, "UTC", "en-GB").to.toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    );
    expect(windowFor({ range: "week" }, now, "UTC", "en-US").to.toISOString()).toBe(
      "2026-08-30T00:00:00.000Z",
    );
  });

  it("ends the month at the first of the next one", () => {
    const now = new Date("2026-08-27T09:00:00Z");

    expect(windowFor({ range: "month" }, now, "UTC", "en-GB").to.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });

  it("survives the morning the clocks change", () => {
    // Europe/Rome leaves summer time at 03:00 local on 25 October 2026, so
    // that Sunday is twenty-five hours long. A window built by adding a day of
    // milliseconds lands an hour into the wrong date; this one does not.
    const now = new Date("2026-10-24T20:00:00Z");

    // Saturday the 24th ends at midnight local, which is still UTC+2.
    expect(windowFor({ range: "today" }, now, "Europe/Rome", "en-GB").to.toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
    // Sunday the 25th ends at midnight local, by then UTC+1.
    expect(windowFor({ range: "tomorrow" }, now, "Europe/Rome", "en-GB").to.toISOString()).toBe(
      "2026-10-25T23:00:00.000Z",
    );
  });

  it("still offers a rolling window, because a desk panel wants one", () => {
    const now = new Date("2026-08-27T09:00:00Z");
    const window = windowFor({ range: "hours", horizon_hours: 6 }, now, "UTC", "en-GB");

    expect(window.to.toISOString()).toBe("2026-08-27T15:00:00.000Z");
    expect(window.spansDays).toBe(false);
  });

  it("refuses an absurd number of hours rather than asking Google for a year", () => {
    const now = new Date("2026-08-27T09:00:00Z");
    const window = windowFor({ range: "hours", horizon_hours: 100000 }, now, "UTC", "en-GB");

    expect(window.to.toISOString()).toBe("2026-08-30T09:00:00.000Z");
  });

  it("says what it looked at when it found nothing", () => {
    // "Nothing scheduled" is the same sentence whether you asked about the
    // next two hours or the rest of the month, and those are very different
    // pieces of news. An empty panel has to say which question it answered.
    const now = new Date("2026-08-27T09:00:00Z");
    const said = (settings: Record<string, unknown>) =>
      windowFor(settings, now, "UTC", "en-GB").emptyLabel;

    expect(said({ range: "today" })).toBe("Nothing left today");
    expect(said({ range: "tomorrow" })).toBe("Nothing today or tomorrow");
    expect(said({ range: "week" })).toBe("Nothing this week");
    expect(said({ range: "month" })).toBe("Nothing this month");
    expect(said({ range: "hours", horizon_hours: 6 })).toBe("Nothing in the next 6 hours");
    expect(said({ range: "hours", horizon_hours: 1 })).toBe("Nothing in the next 1 hour");
  });

  it("falls back to today when the setting is missing or nonsense", () => {
    const now = new Date("2026-08-27T09:00:00Z");

    expect(windowFor({}, now, "UTC", "en-GB").key).toBe("today");
    expect(windowFor({ range: "fortnight" }, now, "UTC", "en-GB").key).toBe("today");
  });

  it("leaves a widget saved before ranges existed meaning what it meant", () => {
    // Only `horizon_hours`, no `range`: written by an older version. Reading it
    // as "the rest of today" would silently shorten somebody's panel.
    const now = new Date("2026-08-27T21:00:00Z");
    const window = windowFor({ horizon_hours: 12 }, now, "Europe/Rome", "en-GB");

    expect(window.key).toBe("hours");
    expect(window.to.toISOString()).toBe("2026-08-28T09:00:00.000Z");
  });
});

/* -------------------------------------------------------------------------- */

describe("how many days a window asks a design to draw", () => {
  const now = new Date("2026-08-27T09:00:00Z");
  const days = (settings: Record<string, unknown>) =>
    windowFor(settings, now, "UTC", "en-GB").daysAhead;

  it("is one for the rest of today", () => {
    expect(days({ range: "today" })).toBe(1);
  });

  it("is two for today and tomorrow", () => {
    expect(days({ range: "tomorrow" })).toBe(2);
  });

  it("reaches the end of the week", () => {
    // Thursday to Sunday inclusive.
    expect(days({ range: "week" })).toBe(4);
  });

  it("is bounded for a month, because a column per day stops being readable", () => {
    // The fetch still covers the month - the counts and the facts are right.
    // Only what a design is asked to draw is capped.
    expect(days({ range: "month" })).toBe(5);
    expect(days({ range: "month" })).toBeLessThanOrEqual(14);
  });
});
