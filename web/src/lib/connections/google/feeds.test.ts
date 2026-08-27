import { describe, expect, it } from "vitest";

import { agenda } from "./agenda";
import type { GoogleEvent } from "./api";
import { feedValue, parseFeed, resolveFeeds, selectedFeeds } from "./feeds";
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

describe("naming a calendar on an account", () => {
  it("carries both halves in one value, because a settings field holds one", () => {
    expect(feedValue("work@example.com", "primary")).toBe("work@example.com|primary");
    expect(parseFeed("work@example.com|primary")).toEqual({
      account: "work@example.com",
      calendar: "primary",
    });
  });

  it("splits on the first pipe, since a calendar id may be an address", () => {
    expect(parseFeed("a@x.com|en.uk#holiday@group.v.calendar.google.com")).toEqual({
      account: "a@x.com",
      calendar: "en.uk#holiday@group.v.calendar.google.com",
    });
  });

  it("reads a value saved when there could only be one account", () => {
    expect(parseFeed("primary")).toEqual({ account: "", calendar: "primary" });
  });
});

describe("attaching a selection to the account that answers it", () => {
  it("sends an account-less selection to the first account linked", () => {
    // Written before a second account was possible, so it can only have meant
    // the one that existed.
    const { resolved, unknown } = resolveFeeds(["primary"], ["a@x.com", "b@x.com"]);

    expect(resolved).toEqual([{ account: "a@x.com", calendar: "primary" }]);
    expect(unknown).toEqual([]);
  });

  it("drops a selection whose account is gone rather than guessing", () => {
    // Showing somebody else's calendar because the addresses happened to sort
    // that way would be much worse than showing nothing.
    const { resolved, unknown } = resolveFeeds(["gone@x.com|primary"], ["a@x.com"]);

    expect(resolved).toEqual([]);
    expect(unknown).toEqual(["gone@x.com|primary"]);
  });

  it("keeps the two accounts apart", () => {
    const { resolved } = resolveFeeds(
      ["a@x.com|primary", "b@x.com|primary"],
      ["a@x.com", "b@x.com"],
    );

    expect(resolved).toEqual([
      { account: "a@x.com", calendar: "primary" },
      { account: "b@x.com", calendar: "primary" },
    ]);
  });

  it("has nothing to resolve against when no account is linked", () => {
    const { resolved, unknown } = resolveFeeds(["primary"], []);

    expect(resolved).toEqual([]);
    expect(unknown).toEqual(["primary"]);
  });
});

describe("which feeds a widget was pointed at", () => {
  it("takes a list", () => {
    expect(selectedFeeds({ calendar: ["work@example.com", "family@example.com"] })).toEqual([
      "family@example.com",
      "work@example.com",
    ]);
  });

  it("sorts, so picking the same two in either order is one question", () => {
    // Two widgets configured alike must share one answer and one trip to
    // Google. Order is not meaningful here and must not reach the hash.
    expect(selectedFeeds({ calendar: ["b", "a"] })).toEqual(selectedFeeds({ calendar: ["a", "b"] }));
  });

  it("drops duplicates and blanks", () => {
    expect(selectedFeeds({ calendar: ["a", "a", "", "  "] })).toEqual(["a"]);
  });

  it("still understands the single calendar a widget saved before this holds", () => {
    expect(selectedFeeds({ calendar: "primary" })).toEqual(["primary"]);
  });

  it("falls back to the primary calendar rather than asking for nothing", () => {
    expect(selectedFeeds({})).toEqual(["primary"]);
    expect(selectedFeeds({ calendar: [] })).toEqual(["primary"]);
  });

  it("refuses to make forty requests because forty boxes were ticked", () => {
    const many = Array.from({ length: 40 }, (_, index) => `cal-${String(index).padStart(2, "0")}`);
    const ids = selectedFeeds({ calendar: many });

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
