import { DAY, dateLabel, dayKey, dayLabel, startOfDay, startOfDaysAgo } from "@/lib/clock";

/**
 * The arithmetic behind the revenue numbers, kept away from the API client.
 *
 * Every function here is pure and takes plain values, because these are the
 * parts that are easy to get quietly wrong - a month normalised from a
 * quarterly price, a day bucketed in the server's zone instead of the
 * installation's, a rate computed over a window that is not the window it
 * claims. Wrong numbers on a wall are worse than no numbers, and the only way
 * to know they are right is to be able to test them without a network.
 */

export interface Entry {
  at: Date;
  /** Minor units. Positive is money in, negative is money out. */
  amount: number;
}

export interface DayBucket {
  /** "2026-08-27", local. */
  key: string;
  /** "Mon". */
  day: string;
  /** "27 Aug". */
  date: string;
  /** Minor units taken that local day. */
  amount: number;
  /** UTC instant of the start of that local day. */
  startsAt: Date;
}

/**
 * The last `days` local days, oldest first, today last.
 *
 * Every day in the range appears even when nothing came in, because a bar
 * chart with the quiet days silently dropped is a chart that lies about the
 * shape of the week.
 */
export function bucketByDay(
  entries: Entry[],
  timezone: string,
  locale: string,
  days: number,
  now: Date,
): DayBucket[] {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    const key = dayKey(entry.at, timezone);
    totals.set(key, (totals.get(key) ?? 0) + entry.amount);
  }

  return Array.from({ length: days }, (_, index) => {
    const startsAt = startOfDaysAgo(now, timezone, days - 1 - index);
    const key = dayKey(startsAt, timezone);

    return {
      key,
      day: dayLabel(startsAt, timezone, locale),
      date: dateLabel(startsAt, timezone, locale),
      amount: totals.get(key) ?? 0,
      startsAt,
    };
  });
}

export interface HourBucket {
  /** "09". */
  hour: string;
  /** "09:00". */
  label: string;
  amount: number;
  /** True once the hour has not happened yet, so a chart can stop drawing. */
  ahead: boolean;
}

/**
 * Today, hour by hour, in the installation's zone.
 *
 * The one series that says something the daily bars cannot: whether a quiet
 * day is quiet because it is nine in the morning. Hours that have not happened
 * yet are marked rather than dropped - a chart that ends at the current hour
 * looks like a chart of a whole day, and reads as a collapse.
 */
export function bucketByHour(
  entries: Entry[],
  timezone: string,
  since: Date,
  now: Date,
): HourBucket[] {
  const totals = new Array<number>(24).fill(0);
  const hourOf = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  });

  for (const entry of entries) {
    if (entry.at < since) continue;
    totals[Number(hourOf.format(entry.at))] += entry.amount;
  }

  const current = Number(hourOf.format(now));

  return totals.map((amount, hour) => ({
    hour: String(hour).padStart(2, "0"),
    label: `${String(hour).padStart(2, "0")}:00`,
    amount,
    ahead: hour > current,
  }));
}

/**
 * A running total across a series.
 *
 * What makes two periods comparable on one chart: day seven of last week
 * against day seven of this one is a race, where two jagged daily lines are a
 * pair of scribbles.
 */
export function runningTotal(amounts: number[]): number[] {
  let carried = 0;
  return amounts.map((amount) => {
    carried += amount;
    return carried;
  });
}

/** Everything on or after an instant. The rolling windows - "the last 24 hours". */
export function sumSince(entries: Entry[], since: Date): number {
  return entries.reduce((total, entry) => (entry.at >= since ? total + entry.amount : total), 0);
}

/** Everything inside a half-open range. Used for "yesterday", which has an end. */
export function sumBetween(entries: Entry[], from: Date, until: Date): number {
  return entries.reduce(
    (total, entry) => (entry.at >= from && entry.at < until ? total + entry.amount : total),
    0,
  );
}

/**
 * The windows a widget can be asked to show.
 *
 * Calendar windows and rolling windows are both here and they are not the same
 * question: "today" resets at local midnight and is small at breakfast, while
 * "the last 24 hours" is a full day's trading whatever time you look. Offering
 * only one of them is what makes a revenue panel feel wrong in the morning.
 *
 * `against` is what the comparison is *called*, which is not derivable from
 * the key: today is measured against yesterday, not against "the today before".
 */
export const WINDOWS = [
  { key: "today", label: "Today", short: "today", against: "yesterday" },
  { key: "yesterday", label: "Yesterday", short: "yesterday", against: "the day before" },
  { key: "last_24h", label: "Last 24 hours", short: "24h", against: "the 24 hours before" },
  { key: "last_7d", label: "Last 7 days", short: "7d", against: "the 7 days before" },
  { key: "last_15d", label: "Last 15 days", short: "15d", against: "the 15 days before" },
  { key: "last_30d", label: "Last 30 days", short: "30d", against: "the 30 days before" },
  { key: "month_to_date", label: "Month to date", short: "this month", against: "last month" },
  /* The one window with nothing to compare against: there is no "the all time
     before this one". Its detail line says when it starts instead. */
  { key: "all_time", label: "All time", short: "all time", against: "" },
] as const;

export type WindowKey = (typeof WINDOWS)[number]["key"];

/** How far back a rolling window reaches. Calendar windows are not here. */
export const ROLLING_DAYS: Partial<Record<WindowKey, number>> = {
  last_24h: 1,
  last_7d: 7,
  last_15d: 15,
  last_30d: 30,
};

/**
 * The rungs a milestone can land on: 1, 1.5, 2, 2.5, 3, 4, 5, 7.5 at every
 * order of magnitude.
 *
 * Powers of ten alone are useless for this - somebody at 1,284 customers is
 * told to reach 10,000, which is not a target, it is a wall. Every doubling is
 * too coarse at the bottom and too fine at the top. This ladder puts the next
 * rung between a tenth and a half again above wherever you are, which is far
 * enough to be worth reaching and near enough to be worth watching.
 */
const LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5];

function rungs(around: number): number[] {
  const magnitude = Math.max(0, Math.floor(Math.log10(Math.max(1, around))) - 1);
  const scales = [magnitude, magnitude + 1, magnitude + 2];

  return scales.flatMap((scale) => LADDER.map((rung) => rung * 10 ** scale));
}

/** The next rung above a figure. Always strictly above it, so arriving moves it on. */
export function nextMilestone(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return rungs(value).find((rung) => rung > value) ?? 10 ** (Math.floor(Math.log10(Math.max(1, value))) + 1);
}

/** The rung last passed, which is where a progress bar starts from. */
export function previousMilestone(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const passed = rungs(value).filter((rung) => rung <= value);
  return passed.length ? passed[passed.length - 1] : 0;
}

/** How many decimal places a number is actually written with. */
function places(value: number): number {
  return (String(value).split(".")[1] ?? "").length;
}

/**
 * How far there is to go, kept to the precision its two ends are written with.
 *
 * A rung is a round number and a figure is an exact count, so the difference
 * between them is exact to a person - and a fraction out to a double. 750 less
 * 525.95 is 224.04999999999995, and this number is printed rather than drawn:
 * it goes on a wall, at the size of a caption, exactly as it arrives.
 *
 * The precision is taken from both ends rather than from a constant. From the
 * figure, because this counts subscribers as readily as it counts money and
 * money is not always in hundredths - a dinar is in thousandths. And from the
 * rung, because the bottom of the ladder has halves on it: one customer of a
 * milestone of one and a half is half a customer away, and rounding that to
 * the figure's own nought decimal places would say a whole one.
 */
function gap(next: number, value: number): number {
  if (!Number.isFinite(next) || !Number.isFinite(value)) return 0;

  const decimals = Math.min(Math.max(places(next), places(value)), 15);
  return Math.max(0, Number((next - value).toFixed(decimals)));
}

export interface Milestone {
  value: number;
  next: number;
  previous: number;
  to_go: number;
  /** How far from the last rung to the next, as a percentage. */
  percent: number;
  /** Days at the rate given, when one was. Null when nothing can be said. */
  in_days: number | null;
}

/**
 * Where a figure sits between the rung it has passed and the one ahead.
 *
 * The rate is optional and stays optional: "you will pass a million in March"
 * is a sentence worth printing only when there is something real behind it,
 * and a made-up date on a wall is worse than no date.
 */
export function milestoneOf(value: number, ratePerDay?: number): Milestone {
  const next = nextMilestone(value);
  const previous = previousMilestone(value);
  const span = Math.max(1, next - previous);
  const toGo = gap(next, value);

  return {
    value,
    next,
    previous,
    to_go: toGo,
    percent: Math.max(0, Math.min(100, Math.round(((value - previous) / span) * 100))),
    in_days:
      ratePerDay && ratePerDay > 0 ? Math.max(0, Math.round(toGo / ratePerDay)) : null,
  };
}

export interface Recurring {
  /** Minor units charged each period. */
  unitAmount: number;
  quantity: number;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
}

/** Days in an average month. Used so weekly and daily prices normalise sanely. */
const DAYS_PER_MONTH = 30.436875;

/**
 * What one recurring price is worth per month.
 *
 * A yearly plan is not a month's revenue and a weekly one is more than it
 * looks; MRR only means anything if every cadence is put on the same footing
 * first. A quarterly price is `month` with an interval count of three, which
 * is the case people forget.
 */
export function monthlyValue(price: Recurring): number {
  const perPeriod = price.unitAmount * price.quantity;
  const count = Math.max(1, price.intervalCount);

  switch (price.interval) {
    case "day":
      return (perPeriod * DAYS_PER_MONTH) / count;
    case "week":
      return (perPeriod * DAYS_PER_MONTH) / (7 * count);
    case "month":
      return perPeriod / count;
    case "year":
      return perPeriod / (12 * count);
  }
}

export interface Discount {
  percentOff?: number | null;
  amountOff?: number | null;
}

/** A discount applied to a monthly figure. Percentage first, then any flat amount. */
export function afterDiscounts(monthly: number, discounts: Discount[]): number {
  const discounted = discounts.reduce((running, discount) => {
    const afterPercent = discount.percentOff
      ? running * (1 - discount.percentOff / 100)
      : running;

    return discount.amountOff ? afterPercent - discount.amountOff : afterPercent;
  }, monthly);

  return Math.max(0, discounted);
}

export interface Forecast {
  /** When the next one is expected. Null when there is nothing to go on. */
  expectedAt: Date | null;
  /** Signups per week over the window, rounded to one place. */
  perWeek: number;
  /** How many the window actually contained. The reason to trust it or not. */
  sample: number;
  /** steady | rough | guess | none. Said out loud rather than implied. */
  confidence: "steady" | "rough" | "guess" | "none";
}

/**
 * When to expect the next subscriber, from how often the last ones arrived.
 *
 * This is a rate, not a prophecy, and it says so: eleven signups in a month is
 * a rate worth quoting, two is a coincidence with an average. The confidence
 * comes back with the date so a design can print "roughly" rather than
 * implying Stripe knows something it does not.
 *
 * Measured from the most recent signup rather than from now, because that is
 * where the clock on the *next* one actually started.
 */
export function forecastNext(created: Date[], windowDays: number, now: Date): Forecast {
  const withinWindow = created
    .filter((at) => now.getTime() - at.getTime() <= windowDays * DAY)
    .sort((a, b) => a.getTime() - b.getTime());

  const sample = withinWindow.length;
  const perWeek = Math.round((sample / windowDays) * 7 * 10) / 10;

  if (!sample) return { expectedAt: null, perWeek: 0, sample: 0, confidence: "none" };

  const gap = (windowDays * DAY) / sample;
  const last = withinWindow[withinWindow.length - 1];

  // Never in the past: "expected three days ago" is not a forecast, it is a
  // way of saying the rate has dropped, and the honest reading of that is
  // "due now".
  const expectedAt = new Date(Math.max(now.getTime(), last.getTime() + gap));

  return {
    expectedAt,
    perWeek,
    sample,
    confidence: sample >= 8 ? "steady" : sample >= 3 ? "rough" : "guess",
  };
}

/** The start of "today" and of the windows that hang off it. */
export function windowStarts(now: Date, timezone: string) {
  return {
    today: startOfDay(now, timezone),
    yesterday: startOfDaysAgo(now, timezone, 1),
    last24h: new Date(now.getTime() - DAY),
  };
}
