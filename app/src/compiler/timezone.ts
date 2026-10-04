// An IANA zone ("Europe/Istanbul") as the POSIX TZ string the panel's libc
// wants. Intl knows offsets but not rules, so the rules are read back off the
// calendar: find this year's two transitions and describe each as "the n-th
// weekday of the month at hh:mm", which is how every zone in use today works.

const HOUR = 3600;
const DAY = 86400;

export function offsetOf(zone: string, epoch: number): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(new Date(epoch * 1000))
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * HOUR + Number(m[3]) * 60);
}

function posixOffset(east: number): string {
  const west = -east;
  const sign = west < 0 ? "-" : "";
  const abs = Math.abs(west);
  const h = Math.floor(abs / HOUR);
  const m = Math.floor((abs % HOUR) / 60);
  return `${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** First instant at or after `from` with a different offset, to the minute. */
function transition(zone: string, from: number, to: number): number | null {
  const start = offsetOf(zone, from);
  let t = from;
  while (t < to && offsetOf(zone, t + DAY) === start) t += DAY;
  if (t >= to) return null;
  let lo = t;
  let hi = t + DAY;
  while (hi - lo > 60) {
    const mid = Math.floor((lo + hi) / 2 / 60) * 60;
    if (offsetOf(zone, mid) === start) lo = mid;
    else hi = mid;
  }
  return hi;
}

function rule(at: number, offsetBefore: number): string {
  const local = new Date((at + offsetBefore) * 1000);
  const month = local.getUTCMonth() + 1;
  const day = local.getUTCDate();
  const weekday = local.getUTCDay();
  const daysInMonth = new Date(Date.UTC(local.getUTCFullYear(), month, 0)).getUTCDate();
  const week = day + 7 > daysInMonth ? 5 : Math.ceil(day / 7);
  const secs = local.getUTCHours() * HOUR + local.getUTCMinutes() * 60;
  const time = secs === 2 * HOUR ? "" : `/${Math.floor(secs / HOUR)}${secs % HOUR ? `:${String((secs % HOUR) / 60).padStart(2, "0")}` : ""}`;
  return `M${month}.${week}.${weekday}${time}`;
}

export function posixTz(zone: string, year = new Date().getUTCFullYear()): string {
  const from = Date.UTC(year, 0, 1) / 1000;
  const to = Date.UTC(year + 1, 0, 1) / 1000;
  const first = transition(zone, from, to);
  if (first === null) return `STD${posixOffset(offsetOf(zone, from))}`;
  const second = transition(zone, first, to);
  if (second === null) return `STD${posixOffset(offsetOf(zone, first))}`;
  const a = offsetOf(zone, first - 60);
  const b = offsetOf(zone, first);
  const std = Math.min(a, b);
  const dst = Math.max(a, b);
  // Which transition starts daylight time depends on the hemisphere.
  const [start, end] = b > a ? [first, second] : [second, first];
  const dstPart = dst - std === HOUR ? "" : posixOffset(dst);
  return `STD${posixOffset(std)}DST${dstPart},${rule(start, std)},${rule(end, dst)}`;
}

export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
