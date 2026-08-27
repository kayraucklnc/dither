import { describe, expect, it } from "vitest";

import { toMeetings } from "./agenda";
import type { GoogleEvent } from "./api";
import { feedValue, parseFeed, resolveFeeds, selectedFeeds } from "./feeds";

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
  id: summary,
  summary,
  calendarName,
  start: { dateTime: at },
  end: { dateTime: at },
});

describe("what several feeds contribute to one list", () => {
  it("marks each entry with the feed it came from", () => {
    const meetings = toMeetings(
      [
        from("Work", "2026-08-27T10:00:00Z", "Design review"),
        from("Family", "2026-08-27T12:00:00Z", "School pickup"),
      ],
      "UTC",
    );

    expect(meetings.map((one) => one.calendar)).toEqual(["Work", "Family"]);
  });

  it("leaves the mark unset for a single feed, where it would be noise", () => {
    const [meeting] = toMeetings([from(undefined, "2026-08-27T12:00:00Z", "School pickup")], "UTC");

    expect(meeting.calendar).toBeUndefined();
  });

  it("keeps ids apart when two feeds both number their events from one", () => {
    // Without the per-feed prefix, two events called `event-0` collide and the
    // conflict and lane arithmetic quietly pairs the wrong ones.
    const work = toMeetings([{ summary: "A", start: { dateTime: "2026-08-27T10:00:00Z" } }], "UTC", "work");
    const home = toMeetings([{ summary: "B", start: { dateTime: "2026-08-27T10:00:00Z" } }], "UTC", "home");

    expect(work[0].id).not.toBe(home[0].id);
  });
});
