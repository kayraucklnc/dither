/**
 * Wall clock arithmetic, in the only form a screen cares about: "HH:MM".
 *
 * Operators quote local times as strings. Round-tripping those through Date
 * inherits a time zone by accident - the server's - and a board in Milan then
 * quietly shows Istanbul's idea of when the train leaves. So this stays in
 * strings.
 */
export const MINUTES_PER_DAY = 1440;

/** The leading "HH:MM" of anything clock shaped, or undefined. */
export function clockOf(value: unknown): string | undefined {
  return /^(\d{2}:\d{2})/.exec(String(value ?? ""))?.[1];
}

export function minutesOf(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

export function shift(clock: string, late: number): string {
  const total = (minutesOf(clock) + late + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Minutes from one clock time to another.
 *
 * A gap of more than half a day reads as an *earlier* time rather than a
 * twenty-three-hour delay, which is the only sane reading when a train is
 * running slightly ahead of its published time.
 */
export function between(from: string, to: string): number {
  const difference = (minutesOf(to) - minutesOf(from) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return difference < MINUTES_PER_DAY / 2 ? difference : 0;
}

/** "1h05", "24m" - what a board prints for a journey length. */
export function duration(value: unknown): string | undefined {
  const parsed = clockOf(value);
  if (!parsed) return undefined;

  const [hours, minutes] = parsed.split(":").map(Number);
  return hours === 0 ? `${minutes}m` : `${hours}h${String(minutes).padStart(2, "0")}`;
}

/**
 * Minutes from now until a wall clock time, allowing for a train that runs
 * tomorrow.
 *
 * A time that has only just passed reads as almost a full day away without the
 * final clause, which would make "leaves in under ten minutes" quietly never
 * fire in the one minute it matters most.
 */
export function minutesUntil(clock: string | undefined, now: Date, dayOffset = 0): number | null {
  if (!clock) return null;

  const target = minutesOf(clock);
  const current = now.getHours() * 60 + now.getMinutes();
  const elapsed = target - current + dayOffset * MINUTES_PER_DAY;

  return elapsed < 0 && elapsed > -120 ? 0 : elapsed;
}
