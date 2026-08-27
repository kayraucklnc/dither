import { describe, expect, it } from "vitest";

import { agenda } from "./agenda";
import type { GoogleEvent } from "./api";
import { calendarIds } from "./index";
import { windowFor } from "./range";

/**
 * Several calendars, one widget.
 *
 * Work and family on one panel is the ordinary case, and two widgets drawn on
 * top of each other is not how anybody would ask for it. The awkward part is
 * not the merge - it is that the settings become the key an answer is cached
 * under, so the same two feeds picked in a different order have to be the same
 * question.
 */

describe("which feeds a widget was pointed at", () => {
  it("takes a list", () => {
    expect(calendarIds({ calendar: ["work@example.com", "family@example.com"] })).toEqual([
      "family@example.com",
      "work@example.com",
    ]);
  });

  it("sorts, so picking the same two in either order is one question", () => {
    // Two widgets configured alike must share one answer and one trip to
    // Google. Order is not meaningful here and must not reach the hash.
    expect(calendarIds({ calendar: ["b", "a"] })).toEqual(calendarIds({ calendar: ["a", "b"] }));
  });

  it("drops duplicates and blanks", () => {
    expect(calendarIds({ calendar: ["a", "a", "", "  "] })).toEqual(["a"]);
  });

  it("still understands the single calendar a widget saved before this holds", () => {
    expect(calendarIds({ calendar: "primary" })).toEqual(["primary"]);
  });

  it("falls back to the primary calendar rather than asking for nothing", () => {
    expect(calendarIds({})).toEqual(["primary"]);
    expect(calendarIds({ calendar: [] })).toEqual(["primary"]);
  });

  it("refuses to make forty requests because forty boxes were ticked", () => {
    const many = Array.from({ length: 40 }, (_, index) => `cal-${String(index).padStart(2, "0")}`);
    const ids = calendarIds({ calendar: many });

    expect(ids).toHaveLength(8);
    expect(ids[0]).toBe("cal-00");
  });
});

/* -------------------------------------------------------------------------- */

const from = (calendarName: string | undefined, at: string, summary: string): GoogleEvent => ({
  summary,
  calendarName,
  start: { dateTime: at },
  end: { dateTime: at },
});

describe("merging what several feeds answered", () => {
  const now = new Date("2026-08-27T09:00:00Z");

  const merged = (events: GoogleEvent[]) =>
    agenda(events, {
      now,
      timezone: "UTC",
      locale: "en-GB",
      window: windowFor({ range: "today" }, now, "UTC", "en-GB"),
      hideDeclined: true,
    });

  it("interleaves them by time rather than by feed", () => {
    // Two lists arriving one after the other must not draw as two lists. The
    // whole point of merging is one timeline.
    const day = merged([
      from("Work", "2026-08-27T10:00:00Z", "Design review"),
      from("Work", "2026-08-27T15:00:00Z", "Retro"),
      from("Family", "2026-08-27T12:00:00Z", "School pickup"),
    ]);

    expect(day.events.map((event) => event.title)).toEqual([
      "Design review",
      "School pickup",
      "Retro",
    ]);
  });

  it("marks each entry with the feed it came from", () => {
    const day = merged([from("Family", "2026-08-27T12:00:00Z", "School pickup")]);

    expect(day.next?.calendar).toBe("Family");
  });

  it("leaves the mark empty for a single feed, where it would be noise", () => {
    const day = merged([from(undefined, "2026-08-27T12:00:00Z", "School pickup")]);

    expect(day.next?.calendar).toBe("");
  });
});
