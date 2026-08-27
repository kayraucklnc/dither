import { HOUR, endOfDay, endOfMonth, endOfWeek } from "@/lib/clock";

/**
 * How far ahead a calendar widget looks, in the words people use.
 *
 * "Next twelve hours" is a machine's way of saying it, and it was the only way
 * this could be said. But nobody plans in a rolling twelve hours - they ask
 * what is left today, what the week holds, whether the month is full. Those
 * are calendar boundaries in a *place*, not durations, and at 22:00 the
 * difference is the whole point: "the rest of today" is two hours, "the next
 * twelve" is most of tomorrow morning as well.
 *
 * The hours option stays, because a rolling window is genuinely right for a
 * panel by a desk that only cares about the next meeting.
 */

export type RangeKey = "today" | "tomorrow" | "week" | "month" | "hours";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "The rest of today" },
  { key: "tomorrow", label: "Today and tomorrow" },
  { key: "week", label: "The rest of this week" },
  { key: "month", label: "The rest of this month" },
  { key: "hours", label: "The next few hours" },
];

const KEYS = new Set(RANGES.map((range) => range.key));

export const isRangeKey = (value: unknown): value is RangeKey =>
  typeof value === "string" && KEYS.has(value as RangeKey);

/** The widest window anything will ask for, so one bound covers every range. */
export const MAX_HORIZON_HOURS = 72;

export function horizonHours(settings: Record<string, unknown>): number {
  const asked = Number(settings.horizon_hours ?? 12);
  if (!Number.isFinite(asked)) return 12;

  return Math.min(MAX_HORIZON_HOURS, Math.max(1, Math.round(asked)));
}

export interface Window {
  from: Date;
  to: Date;
  key: RangeKey;
  /** What the widget is showing, for a heading that was left blank. */
  label: string;
  /**
   * What to say when there is nothing in it.
   *
   * "Nothing scheduled" is the same sentence whether you asked about the next
   * two hours or the rest of the month, and those are very different pieces of
   * news. An empty panel should say what it looked at, or you cannot tell an
   * empty calendar from a window that was too narrow.
   */
  emptyLabel: string;
  /** True when the window can hold more than one day, so days want labelling. */
  spansDays: boolean;
}

/**
 * The window a widget's settings ask for.
 *
 * Always starting now rather than at the start of the day: a panel shows what
 * is ahead of you, and a meeting that finished an hour ago is not that. The
 * end is a boundary in the installation's own zone, so "today" rolls over at
 * the panel's midnight and not the server's.
 */
export function windowFor(
  settings: Record<string, unknown>,
  now: Date,
  timezone: string,
  locale: string,
): Window {
  // A widget saved before ranges existed has `horizon_hours` and no `range`,
  // and must keep meaning what it meant - changing under someone is worse than
  // a slightly odd default. A new widget always carries `range`, so this only
  // ever catches the old ones.
  const key: RangeKey = isRangeKey(settings.range)
    ? settings.range
    : settings.horizon_hours === undefined
      ? "today"
      : "hours";

  if (key === "hours") {
    const hours = horizonHours(settings);
    return {
      from: now,
      to: new Date(now.getTime() + hours * HOUR),
      key,
      label: `Next ${hours} hours`,
      emptyLabel: `Nothing in the next ${hours} hour${hours === 1 ? "" : "s"}`,
      spansDays: hours > 12,
    };
  }

  const to =
    key === "today"
      ? endOfDay(now, timezone)
      : key === "tomorrow"
        ? endOfDay(new Date(endOfDay(now, timezone).getTime() + 12 * HOUR), timezone)
        : key === "week"
          ? endOfWeek(now, timezone, locale)
          : endOfMonth(now, timezone);

  const label =
    key === "today" ? "Today" : key === "tomorrow" ? "Tomorrow" : key === "week" ? "This week" : "This month";

  const emptyLabel =
    key === "today"
      ? "Nothing left today"
      : key === "tomorrow"
        ? "Nothing today or tomorrow"
        : key === "week"
          ? "Nothing this week"
          : "Nothing this month";

  return { from: now, to, key, label, emptyLabel, spansDays: key !== "today" };
}
