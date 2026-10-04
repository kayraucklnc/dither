// POSIX TZ strings, the form the firmware's libc understands (docs/format.md
// "Times"). Only `Mm.w.d[/time]` rules are supported, which is what every zone
// in use today can be written as. The simulator does its own arithmetic rather
// than asking Intl so that it and the panel agree by construction.

export interface Zone {
  std: number; // seconds east of UTC
  dst: number | null;
  start?: RulePoint;
  end?: RulePoint;
}

interface RulePoint {
  month: number; // 1–12
  week: number; // 1–5, 5 = last
  weekday: number; // 0 = Sunday
  time: number; // seconds after local midnight
}

export interface LocalTime {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  /** Seconds east of UTC in effect at this moment. */
  offset: number;
}

const NAME = /^(?:<[^>]+>|[A-Za-z]{3,})/;
const OFFSET = /^([+-]?)(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?/;
const RULE = /^M(\d{1,2})\.(\d)\.(\d)(?:\/([+-]?\d{1,3}(?::\d{2}){0,2}))?/;

function hms(text: string): number {
  const negative = text.startsWith("-");
  const [h = "0", m = "0", s = "0"] = text.replace(/^[+-]/, "").split(":");
  const total = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return negative ? -total : total;
}

export function parseZone(tz: string): Zone {
  let rest = tz.trim();
  const take = (re: RegExp): RegExpExecArray => {
    const m = re.exec(rest);
    if (!m) throw new Error(`Unsupported TZ string: ${tz}`);
    rest = rest.slice(m[0].length);
    return m;
  };
  take(NAME);
  const off = take(OFFSET);
  // POSIX offsets count west of UTC; ours count east.
  const std = 0 - hms(`${off[1]}${off[2]}:${off[3] ?? "0"}:${off[4] ?? "0"}`) + 0;
  if (rest === "") return { std, dst: null };

  take(NAME);
  let dst = std + 3600;
  if (OFFSET.test(rest) && !rest.startsWith(",")) {
    const d = take(OFFSET);
    dst = 0 - hms(`${d[1]}${d[2]}:${d[3] ?? "0"}:${d[4] ?? "0"}`) + 0;
  }
  const rule = (): RulePoint => {
    if (!rest.startsWith(",")) throw new Error(`Unsupported TZ string: ${tz}`);
    rest = rest.slice(1);
    const m = take(RULE);
    return { month: Number(m[1]), week: Number(m[2]), weekday: Number(m[3]), time: m[4] ? hms(m[4]) : 7200 };
  };
  const start = rule();
  const end = rule();
  if (rest !== "") throw new Error(`Unsupported TZ string: ${tz}`);
  return { std, dst, start, end };
}

/** Days since 1970-01-01 for a civil date (proleptic Gregorian). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: era * 400 + yoe + (month <= 2 ? 1 : 0), month, day };
}

export function weekdayOf(days: number): number {
  return (((days + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** Local seconds-since-epoch (as if UTC) of a rule's moment in `year`. */
function ruleLocal(year: number, p: RulePoint): number {
  const first = daysFromCivil(year, p.month, 1);
  let day = first + ((p.weekday - weekdayOf(first) + 7) % 7) + (p.week - 1) * 7;
  const nextMonth = p.month === 12 ? daysFromCivil(year + 1, 1, 1) : daysFromCivil(year, p.month + 1, 1);
  while (day >= nextMonth) day -= 7;
  return day * 86400 + p.time;
}

export function offsetAt(zone: Zone, epoch: number): number {
  if (zone.dst === null || !zone.start || !zone.end) return zone.std;
  const year = civilFromDays(Math.floor((epoch + zone.std) / 86400)).year;
  const start = ruleLocal(year, zone.start) - zone.std; // written in standard time
  const end = ruleLocal(year, zone.end) - zone.dst; // written in daylight time
  const inDst = start < end ? epoch >= start && epoch < end : epoch >= start || epoch < end;
  return inDst ? zone.dst : zone.std;
}

export function toLocal(zone: Zone, epoch: number): LocalTime {
  const offset = offsetAt(zone, epoch);
  const t = epoch + offset;
  const days = Math.floor(t / 86400);
  const secs = t - days * 86400;
  const { year, month, day } = civilFromDays(days);
  return {
    year, month, day,
    hour: Math.floor(secs / 3600),
    minute: Math.floor((secs % 3600) / 60),
    second: secs % 60,
    weekday: weekdayOf(days),
    offset,
  };
}

/** A wall-clock time to an instant: standard offset if it holds there, else daylight. */
export function fromLocal(zone: Zone, l: Omit<LocalTime, "weekday" | "offset">): number {
  const asUtc = daysFromCivil(l.year, l.month, l.day) * 86400 + l.hour * 3600 + l.minute * 60 + l.second;
  const candidate = asUtc - zone.std;
  if (offsetAt(zone, candidate) === zone.std || zone.dst === null) return candidate;
  return asUtc - zone.dst;
}
