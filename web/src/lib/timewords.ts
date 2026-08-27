/**
 * Saying the time in words, for a panel that is only redrawn every so often.
 *
 * A device wakes, is handed a picture, and paints it. Then it sleeps - for a
 * quarter of an hour, usually. So a clock that draws "10:07" is right for one
 * minute and wrong for fourteen, and nothing about the drawing admits it. That
 * is the whole problem this file exists for.
 *
 * The answer is not to refresh faster; an e-ink panel that redraws sixty times
 * an hour is a panel with a flat battery. It is to say something that stays
 * true for as long as the picture is on the wall. "Just gone half past ten" is
 * true at 10:31 and still true at 10:44, and it was never a promise of
 * anything finer.
 *
 * Everything here takes minutes since local midnight and a window in minutes -
 * how long this drawing has to survive - and returns something that does not
 * become a lie inside that window.
 */

const HOURS = [
  "twelve", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten", "eleven",
];

const MINUTES: Record<number, string> = {
  0: "o'clock",
  5: "five past",
  10: "ten past",
  15: "quarter past",
  20: "twenty past",
  25: "twenty-five past",
  30: "half past",
  35: "twenty-five to",
  40: "twenty to",
  45: "quarter to",
  50: "ten to",
  55: "five to",
};

export const MINUTES_IN_DAY = 24 * 60;

/** Minutes since midnight, wrapped into a day. Handles a window past midnight. */
export function wrap(minutes: number): number {
  return ((Math.round(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
}

/**
 * A five-minute mark said the way it is spoken: "quarter past ten", "midnight".
 *
 * Only ever called on multiples of five, because those are the only marks that
 * have names - and a clock in words that says "seventeen minutes past" is a
 * clock nobody reads faster than the digits it replaced.
 */
export function clockWords(minutes: number): string {
  const at = wrap(minutes);
  if (at === 0) return "midnight";
  if (at === 12 * 60) return "noon";

  const hour = Math.floor(at / 60);
  const past = at % 60;
  const said = MINUTES[past] ?? `${past} past`;

  // "quarter to eleven" is named after the hour it is running towards.
  const named = past > 30 ? (hour + 1) % 24 : hour;
  const spoken = HOURS[named % 12];

  return past === 0 ? `${spoken} o'clock` : `${said} ${spoken}`;
}

/**
 * The time in words, hedged by however long the drawing has to last.
 *
 * The hedge is the honest part. Inside one quarter of an hour there is a mark
 * just behind us and the picture will not outlive it, so "just gone" is safe.
 * Where the window crosses the next mark, "just" stops being true before the
 * device wakes again and the phrase drops it. Wider still and only the part of
 * the day can be promised.
 *
 * Never rounds *forward*. A panel that goes up at ten o'clock saying "quarter
 * past" is wrong the moment anybody looks at it, which is the one failure that
 * makes a clock worse than no clock.
 */
export function timeInWords(minutes: number, windowMinutes = 15): string {
  const at = wrap(minutes);
  const window = Math.max(0, Math.round(windowMinutes));

  if (window > 45) return partOfDay(at + window / 2);

  const anchor = Math.floor(at / 15) * 15;
  const crosses = Math.floor((at + window) / 15) * 15 !== anchor;
  const said = clockWords(anchor);

  if (!crosses) return at - anchor < 4 ? said : `just gone ${said}`;

  // The window runs past the next mark, so anything about how recent this one
  // is will have expired by the time the device wakes. "After" does not.
  return `after ${said}`;
}

interface Part {
  /** Minutes since midnight this part starts at. */
  from: number;
  label: string;
}

/**
 * The parts of a day, in the words people use for them.
 *
 * Deliberately uneven: "afternoon" is five hours and "midday" is one, because
 * that is how the words are used, not because the day divides tidily.
 */
const PARTS: Part[] = [
  { from: 0, label: "the small hours" },
  { from: 5 * 60, label: "early morning" },
  { from: 8 * 60, label: "morning" },
  { from: 11 * 60 + 30, label: "midday" },
  { from: 13 * 60, label: "afternoon" },
  { from: 17 * 60, label: "late afternoon" },
  { from: 19 * 60, label: "evening" },
  { from: 22 * 60, label: "night" },
];

/** "morning", "late afternoon" - the coarsest thing a clock can say. */
export function partOfDay(minutes: number): string {
  const at = wrap(minutes);
  return [...PARTS].reverse().find((part) => at >= part.from)!.label;
}

/**
 * How far through a stretch of the day we are, as a percentage.
 *
 * A window that ends before it starts is one that runs through midnight - a
 * waking day of 07:00 to 01:00 is a perfectly ordinary thing to ask for, and
 * the arithmetic has to survive it rather than returning nothing.
 */
export function throughDay(minutes: number, startMinute: number, endMinute: number): number {
  const start = wrap(startMinute);
  const end = wrap(endMinute);
  const span = end > start ? end - start : MINUTES_IN_DAY - start + end;
  if (span <= 0) return 0;

  const since = wrap(minutes - start);

  // Before the window opens, `since` is nearly a whole day rather than
  // negative. Anything past the end reads as not started rather than as over.
  if (since > span) return since > span + (MINUTES_IN_DAY - span) / 2 ? 0 : 100;
  return Math.round((since / span) * 1000) / 10;
}

/** "4h 20m", "35m" - a span said the way a person would say it. */
export function spanInWords(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;

  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
