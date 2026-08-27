/**
 * Quiet hours.
 *
 * An e-ink panel costs almost nothing to leave lit and quite a lot to wake, so
 * the way to save a battery overnight is to stop waking it - not to blank it.
 * Inside the window a device keeps whatever it is showing and is told to sleep
 * until the window ends, which is one wake instead of forty.
 */
export interface QuietHours {
  startMinute: number | null;
  stopMinute: number | null;
}

const DAY = 1440;

export function inQuietHours(hours: QuietHours, minutesOfDay: number): boolean {
  const { startMinute, stopMinute } = hours;
  if (startMinute === null || stopMinute === null || startMinute === stopMinute) return false;

  // A window that ends before it starts has wrapped past midnight, which is
  // the normal case for "quiet from 23:00 to 07:00".
  return startMinute < stopMinute
    ? minutesOfDay >= startMinute && minutesOfDay < stopMinute
    : minutesOfDay >= startMinute || minutesOfDay < stopMinute;
}

/** Seconds until the window ends, so the device wakes exactly once. */
export function secondsUntilAwake(hours: QuietHours, minutesOfDay: number): number {
  if (hours.stopMinute === null) return 0;

  const remaining = (hours.stopMinute - minutesOfDay + DAY) % DAY;
  // Never zero: a device told to sleep for no time would spin.
  return Math.max(60, remaining * 60);
}

/** "23:00" from minutes past midnight, and back. */
export const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function fromClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < DAY ? minutes : null;
}
