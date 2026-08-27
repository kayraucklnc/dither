import { startOfDay } from "@/lib/clock";
import type { Meeting, Response } from "@/lib/calendar/day";
import type { GoogleEvent } from "./api";

/**
 * Reading what Google returned.
 *
 * Everything awkward about *a calendar entry* is here: one with no time of day
 * at all, one you declined, one with a Zoom link pasted where a room should
 * be. None of it needs a network to test.
 *
 * What a *day* is - who overlaps whom, how much of it is spoken for, where the
 * gaps are - is `lib/calendar/day.ts`, which knows nothing about Google. The
 * line between them is this file's only job: turn Google's vocabulary into
 * that one.
 */

/* -- reading one event ----------------------------------------------------- */

/** An event with a `date` rather than a `dateTime` has no time of day at all. */
export const isAllDay = (event: GoogleEvent): boolean =>
  Boolean(event.start?.date) && !event.start?.dateTime;

/**
 * The day after a floating "2026-08-28", as another floating date.
 *
 * Stepped through UTC because a bare date has no zone to be wrong about - it
 * is arithmetic on a calendar, not on an instant.
 */
function nextDate(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

function instant(time: { dateTime?: string; date?: string } | undefined): Date | null {
  const value = time?.dateTime ?? time?.date;
  if (!value) return null;

  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * How the account itself answered, when it was asked at all.
 *
 * No attendee list, or none of them is you: your own blocked-out time, which
 * you have not declined by failing to reply to yourself.
 */
export function responseOf(event: GoogleEvent): Response {
  const self = event.attendees?.find((attendee) => attendee.self);
  const said = self?.responseStatus ?? "accepted";

  if (said === "declined") return "declined";
  if (said === "tentative") return "tentative";
  if (said === "accepted") return "accepted";

  // `needsAction` - invited, never replied. Not a no, and not a yes either.
  return "none";
}

export const isDeclined = (event: GoogleEvent): boolean => responseOf(event) === "declined";

const VIDEO = [
  { match: /(^|\.)zoom\.(us|com)$/i, label: "Zoom" },
  { match: /(^|\.)teams\.(microsoft|live)\.com$/i, label: "Teams" },
  { match: /(^|\.)meet\.google\.com$/i, label: "Meet" },
  { match: /(^|\.)whereby\.com$/i, label: "Whereby" },
  { match: /(^|\.)webex\.com$/i, label: "Webex" },
  { match: /(^|\.)meet\.jit\.si$/i, label: "Jitsi" },
  { match: /(^|\.)around\.co$/i, label: "Around" },
];

/** The first URL in a string, if it holds one. */
function firstUrl(text: string): URL | undefined {
  const match = /https?:\/\/[^\s,<>"']+/i.exec(text);
  if (!match) return undefined;

  try {
    return new URL(match[0]);
  } catch {
    return undefined;
  }
}

/**
 * Where it is, and whether "where" is a room or a link.
 *
 * A conference attached properly is easy. The common case is not that: it is a
 * Zoom link pasted into the location box, which Google reports as a location
 * like any other. Printing that raw puts eighty characters of URL and a
 * meeting password on a wall panel, so a recognised host becomes its name.
 */
export function placeOf(event: GoogleEvent): { location: string; remote: boolean } {
  const video = event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video");

  if (event.hangoutLink || video) {
    const named = event.conferenceData?.conferenceSolution?.name?.trim();
    return { location: named || video?.label?.trim() || "Meet", remote: true };
  }

  const raw = (event.location ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { location: "", remote: false };

  const url = firstUrl(raw);
  if (url) {
    const known = VIDEO.find((candidate) => candidate.match.test(url.hostname));
    if (known) return { location: known.label, remote: true };

    // Some other link. Its host is the only part worth the width.
    return { location: url.hostname.replace(/^www\./, ""), remote: true };
  }

  return { location: raw, remote: false };
}

/* -- the day --------------------------------------------------------------- */

/* -- into the shape the calendar model works in ---------------------------- */

/**
 * Local midnight on a floating date.
 *
 * An all-day entry has no instant behind it - "2026-08-28" is the 28th
 * wherever you are - so it becomes midnight *here*, which is the only reading
 * that puts a one-day birthday on one day. Read as midnight UTC instead, it
 * lands three hours early in Istanbul and draws on two days.
 *
 * Noon is the hour no clock change can move out of its own date, which is why
 * the local day is resolved from there.
 */
function localMidnight(date: string, timezone: string): Date {
  return startOfDay(new Date(`${date}T12:00:00Z`), timezone);
}

/**
 * What Google returned, in the vocabulary the calendar model works in.
 *
 * Everything awkward about a calendar is on this side of the line: an entry
 * with no time of day, a meeting you declined, a Zoom link pasted where a room
 * should be. What a *day* is - who overlaps whom, how much of it is spoken
 * for, where the gaps are - is `lib/calendar/day.ts`, which knows nothing
 * about Google and is tested without one.
 */
export function toMeetings(
  events: GoogleEvent[],
  timezone: string,
  fallbackId = "event",
): Meeting[] {
  const meetings: Meeting[] = [];

  for (const [index, event] of events.entries()) {
    if (event.status === "cancelled") continue;

    const title = (event.summary ?? "").trim() || "Busy";
    const id = event.id ?? `${fallbackId}-${index}`;
    const place = placeOf(event);

    if (isAllDay(event)) {
      const from = event.start?.date ?? "";
      if (!from) continue;

      meetings.push({
        id,
        title,
        startsAt: localMidnight(from, timezone),
        endsAt: localMidnight(event.end?.date ?? nextDate(from), timezone),
        location: place.location,
        remote: place.remote,
        response: responseOf(event),
        allDay: true,
        calendar: event.calendarName,
      });
      continue;
    }

    const startsAt = instant(event.start);
    if (!startsAt) continue;

    meetings.push({
      id,
      title,
      startsAt,
      endsAt: instant(event.end) ?? startsAt,
      location: place.location,
      remote: place.remote,
      response: responseOf(event),
      allDay: false,
      organiser: event.organizer?.self ? "" : undefined,
      attendees: event.attendees?.length,
      calendar: event.calendarName,
    });
  }

  return meetings;
}
