import { describe, expect, it } from "vitest";

import type { GoogleEvent } from "./api";
import { agenda, clockAt, isAllDay, isDeclined, placeOf, type AgendaOptions } from "./agenda";

/**
 * Everything awkward about a calendar, without a network.
 *
 * These are the cases that broke the mock's assumptions the moment a real
 * account was pointed at it: an entry with no time of day, a meeting already
 * running, a Zoom link where a room should be, and a day that ends at a
 * different instant depending on where the panel is hanging.
 */

const NOW = new Date("2026-08-27T09:00:00Z");

const options = (patch: Partial<AgendaOptions> = {}): AgendaOptions => ({
  now: NOW,
  timezone: "UTC",
  locale: "en-GB",
  horizonMinutes: 12 * 60,
  hideDeclined: true,
  ...patch,
});

const timed = (from: string, to: string, patch: Partial<GoogleEvent> = {}): GoogleEvent => ({
  summary: "Design review",
  start: { dateTime: from },
  end: { dateTime: to },
  ...patch,
});

describe("reading one event", () => {
  it("tells an all-day entry from a timed one by which field carries the start", () => {
    expect(isAllDay({ start: { date: "2026-08-27" } })).toBe(true);
    expect(isAllDay(timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z"))).toBe(false);
  });

  it("treats an event you were never asked about as accepted", () => {
    // Your own blocked-out time. You have not failed to reply to yourself.
    expect(isDeclined(timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z"))).toBe(false);
  });

  it("reads your own answer, not the other attendees'", () => {
    const event = timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", {
      attendees: [
        { responseStatus: "accepted" },
        { self: true, responseStatus: "declined" },
      ],
    });

    expect(isDeclined(event)).toBe(true);
  });
});

describe("where a meeting is", () => {
  it("names a conference attached properly", () => {
    expect(placeOf({ hangoutLink: "https://meet.google.com/abc-defg-hij" })).toEqual({
      location: "Meet",
      remote: true,
    });
  });

  it("prefers the solution's own name when there is one", () => {
    expect(
      placeOf({
        conferenceData: {
          entryPoints: [{ entryPointType: "video", uri: "https://zoom.us/j/1" }],
          conferenceSolution: { name: "Zoom Meeting" },
        },
      }),
    ).toEqual({ location: "Zoom Meeting", remote: true });
  });

  it("recognises a link pasted into the location box, which is the common case", () => {
    // Eighty characters of URL and a meeting password is not something to put
    // on a wall panel.
    expect(placeOf({ location: "https://acme.zoom.us/j/8812345678?pwd=verysecret" })).toEqual({
      location: "Zoom",
      remote: true,
    });
  });

  it("falls back to the host for a link it does not know", () => {
    expect(placeOf({ location: "https://www.gather.town/app/xyz" })).toEqual({
      location: "gather.town",
      remote: true,
    });
  });

  it("leaves a room alone", () => {
    expect(placeOf({ location: "Milano Centrale,  Sala 4" })).toEqual({
      location: "Milano Centrale, Sala 4",
      remote: false,
    });
  });

  it("says nothing rather than nothing-shaped when there is no location", () => {
    expect(placeOf({})).toEqual({ location: "", remote: false });
  });
});

describe("the clock a meeting is shown at", () => {
  it("reads the installation's zone, not the event's and not the server's", () => {
    const at = new Date("2026-08-27T09:30:00Z");

    expect(clockAt(at, "Europe/Rome", "en-GB")).toBe("11:30");
    expect(clockAt(at, "UTC", "en-GB")).toBe("09:30");
  });
});

describe("building the day", () => {
  it("puts the next meeting first and counts what is left", () => {
    const day = agenda(
      [
        timed("2026-08-27T14:00:00Z", "2026-08-27T15:00:00Z", { summary: "Sprint planning" }),
        timed("2026-08-27T09:30:00Z", "2026-08-27T10:15:00Z", { summary: "Design review" }),
      ],
      options(),
    );

    expect(day.empty).toBe(false);
    expect(day.events.map((event) => event.title)).toEqual(["Design review", "Sprint planning"]);
    expect(day.next?.title).toBe("Design review");
    expect(day.next?.start).toBe("09:30");
    expect(day.next?.minutes_until).toBe(30);
    expect(day.remaining_today).toBe(2);
  });

  it("reports a meeting already running as starting now, not as overdue", () => {
    // A negative countdown reads as "in -12 min" on a panel, and the "about to
    // start" notice would fire backwards through the whole meeting.
    const day = agenda([timed("2026-08-27T08:48:00Z", "2026-08-27T09:30:00Z")], options());

    expect(day.next?.minutes_until).toBe(0);
    expect(day.next?.in_progress).toBe(true);
    expect(day.next?.minutes_left).toBe(30);
    expect(day.in_meeting).toBe(true);
    expect(day.free_minutes).toBe(0);
  });

  it("says the whole horizon is free when nothing is on", () => {
    const day = agenda([], options({ horizonMinutes: 480 }));

    expect(day.empty).toBe(true);
    expect(day.next).toBeNull();
    expect(day.free_minutes).toBe(480);
    expect(day.remaining_today).toBe(0);
  });

  it("drops what you declined, unless you asked to see it", () => {
    const declined = timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", {
      summary: "Optional sync",
      attendees: [{ self: true, responseStatus: "declined" }],
    });

    expect(agenda([declined], options()).events).toHaveLength(0);
    expect(agenda([declined], options({ hideDeclined: false })).events).toHaveLength(1);
    expect(agenda([declined], options({ hideDeclined: false })).events[0].accepted).toBe(false);
  });

  it("drops a cancelled occurrence whatever the settings say", () => {
    const cancelled = timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", { status: "cancelled" });

    expect(agenda([cancelled], options({ hideDeclined: false })).events).toHaveLength(0);
  });

  it("keeps all-day entries off the timeline but still counts them", () => {
    // "Annual leave" has no start time, so it cannot be placed on a timeline -
    // and putting it there as 00:00 would claim the hero slot and fire the
    // about-to-start notice at midnight.
    const day = agenda(
      [
        { summary: "Annual leave", start: { date: "2026-08-27" }, end: { date: "2026-08-28" } },
        timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z"),
      ],
      options(),
    );

    expect(day.events).toHaveLength(1);
    expect(day.events[0].title).toBe("Design review");
    expect(day.all_day).toEqual([{ title: "Annual leave", today: true, accepted: true }]);
    expect(day.all_day_today).toBe(1);
  });

  it("knows an all-day entry that started before today still covers it", () => {
    const day = agenda(
      [{ summary: "Conference", start: { date: "2026-08-25" }, end: { date: "2026-08-29" } }],
      options(),
    );

    expect(day.all_day_today).toBe(1);
  });

  it("does not count tomorrow's all-day entry as today's", () => {
    const day = agenda(
      [{ summary: "Bank holiday", start: { date: "2026-08-31" }, end: { date: "2026-09-01" } }],
      options(),
    );

    expect(day.all_day).toHaveLength(1);
    expect(day.all_day_today).toBe(0);
  });

  it("counts what is left today by the panel's midnight, not the server's", () => {
    // 23:30 UTC is already tomorrow in Rome and still today in London, so the
    // same two meetings are one meeting left or two depending on where the
    // panel hangs.
    const now = new Date("2026-08-27T21:00:00Z");
    const events = [
      timed("2026-08-27T21:30:00Z", "2026-08-27T22:00:00Z", { summary: "Late call" }),
      timed("2026-08-27T22:30:00Z", "2026-08-27T23:00:00Z", { summary: "Later call" }),
    ];

    const rome = agenda(events, options({ now, timezone: "Europe/Rome" }));
    const london = agenda(events, options({ now, timezone: "Europe/London" }));

    // Rome is UTC+2 in August: 22:30 UTC is 00:30 tomorrow.
    expect(rome.remaining_today).toBe(1);
    expect(london.remaining_today).toBe(2);
    expect(rome.events).toHaveLength(2);
  });

  it("gives a nameless event something to draw", () => {
    const day = agenda([timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", { summary: "" })], options());

    expect(day.next?.title).toBe("Busy");
  });

  it("survives an event with no end time", () => {
    const day = agenda([{ summary: "Reminder", start: { dateTime: "2026-08-27T10:00:00Z" } }], options());

    expect(day.next?.start).toBe("10:00");
    expect(day.next?.end).toBe("10:00");
    expect(day.next?.in_progress).toBe(false);
  });

  it("carries the bound through, so a count can say it is a floor", () => {
    expect(agenda([], options()).truncated).toBe(false);
    expect(agenda([], { ...options(), truncated: true }).truncated).toBe(true);
  });
});
