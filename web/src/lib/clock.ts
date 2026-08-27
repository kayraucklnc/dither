/**
 * Days, in the installation's time zone rather than the server's.
 *
 * "What did we take today" is a question about a calendar day somewhere, and
 * the somewhere is the installation - a box in Frankfurt showing a panel in
 * Milan must not roll the day over at Frankfurt's midnight, and a box in UTC
 * must not roll it over an hour early for either of them.
 *
 * Everything here works in whole UTC instants and asks Intl what the local
 * wall clock reads, which is the only way to get this right across daylight
 * saving without a time zone database of our own.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timezone);
  if (existing) return existing;

  const built = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // h23 rather than hour12:false, which renders midnight as 24 in some
    // engines and silently pushes every day boundary a day forward.
    hourCycle: "h23",
  });

  formatters.set(timezone, built);
  return built;
}

/** What the wall clock in `timezone` reads at this instant. */
export function wallClock(at: Date, timezone: string): WallClock {
  const parts = Object.fromEntries(
    formatterFor(timezone)
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Minutes east of UTC that `timezone` is at this instant. Positive for Milan. */
export function offsetMinutes(at: Date, timezone: string): number {
  const local = wallClock(at, timezone);
  const asIfUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );

  // Both sides truncated to the second, so the sub-second part of `at` does
  // not leak into an offset that is always a whole number of minutes.
  return Math.round((asIfUtc - Math.floor(at.getTime() / 1000) * 1000) / MINUTE);
}

/**
 * Midnight at the start of the local day containing `at`.
 *
 * Resolved twice on purpose. The offset *now* is not necessarily the offset at
 * midnight - on the day the clocks change it is an hour out - so the first
 * guess is corrected using the offset in force at the guess itself.
 */
export function startOfDay(at: Date, timezone: string): Date {
  const local = wallClock(at, timezone);
  const midnightUtc = Date.UTC(local.year, local.month - 1, local.day);

  const guess = new Date(midnightUtc - offsetMinutes(at, timezone) * MINUTE);
  return new Date(midnightUtc - offsetMinutes(guess, timezone) * MINUTE);
}

/** Midnight at the start of the local month containing `at`. */
export function startOfMonth(at: Date, timezone: string): Date {
  const local = wallClock(at, timezone);
  const firstUtc = Date.UTC(local.year, local.month - 1, 1);

  const guess = new Date(firstUtc - offsetMinutes(at, timezone) * MINUTE);
  return new Date(firstUtc - offsetMinutes(guess, timezone) * MINUTE);
}

/** `count` local days before the local day containing `at`, at midnight. */
export function startOfDaysAgo(at: Date, timezone: string, count: number): Date {
  // Stepped from noon rather than from midnight, so a day that is 23 or 25
  // hours long cannot land the arithmetic on the wrong date.
  const noon = new Date(startOfDay(at, timezone).getTime() + 12 * HOUR - count * DAY);
  return startOfDay(noon, timezone);
}

/** "2026-08-27" in the local zone. The key a day's takings are bucketed under. */
export function dayKey(at: Date, timezone: string): string {
  const local = wallClock(at, timezone);
  return (
    `${local.year}-` +
    `${String(local.month).padStart(2, "0")}-` +
    `${String(local.day).padStart(2, "0")}`
  );
}

const dayNames = new Map<string, Intl.DateTimeFormat>();

/** "Mon", in the installation's language. */
export function dayLabel(at: Date, timezone: string, locale: string): string {
  const key = `${timezone}|${locale}`;
  let formatter = dayNames.get(key);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: "short" });
    dayNames.set(key, formatter);
  }

  return formatter.format(at);
}

/** "27 Aug", for labelling a run of days that crosses a week. */
export function dateLabel(at: Date, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  }).format(at);
}

/** "in 3 days", "in 4 hours", "any moment", "overdue". */
export function whenInWords(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return "";
  if (milliseconds <= 0) return "any moment";

  const minutes = milliseconds / MINUTE;
  if (minutes < 90) return `in ${Math.max(1, Math.round(minutes))} min`;

  const hours = milliseconds / HOUR;
  if (hours < 36) return `in ${Math.round(hours)} hours`;

  const days = milliseconds / DAY;
  if (days < 14) return `in ${Math.round(days)} days`;

  return `in ${Math.round(days / 7)} weeks`;
}
