import { DAY, MINUTE, dateLabel, dayLabel, startOfDay, wallClock } from "@/lib/clock";
import { spanInWords } from "@/lib/timewords";

/**
 * The shape of a day, worked out from a list of meetings.
 *
 * The old calendar payload was a list of events and a countdown, which is
 * enough to draw "what is next" and nothing else. Everything anybody actually
 * wants from a calendar on a wall is a fact *about* the list rather than a
 * fact in it: am I in something now, when am I next free, how much of today is
 * already spoken for, is anything double-booked, what does tomorrow look like.
 *
 * All of that is arithmetic on intervals, and interval arithmetic is where the
 * quiet mistakes live - two meetings that overlap are not two hours of work,
 * an all-day event is not sixteen hours of busy, and a gap of four minutes
 * between two rooms is not a gap. So it is here, pure and tested, rather than
 * inside a provider where it can only be checked by looking at a screen.
 *
 * Every time is carried three ways, because designs need different ones: a
 * wall-clock string to print, minutes since local midnight to *place* on a
 * ribbon, and an absolute instant so a template can work out a countdown at
 * the moment it draws rather than trusting one computed at the last fetch.
 */

export type Response = "accepted" | "declined" | "tentative" | "none";

export interface Meeting {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  remote: boolean;
  response: Response;
  allDay: boolean;
  organiser?: string;
  attendees?: number;
  calendar?: string;
}

/** One meeting, in the vocabulary a template draws with. */
export interface Card {
  id: string;
  title: string;
  start: string;
  end: string;
  /** Minutes since local midnight. What a ribbon places a block by. */
  start_minutes: number;
  end_minutes: number;
  /** Absolute seconds, so a template can count down at the moment it draws. */
  at_epoch: number;
  ends_epoch: number;
  minutes_until: number;
  minutes_left: number;
  duration: number;
  duration_text: string;
  location: string;
  remote: boolean;
  accepted: boolean;
  declined: boolean;
  tentative: boolean;
  all_day: boolean;
  organiser: string;
  attendees: number;
  calendar: string;
  /** Overlaps something else. The thing a day view exists to show you. */
  conflict: boolean;
  /** Which column of a day view this sits in, and how many that cluster needs. */
  lane: number;
  lanes: number;
  /** Already finished. */
  done: boolean;
  /** Happening now. */
  running: boolean;
}

export interface Gap {
  from: string;
  to: string;
  from_minutes: number;
  to_minutes: number;
  minutes: number;
  text: string;
}

const clockAt = (at: Date, timezone: string): string => {
  const local = wallClock(at, timezone);
  return `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
};

/** Minutes since local midnight. Past midnight it saturates rather than wrapping. */
export function minutesOfDay(at: Date, timezone: string, relativeTo = at): number {
  const midnight = startOfDay(relativeTo, timezone).getTime();
  return Math.round((at.getTime() - midnight) / MINUTE);
}

export function overlaps(one: Meeting, other: Meeting): boolean {
  return one.startsAt < other.endsAt && other.startsAt < one.endsAt;
}

/**
 * Which meetings collide with another.
 *
 * All-day events are left out of it: a day off does not double-book the
 * standup inside it, and a design that says so is a design nobody trusts by
 * Wednesday.
 */
export function conflicting(meetings: Meeting[]): Set<string> {
  const timed = meetings.filter((meeting) => !meeting.allDay);
  const clashing = new Set<string>();

  for (const one of timed) {
    for (const other of timed) {
      if (one.id === other.id || !overlaps(one, other)) continue;
      clashing.add(one.id);
      clashing.add(other.id);
    }
  }

  return clashing;
}

/**
 * Minutes actually spoken for between two instants.
 *
 * The union, not the sum. Two meetings that overlap by half an hour take an
 * hour and a half of a day between them, not two hours, and a "day is 140%
 * booked" figure is how you know somebody added them up instead.
 */
export function busyMinutes(meetings: Meeting[], from: Date, until: Date): number {
  const spans = meetings
    .filter((meeting) => !meeting.allDay && meeting.response !== "declined")
    .map((meeting) => ({
      from: Math.max(meeting.startsAt.getTime(), from.getTime()),
      until: Math.min(meeting.endsAt.getTime(), until.getTime()),
    }))
    .filter((span) => span.until > span.from)
    .sort((a, b) => a.from - b.from);

  let total = 0;
  let reach = -Infinity;

  for (const span of spans) {
    const start = Math.max(span.from, reach);
    if (span.until > start) total += span.until - start;
    reach = Math.max(reach, span.until);
  }

  return Math.round(total / MINUTE);
}

/**
 * The holes in a day, from an instant to the end of it.
 *
 * Anything shorter than `atLeast` is not a gap, it is the walk between two
 * rooms. Twenty minutes is the default because that is about the shortest
 * thing anybody claims as free time.
 */
export function gapsAfter(
  meetings: Meeting[],
  from: Date,
  until: Date,
  timezone: string,
  atLeast = 20,
): Gap[] {
  const timed = meetings
    .filter((meeting) => !meeting.allDay && meeting.response !== "declined")
    .filter((meeting) => meeting.endsAt > from && meeting.startsAt < until)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const gaps: Gap[] = [];
  let edge = from;

  for (const meeting of timed) {
    if (meeting.startsAt > edge) {
      const minutes = Math.round((meeting.startsAt.getTime() - edge.getTime()) / MINUTE);
      if (minutes >= atLeast) gaps.push(gapOf(edge, meeting.startsAt, minutes, timezone, from));
    }
    if (meeting.endsAt > edge) edge = meeting.endsAt;
  }

  if (until > edge) {
    const minutes = Math.round((until.getTime() - edge.getTime()) / MINUTE);
    if (minutes >= atLeast) gaps.push(gapOf(edge, until, minutes, timezone, from));
  }

  return gaps;
}

function gapOf(from: Date, to: Date, minutes: number, timezone: string, day: Date): Gap {
  return {
    from: clockAt(from, timezone),
    to: clockAt(to, timezone),
    from_minutes: minutesOfDay(from, timezone, day),
    to_minutes: minutesOfDay(to, timezone, day),
    minutes,
    text: `${spanInWords(minutes)} free`,
  };
}

export function cardOf(
  meeting: Meeting,
  now: Date,
  timezone: string,
  clashing: Set<string>,
): Card {
  const untilStart = Math.round((meeting.startsAt.getTime() - now.getTime()) / MINUTE);
  const untilEnd = Math.round((meeting.endsAt.getTime() - now.getTime()) / MINUTE);
  const duration = Math.round((meeting.endsAt.getTime() - meeting.startsAt.getTime()) / MINUTE);

  return {
    id: meeting.id,
    title: meeting.title,
    start: meeting.allDay ? "all day" : clockAt(meeting.startsAt, timezone),
    end: meeting.allDay ? "" : clockAt(meeting.endsAt, timezone),
    start_minutes: minutesOfDay(meeting.startsAt, timezone, now),
    end_minutes: minutesOfDay(meeting.endsAt, timezone, now),
    at_epoch: Math.floor(meeting.startsAt.getTime() / 1000),
    ends_epoch: Math.floor(meeting.endsAt.getTime() / 1000),
    minutes_until: untilStart,
    minutes_left: untilEnd,
    duration,
    duration_text: meeting.allDay ? "all day" : spanInWords(duration),
    location: meeting.location,
    remote: meeting.remote,
    accepted: meeting.response === "accepted",
    declined: meeting.response === "declined",
    tentative: meeting.response === "tentative",
    all_day: meeting.allDay,
    organiser: meeting.organiser ?? "",
    attendees: meeting.attendees ?? 0,
    calendar: meeting.calendar ?? "",
    conflict: clashing.has(meeting.id),
    lane: 0,
    lanes: 1,
    done: untilEnd <= 0,
    running: untilStart <= 0 && untilEnd > 0,
  };
}

/**
 * Which column each meeting is drawn in, where several run at once.
 *
 * A day view that draws overlapping meetings on top of each other hides the
 * very thing it exists to show. Laid out greedily, left to right: a meeting
 * takes the first column free at the moment it starts, and every meeting in a
 * run of overlapping ones is told how many columns that run needed, so each
 * can size itself to a fraction of the width.
 *
 * Done here rather than in a template because it is a graph colouring, and a
 * templating language is a bad place to discover that.
 */
export function assignLanes(cards: Card[]): Card[] {
  const ordered = [...cards].sort((a, b) => a.at_epoch - b.at_epoch || b.ends_epoch - a.ends_epoch);
  const laid: Card[] = [];

  let cluster: Card[] = [];
  let clusterEnds = -Infinity;
  const ends: number[] = [];

  const closeCluster = () => {
    const width = ends.length || 1;
    for (const card of cluster) card.lanes = width;
    cluster = [];
    ends.length = 0;
  };

  for (const card of ordered) {
    // A run ends the moment nothing before it is still going: everything after
    // that point is a fresh cluster and starts again at the left.
    if (card.at_epoch >= clusterEnds) closeCluster();

    let lane = ends.findIndex((endsAt) => endsAt <= card.at_epoch);
    if (lane === -1) {
      lane = ends.length;
      ends.push(card.ends_epoch);
    } else {
      ends[lane] = card.ends_epoch;
    }

    const placed = { ...card, lane };
    cluster.push(placed);
    laid.push(placed);
    clusterEnds = Math.max(clusterEnds, card.ends_epoch);
  }

  closeCluster();

  return laid;
}

export interface DayAhead {
  day: string;
  date: string;
  count: number;
  busy_minutes: number;
  busy_text: string;
  load_percent: number;
  first: string;
  is_today: boolean;
  is_weekend: boolean;
}

export interface Shape {
  timezone: string;
  locale: string;
  /** The stretch of the day a ribbon draws, in minutes since midnight. */
  openMinute: number;
  closeMinute: number;
  /** How far ahead "upcoming" reaches. */
  horizonHours: number;
  /** Leave out anything declined. */
  hideDeclined: boolean;
  daysAhead: number;
}

const DEFAULTS: Pick<Shape, "openMinute" | "closeMinute" | "horizonHours" | "hideDeclined" | "daysAhead"> = {
  openMinute: 8 * 60,
  closeMinute: 20 * 60,
  horizonHours: 12,
  hideDeclined: true,
  daysAhead: 7,
};

/**
 * Everything a calendar design can ask, from one list of meetings.
 *
 * Built in one pass and handed over whole, because an answer is cached by the
 * question that produced it and the question is the account - not the widget.
 * Six calendar widgets on a screen, one showing what is next and one showing
 * the week, must cost one trip to Google between them. That only works if the
 * payload carries every answer and the *design* chooses among them.
 */
export function dayShape(
  meetings: Meeting[],
  now: Date,
  options: Partial<Shape> & Pick<Shape, "timezone" | "locale">,
): Record<string, unknown> {
  const settings = { ...DEFAULTS, ...options };
  const { timezone, locale } = settings;

  const kept = settings.hideDeclined
    ? meetings.filter((meeting) => meeting.response !== "declined")
    : meetings;

  const midnight = startOfDay(now, timezone);
  const tomorrowStart = new Date(midnight.getTime() + DAY);
  const endOfToday = tomorrowStart;

  const clashing = conflicting(kept);
  const ordered = [...kept].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const todays = ordered.filter(
    (meeting) => meeting.startsAt < endOfToday && meeting.endsAt > midnight,
  );
  const timedToday = todays.filter((meeting) => !meeting.allDay);

  const cards = assignLanes(timedToday.map((meeting) => cardOf(meeting, now, timezone, clashing)));
  const running = cards.find((card) => card.running) ?? null;
  const ahead = cards.filter((card) => card.minutes_until > 0);
  const next = ahead[0] ?? null;

  const horizon = new Date(now.getTime() + settings.horizonHours * 60 * MINUTE);
  const upcoming = ordered
    .filter((meeting) => !meeting.allDay)
    .map((meeting) => cardOf(meeting, now, timezone, clashing))
    .filter((card) => card.minutes_left > 0 && card.at_epoch * 1000 <= horizon.getTime());

  const busy = busyMinutes(timedToday, midnight, endOfToday);

  const openFrom = new Date(midnight.getTime() + settings.openMinute * MINUTE);
  const openUntil = new Date(midnight.getTime() + settings.closeMinute * MINUTE);

  /*
   * Gaps run to the end of the *day*, not to midnight.
   *
   * "Longest gap: 17:30 to 00:00" is arithmetic, not information - nobody is
   * offering six and a half hours of evening as a slot. The day ends when the
   * working day does, or when the last thing on it finishes, whichever is
   * later.
   */
  const lastEnds = timedToday.reduce(
    (latest, meeting) => Math.max(latest, meeting.endsAt.getTime()),
    openUntil.getTime(),
  );
  const gaps = gapsAfter(timedToday, now, new Date(lastEnds), timezone, 20);
  const longest = [...gaps].sort((a, b) => b.minutes - a.minutes)[0] ?? null;
  const workingBusy = busyMinutes(timedToday, openFrom, openUntil);
  const workingSpan = Math.max(1, settings.closeMinute - settings.openMinute);

  const days: DayAhead[] = Array.from({ length: settings.daysAhead }, (_, index) => {
    const from = new Date(midnight.getTime() + index * DAY);
    const to = new Date(from.getTime() + DAY);
    const onDay = ordered.filter(
      (meeting) => meeting.startsAt < to && meeting.endsAt > from && !meeting.allDay,
    );
    const minutes = busyMinutes(onDay, from, to);

    return {
      day: dayLabel(from, timezone, locale),
      date: dateLabel(from, timezone, locale),
      count: onDay.length,
      busy_minutes: minutes,
      busy_text: minutes ? spanInWords(minutes) : "",
      load_percent: Math.min(100, Math.round((minutes / workingSpan) * 100)),
      first: onDay.length ? clockAt(onDay[0].startsAt, timezone) : "",
      is_today: index === 0,
      // Deliberately by wall-clock date rather than by locale week start: what
      // is being asked is "is this a working day", which Saturday is not
      // wherever the week is drawn from.
      is_weekend: isWeekend(from, timezone),
    };
  });

  const tomorrows = ordered.filter(
    (meeting) =>
      !meeting.allDay &&
      meeting.startsAt >= tomorrowStart &&
      meeting.startsAt < new Date(tomorrowStart.getTime() + DAY),
  );

  const allDay = todays
    .filter((meeting) => meeting.allDay)
    .map((meeting) => ({ title: meeting.title, calendar: meeting.calendar ?? "" }));

  const nowMinutes = minutesOfDay(now, timezone);
  const done = cards.filter((card) => card.done).length;

  return {
    connected: true,
    empty: todays.length === 0,
    now: {
      minutes_of_day: nowMinutes,
      text: clockAt(now, timezone),
      in_meeting: Boolean(running),
      /** Minutes until the next thing starts, or a long day's worth of free. */
      free_minutes: running ? 0 : (next?.minutes_until ?? Math.max(0, 24 * 60 - nowMinutes)),
    },
    current: running,
    next,
    after: ahead[1] ?? null,
    events: cards,
    upcoming,
    all_day: allDay,
    gaps,
    longest_gap: longest,
    today: {
      date: dateLabel(now, timezone, locale),
      day: dayLabel(now, timezone, locale),
      total: cards.length,
      done,
      remaining: cards.length - done,
      busy_minutes: busy,
      busy_text: spanInWords(busy),
      free_minutes: Math.max(0, workingSpan - workingBusy),
      free_text: spanInWords(Math.max(0, workingSpan - workingBusy)),
      load_percent: Math.min(100, Math.round((workingBusy / workingSpan) * 100)),
      first_start: cards[0]?.start ?? "",
      last_end: cards.length ? cards[cards.length - 1].end : "",
      conflicts: cards.filter((card) => card.conflict).length,
    },
    tomorrow: {
      count: tomorrows.length,
      first: tomorrows.length ? cardOf(tomorrows[0], now, timezone, clashing) : null,
      busy_text: spanInWords(busyMinutes(tomorrows, tomorrowStart, new Date(tomorrowStart.getTime() + DAY))),
    },
    days,
    /** The stretch a ribbon draws, widened to hold anything outside it. */
    window: ribbonWindow(cards, settings.openMinute, settings.closeMinute, nowMinutes),
    /* Kept for rules written against the old payload, which asked in minutes. */
    remaining_today: cards.length - done,
    free_minutes: running ? 0 : (next?.minutes_until ?? 0),
  };
}

function isWeekend(at: Date, timezone: string): boolean {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short" }).format(at);
  return name === "Sat" || name === "Sun";
}

/**
 * The stretch of the day a ribbon draws.
 *
 * It starts as the working day, then stretches to hold anything outside it,
 * because a seven o'clock flight drawn above the top of the ribbon is worse
 * than a ribbon with an hour of empty at the end. Rounded out to the hour so
 * the gridlines land on something a person would draw.
 */
export function ribbonWindow(
  cards: Card[],
  openMinute: number,
  closeMinute: number,
  nowMinutes: number,
): { open: number; close: number; span: number; now_percent: number } {
  let open = openMinute;
  let close = closeMinute;

  for (const card of cards) {
    if (card.start_minutes < open) open = Math.floor(card.start_minutes / 60) * 60;
    if (card.end_minutes > close) close = Math.ceil(card.end_minutes / 60) * 60;
  }

  // The now line has to be on the ribbon, or "where am I in the day" is a
  // question the drawing cannot answer.
  if (nowMinutes < open) open = Math.floor(nowMinutes / 60) * 60;
  if (nowMinutes > close) close = Math.ceil(nowMinutes / 60) * 60;

  open = Math.max(0, open);
  close = Math.min(24 * 60, Math.max(close, open + 60));
  const span = close - open;

  return {
    open,
    close,
    span,
    now_percent: Math.max(0, Math.min(100, Math.round(((nowMinutes - open) / span) * 1000) / 10)),
  };
}
