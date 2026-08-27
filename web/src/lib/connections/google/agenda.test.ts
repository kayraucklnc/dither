import { describe, expect, it } from "vitest";

import type { GoogleEvent } from "./api";
import { isAllDay, isDeclined, placeOf, responseOf, toMeetings } from "./agenda";

/**
 * Reading what Google returned, without a network.
 *
 * These are the cases that broke every assumption the moment a real account
 * was pointed at them: an entry with no time of day, a meeting you declined, a
 * Zoom link pasted where a room should be, and a date that means a different
 * instant depending on where the panel is hanging.
 *
 * What a *day* is - who overlaps whom, how much of it is spoken for - is
 * `lib/calendar/day.ts` and is tested there. This is only the translation.
 */

const timed = (from: string, to: string, patch: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: "one",
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
    expect(responseOf(timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z"))).toBe("accepted");
    expect(isDeclined(timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z"))).toBe(false);
  });

  it("reads your own answer, not the other attendees'", () => {
    const event = timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", {
      attendees: [{ responseStatus: "accepted" }, { self: true, responseStatus: "declined" }],
    });

    expect(responseOf(event)).toBe("declined");
    expect(isDeclined(event)).toBe(true);
  });

  it("keeps an unanswered invitation distinct from a yes", () => {
    // `needsAction` is not a no, and counting it as a yes would fill a day
    // with meetings nobody has agreed to.
    const event = timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", {
      attendees: [{ self: true, responseStatus: "needsAction" }],
    });

    expect(responseOf(event)).toBe("none");
  });

  it("carries a tentative answer through as tentative", () => {
    const event = timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", {
      attendees: [{ self: true, responseStatus: "tentative" }],
    });

    expect(responseOf(event)).toBe("tentative");
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

describe("turning them into meetings", () => {
  it("carries a timed event straight through", () => {
    const [meeting] = toMeetings(
      [timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z")],
      "Europe/Istanbul",
    );

    expect(meeting.startsAt.toISOString()).toBe("2026-08-27T10:00:00.000Z");
    expect(meeting.endsAt.toISOString()).toBe("2026-08-27T11:00:00.000Z");
    expect(meeting.allDay).toBe(false);
    expect(meeting.title).toBe("Design review");
  });

  it("drops a cancelled occurrence", () => {
    expect(toMeetings([timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", { status: "cancelled" })], "UTC")).toHaveLength(0);
  });

  it("gives a nameless event something to draw", () => {
    const [meeting] = toMeetings([timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", { summary: "" })], "UTC");

    expect(meeting.title).toBe("Busy");
  });

  it("survives an event with no end time", () => {
    const [meeting] = toMeetings([{ id: "x", summary: "Reminder", start: { dateTime: "2026-08-27T10:00:00Z" } }], "UTC");

    expect(meeting.endsAt.getTime()).toBe(meeting.startsAt.getTime());
  });

  it("keeps a declined meeting, marked, rather than dropping it here", () => {
    // Whether to draw it is the day model's decision and the widget's setting.
    // Throwing it away at the door would take that choice off both of them.
    const [meeting] = toMeetings(
      [
        timed("2026-08-27T10:00:00Z", "2026-08-27T11:00:00Z", {
          attendees: [{ self: true, responseStatus: "declined" }],
        }),
      ],
      "UTC",
    );

    expect(meeting.response).toBe("declined");
  });

  it("gives every meeting an id, so lanes and conflicts can name them", () => {
    const meetings = toMeetings(
      [
        { summary: "One", start: { dateTime: "2026-08-27T10:00:00Z" } },
        { summary: "Two", start: { dateTime: "2026-08-27T11:00:00Z" } },
      ],
      "UTC",
      "feed",
    );

    expect(new Set(meetings.map((one) => one.id)).size).toBe(2);
  });
});

describe("an all-day entry lands on one local day", () => {
  const birthday: GoogleEvent = {
    id: "bd",
    summary: "Lesya BD 02",
    start: { date: "2026-08-28" },
    end: { date: "2026-08-29" },
  };

  it("starts at midnight where the panel is, not at midnight UTC", () => {
    // The bug this pins down, found against a real account in Istanbul: an
    // all-day date floats - "2026-08-28" is the 28th wherever you are, with no
    // instant behind it. Read as midnight UTC it begins three hours early
    // there, and the entry draws on two days.
    const [istanbul] = toMeetings([birthday], "Europe/Istanbul");
    const [london] = toMeetings([birthday], "Europe/London");

    expect(istanbul.startsAt.toISOString()).toBe("2026-08-27T21:00:00.000Z");
    expect(london.startsAt.toISOString()).toBe("2026-08-27T23:00:00.000Z");
  });

  it("is exactly one local day long, in every zone", () => {
    for (const timezone of ["Europe/Istanbul", "Asia/Tokyo", "UTC", "America/Los_Angeles"]) {
      const [meeting] = toMeetings([birthday], timezone);
      const hours = (meeting.endsAt.getTime() - meeting.startsAt.getTime()) / 3_600_000;

      expect(hours, timezone).toBe(24);
      expect(meeting.allDay, timezone).toBe(true);
    }
  });

  it("still spans its own length when it is genuinely several days", () => {
    const [leave] = toMeetings(
      [{ id: "l", summary: "Annual leave", start: { date: "2026-08-28" }, end: { date: "2026-08-31" } }],
      "Europe/Istanbul",
    );

    expect((leave.endsAt.getTime() - leave.startsAt.getTime()) / 3_600_000).toBe(72);
  });

  it("assumes one day when Google sends no end at all", () => {
    const [meeting] = toMeetings([{ id: "x", summary: "Holiday", start: { date: "2026-08-28" } }], "UTC");

    expect((meeting.endsAt.getTime() - meeting.startsAt.getTime()) / 3_600_000).toBe(24);
  });
});
