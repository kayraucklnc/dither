import { DAY, HOUR, MINUTE, dateLabel, dayKey, dayLabel, endOfDay, startOfDay } from "@/lib/clock";
import type { GoogleEvent } from "./api";
import type { RangeKey, Window } from "./range";

/**
 * Turning what Google returns into what a template draws.
 *
 * Kept apart from the fetching on purpose: everything awkward about a calendar
 * is in here - all-day entries with no time at all, an event you declined, a
 * meeting already running, a Zoom link pasted into the location box - and none
 * of it needs a network to test.
 *
 * The shape is the one the extension's designs and facts already use. Adding
 * to it is safe; renaming anything in it silently blanks five templates and
 * every rule built on a calendar.
 */

export interface Meeting {
  title: string;
  /** Wall clock in the installation's zone, e.g. "10:30". */
  start: string;
  end: string;
  location: string;
  remote: boolean;
  /**
   * Minutes until it starts, floored at zero.
   *
   * Zero for a meeting already running, which the `in_words` filter renders as
   * "now" - the reading a person wants from a panel across the room. It is
   * also what keeps the "about to start" notice from counting backwards
   * through a meeting you are sitting in.
   */
  minutes_until: number;
  /** Minutes until it ends, for something already running. */
  minutes_left: number;
  in_progress: boolean;
  accepted: boolean;
  /** "Thu", for a window long enough to leave today. */
  day: string;
  today: boolean;
  /** "2026-08-27", the day group this belongs to. */
  date: string;
  /**
   * Which feed it came from, when the widget is showing more than one. Empty
   * for a single calendar, where naming it on every line is noise.
   */
  calendar: string;
  /**
   * When it starts, as an instant. Sorting on `minutes_until` alone puts every
   * meeting already running at zero and then orders them by a clock string, so
   * two overlapping meetings could swap places between renders.
   */
  at: number;
}

export interface AllDay {
  title: string;
  today: boolean;
  accepted: boolean;
  /** "2026-08-27", so a day-grouped design can find it. */
  date: string;
  day: string;
  /** Which feed it came from, when the widget is showing more than one. */
  calendar: string;
}

/** One local day of the window, for a design that lists more than today. */
export interface DayGroup {
  /** "2026-08-27". */
  date: string;
  /** "Thu". */
  day: string;
  /** "27 Aug". */
  label: string;
  today: boolean;
  tomorrow: boolean;
  events: Meeting[];
  all_day: AllDay[];
  /** Nothing timed and nothing all-day. */
  empty: boolean;
}

export interface Agenda {
  empty: boolean;
  remaining_today: number;
  free_minutes: number;
  next: Meeting | null;
  events: Meeting[];
  /**
   * Entries with no time at all - "Annual leave", a birthday, a public
   * holiday. Kept out of `events` because every design here is a timeline,
   * and a thing with no start cannot be placed on one.
   */
  all_day: AllDay[];
  all_day_today: number;
  in_meeting: boolean;
  /**
   * The window, a local day at a time, oldest first.
   *
   * Only worth building when the window can hold more than one day - a design
   * showing the rest of today would draw one group containing everything, and
   * a heading saying "Thu" above a list of today's meetings is noise.
   */
  days: DayGroup[];
  /** Which range was asked for, and what to call it. */
  range: RangeKey;
  range_label: string;
  spans_days: boolean;
  /** True when the window held more than one page of events. */
  truncated: boolean;
}

/* -- reading one event ----------------------------------------------------- */

/** An event with a `date` rather than a `dateTime` has no time of day at all. */
export const isAllDay = (event: GoogleEvent): boolean =>
  Boolean(event.start?.date) && !event.start?.dateTime;

function instant(time: { dateTime?: string; date?: string } | undefined): Date | null {
  const value = time?.dateTime ?? time?.date;
  if (!value) return null;

  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** How the account itself answered, when it was asked at all. */
function response(event: GoogleEvent): string {
  const self = event.attendees?.find((attendee) => attendee.self);
  // No attendee list, or none of them is you: your own blocked-out time, which
  // you have not declined by failing to reply to yourself.
  return self?.responseStatus ?? "accepted";
}

export const isDeclined = (event: GoogleEvent): boolean => response(event) === "declined";

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

const clocks = new Map<string, Intl.DateTimeFormat>();

/**
 * "10:30" - in the installation's zone and language, not the server's and not
 * the calendar's. A panel on a wall in Milan reads Milan's clock whoever is
 * looking at it and wherever the box happens to run.
 */
export function clockAt(at: Date, timezone: string, locale: string): string {
  const key = `${timezone}|${locale}`;
  let formatter = clocks.get(key);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    });
    clocks.set(key, formatter);
  }

  return formatter.format(at);
}

export interface AgendaOptions {
  now: Date;
  timezone: string;
  locale: string;
  /** The stretch of time the widget asked about. */
  window: Window;
  hideDeclined: boolean;
  truncated?: boolean;
}

/**
 * The local days a window covers, oldest first.
 *
 * Walked a day at a time from noon rather than by adding days of
 * milliseconds, so the morning the clocks change does not produce the same
 * date twice or skip one.
 */
function localDays(from: Date, to: Date, timezone: string): Date[] {
  const days: Date[] = [];
  let cursor = startOfDay(from, timezone);

  // A month is 31 of these; the guard is for a window that somehow has no end.
  while (cursor < to && days.length < 40) {
    days.push(cursor);
    cursor = endOfDay(new Date(cursor.getTime() + 12 * HOUR), timezone);
  }

  return days;
}

export function agenda(source: GoogleEvent[], options: AgendaOptions): Agenda {
  const { now, timezone, locale, window, hideDeclined } = options;
  const dayEnds = endOfDay(now, timezone).getTime();
  const today = startOfDay(now, timezone).getTime();

  const kept = source.filter((event) => {
    if (event.status === "cancelled") return false;
    return !(hideDeclined && isDeclined(event));
  });

  const allDay: AllDay[] = [];
  const meetings: Meeting[] = [];
  /** Which local days each all-day entry covers, so a week can place it. */
  const spans: { entry: AllDay; from: number; to: number }[] = [];

  for (const event of kept) {
    const title = (event.summary ?? "").trim() || "Busy";

    if (isAllDay(event)) {
      const from = instant(event.start)?.getTime() ?? 0;
      // An all-day entry's own dates are midnight UTC, so "does it cover this
      // day" is a comparison of ranges rather than of a single instant.
      const until = instant(event.end)?.getTime() ?? from + DAY;

      const entry: AllDay = {
        title,
        today: from < dayEnds && until > today,
        accepted: !isDeclined(event),
        date: dayKey(new Date(from), timezone),
        day: dayLabel(new Date(from), timezone, locale),
        calendar: event.calendarName ?? "",
      };

      allDay.push(entry);
      spans.push({ entry, from, to: until });
      continue;
    }

    const start = instant(event.start);
    const end = instant(event.end);
    if (!start) continue;

    const finishes = end ?? start;
    const untilStart = Math.round((start.getTime() - now.getTime()) / MINUTE);
    const inProgress = start.getTime() <= now.getTime() && finishes.getTime() > now.getTime();

    meetings.push({
      title,
      start: clockAt(start, timezone, locale),
      end: clockAt(finishes, timezone, locale),
      ...placeOf(event),
      minutes_until: Math.max(0, untilStart),
      minutes_left: Math.max(0, Math.round((finishes.getTime() - now.getTime()) / MINUTE)),
      in_progress: inProgress,
      accepted: !isDeclined(event),
      day: dayLabel(start, timezone, locale),
      today: start.getTime() < dayEnds,
      date: dayKey(start, timezone),
      calendar: event.calendarName ?? "",
      at: start.getTime(),
    });
  }

  // Google orders by start time already, but only within one request, and only
  // when it was asked to. Sorting here costs nothing and means the timeline is
  // in order whatever the caller did.
  meetings.sort((a, b) => a.at - b.at);

  const next = meetings[0] ?? null;

  /* -- the window, a day at a time ---------------------------------------- */

  const days: DayGroup[] = window.spansDays
    ? localDays(now, window.to, timezone).map((midnight) => {
        const date = dayKey(midnight, timezone);
        const ends = endOfDay(new Date(midnight.getTime() + 12 * HOUR), timezone).getTime();

        const onThisDay = meetings.filter((meeting) => meeting.date === date);
        // An entry covering Monday to Friday belongs on all five, which is
        // what a calendar shows and what makes "am I off on Thursday"
        // answerable from the group rather than from the flat list.
        const covering = spans
          .filter((span) => span.from < ends && span.to > midnight.getTime())
          .map((span) => span.entry);

        return {
          date,
          day: dayLabel(midnight, timezone, locale),
          label: dateLabel(midnight, timezone, locale),
          today: date === dayKey(now, timezone),
          tomorrow: midnight.getTime() === dayEnds,
          events: onThisDay,
          all_day: covering,
          empty: onThisDay.length === 0 && covering.length === 0,
        };
      })
    : [];

  return {
    empty: meetings.length === 0,
    remaining_today: meetings.filter((meeting) => meeting.today).length,
    // What is left of the quiet, which is zero when you are already in
    // something. A widget captioned "free for" reading 24 minutes while a
    // meeting is running would be lying by a whole meeting.
    free_minutes: next
      ? next.minutes_until
      : Math.max(0, Math.round((window.to.getTime() - now.getTime()) / MINUTE)),
    next,
    events: meetings,
    all_day: allDay,
    all_day_today: allDay.filter((entry) => entry.today).length,
    in_meeting: Boolean(next?.in_progress),
    days,
    range: window.key,
    range_label: window.label,
    spans_days: window.spansDays,
    truncated: Boolean(options.truncated),
  };
}
