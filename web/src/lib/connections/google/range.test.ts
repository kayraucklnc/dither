import { describe, expect, it } from "vitest";

import { agenda } from "./agenda";
import type { GoogleEvent } from "./api";
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

const timed = (from: string, to: string, summary: string): GoogleEvent => ({
  summary,
  start: { dateTime: from },
  end: { dateTime: to },
});

describe("a window that covers more than one day", () => {
  const now = new Date("2026-08-27T09:00:00Z");

  const week = (events: GoogleEvent[]) =>
    agenda(events, {
      now,
      timezone: "UTC",
      locale: "en-GB",
      window: windowFor({ range: "week" }, now, "UTC", "en-GB"),
      hideDeclined: true,
    });

  it("groups by local day, keeping the quiet ones", () => {
    // A week with a hole in it is a week you can see the hole in. Dropping the
    // empty days would make Friday look like it follows Thursday's meeting.
    const day = week([
      timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", "Design review"),
      timed("2026-08-29T14:00:00Z", "2026-08-29T15:00:00Z", "Sprint planning"),
    ]);

    expect(day.days.map((one) => one.date)).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
    expect(day.days[0].events.map((one) => one.title)).toEqual(["Design review"]);
    expect(day.days[1].empty).toBe(true);
    expect(day.days[2].events.map((one) => one.title)).toEqual(["Sprint planning"]);
  });

  it("marks today and tomorrow, so a design can name them rather than date them", () => {
    const day = week([]);

    expect(day.days[0]).toMatchObject({ today: true, tomorrow: false, day: "Thu" });
    expect(day.days[1]).toMatchObject({ today: false, tomorrow: true, day: "Fri" });
  });

  it("puts a multi-day all-day entry on every day it covers", () => {
    const day = week([
      { summary: "Annual leave", start: { date: "2026-08-28" }, end: { date: "2026-08-30" } },
    ]);

    expect(day.days.map((one) => one.all_day.map((entry) => entry.title))).toEqual([
      [],
      ["Annual leave"],
      ["Annual leave"],
      [],
    ]);
  });

  it("keeps remaining_today about today even when the window is a month", () => {
    const day = agenda(
      [
        timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", "Today"),
        timed("2026-08-30T10:00:00Z", "2026-08-30T11:00:00Z", "Later"),
      ],
      {
        now,
        timezone: "UTC",
        locale: "en-GB",
        window: windowFor({ range: "month" }, now, "UTC", "en-GB"),
        hideDeclined: true,
      },
    );

    expect(day.events).toHaveLength(2);
    expect(day.remaining_today).toBe(1);
    expect(day.range).toBe("month");
    expect(day.range_label).toBe("This month");
  });

  it("builds no groups for a window that cannot leave today", () => {
    const day = agenda([], {
      now,
      timezone: "UTC",
      locale: "en-GB",
      window: windowFor({ range: "today" }, now, "UTC", "en-GB"),
      hideDeclined: true,
    });

    expect(day.spans_days).toBe(false);
    expect(day.days).toEqual([]);
  });
});
