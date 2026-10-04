// Values to text: docs/format.md "Formats", "Numbers" and "Times".

import type { Format, Locale, Value, Values } from "./types";
import { civilFromDays, daysFromCivil, fromLocal, offsetAt, toLocal, weekdayOf, type LocalTime, type Zone } from "./tz";

export interface FormatContext {
  now: number;
  zone: Zone;
  locale: Locale;
  /** For `shift`, which reads a second value. */
  values?: Values;
}

const DEFAULT_FALLBACK = "–";

/** Round half away from zero to `d` places, as an integer count of 10^-d. */
function scaled(v: number, d: number): number {
  const r = Math.round(Math.abs(v) * 10 ** d);
  return v < 0 ? -r : r;
}

function withPoint(r: number, d: number): string {
  const negative = r < 0;
  const digits = String(Math.abs(r)).padStart(d + 1, "0");
  const int = digits.slice(0, digits.length - d);
  const frac = digits.slice(digits.length - d);
  const body = d > 0 ? `${int}.${frac}` : int;
  return negative && r !== 0 ? `-${body}` : body;
}

export function fixed(v: number, d: number, sep?: string): string {
  const text = withPoint(scaled(v, d), d);
  if (!sep) return text;
  const negative = text.startsWith("-");
  const [int, frac] = (negative ? text.slice(1) : text).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return `${negative ? "-" : ""}${grouped}${frac !== undefined ? `.${frac}` : ""}`;
}

/** 74,120 → "74.1k": the scale is chosen before rounding, so 999,950 → "1000k". */
export function compact(v: number): string {
  const a = Math.abs(v);
  const [div, suffix] = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : [1e3, "k"];
  return `${fixed(v / div, 1).replace(/\.0$/, "")}${suffix}`;
}

export function automatic(v: number): string {
  const text = withPoint(scaled(v, 2), 2);
  return text.replace(/\.?0+$/, "");
}

export function toText(v: Value): string {
  if (v === null) return DEFAULT_FALLBACK;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return "";
  return automatic(v);
}

// ---------------------------------------------------------------- times

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

interface Moment {
  local: LocalTime;
  epoch: number;
}

const WALL = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "08:15" on yesterday, today or tomorrow — whichever is nearest to now. */
function wallClock(m: RegExpExecArray, zone: Zone, now: number): Moment | null {
  const [hour, minute, second] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (hour > 23 || minute > 59 || second > 59) return null;
  const today = toLocal(zone, now);
  let best: number | null = null;
  for (const shift of [-1, 0, 1]) {
    const d = civilFromDays(daysFromCivil(today.year, today.month, today.day) + shift);
    const epoch = fromLocal(zone, { ...d, hour, minute, second });
    // Nearest to now wins; scanning earliest first keeps the earlier on a tie.
    if (best === null || Math.abs(epoch - now) < Math.abs(best - now)) best = epoch;
  }
  return best === null ? null : { local: toLocal(zone, best), epoch: best };
}

export function readTime(v: Value, zone: Zone, now: number): Moment | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return { local: toLocal(zone, v), epoch: v };
  }
  if (typeof v !== "string") return null;
  const wall = WALL.exec(v);
  if (wall) return wallClock(wall, zone, now);
  const m = ISO.exec(v);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [hour, minute, second] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  const monthDays = month === 12 ? 31 : daysFromCivil(year, month + 1, 1) - daysFromCivil(year, month, 1);
  if (month < 1 || month > 12 || day < 1 || day > monthDays || hour > 23 || minute > 59 || second > 59) return null;
  const zoneText = m[7];
  if (zoneText !== undefined) {
    const offset = zoneText === "Z" ? 0 : (zoneText.startsWith("-") ? -1 : 1) *
      (Number(zoneText.slice(1, 3)) * 3600 + Number(zoneText.slice(4, 6)) * 60);
    const epoch = daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset;
    return { local: toLocal(zone, epoch), epoch };
  }
  const days = daysFromCivil(year, month, day);
  const fields = { year, month, day, hour, minute, second };
  const epoch = fromLocal(zone, fields);
  return { local: { ...fields, weekday: weekdayOf(days), offset: offsetAt(zone, epoch) }, epoch };
}

const TOKENS = ["YYYY", "MMMM", "MMM", "MM", "M", "DD", "D", "dddd", "ddd", "HH", "H", "hh", "h", "mm", "ss", "A", "Z"];
const pad = (n: number) => String(n).padStart(2, "0");

function token(t: string, l: LocalTime, locale: Locale): string {
  const h12 = l.hour % 12 === 0 ? 12 : l.hour % 12;
  switch (t) {
    case "YYYY": return String(l.year);
    case "MMMM": return locale.months[l.month - 1] ?? "";
    case "MMM": return locale.monthsShort[l.month - 1] ?? "";
    case "MM": return pad(l.month);
    case "M": return String(l.month);
    case "DD": return pad(l.day);
    case "D": return String(l.day);
    case "dddd": return locale.days[l.weekday] ?? "";
    case "ddd": return locale.daysShort[l.weekday] ?? "";
    case "HH": return pad(l.hour);
    case "H": return String(l.hour);
    case "hh": return pad(h12);
    case "h": return String(h12);
    case "mm": return pad(l.minute);
    case "ss": return pad(l.second);
    case "Z": {
      const a = Math.abs(l.offset);
      return `${l.offset < 0 ? "-" : "+"}${pad(Math.floor(a / 3600))}:${pad(Math.floor((a % 3600) / 60))}`;
    }
    default: return l.hour < 12 ? "AM" : "PM";
  }
}

export function formatTime(pattern: string, l: LocalTime, locale: Locale): string {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close >= 0) {
        out += pattern.slice(i + 1, close);
        i = close + 1;
        continue;
      }
    }
    const t = TOKENS.find((tok) => pattern.startsWith(tok, i));
    if (t) {
      out += token(t, l, locale);
      i += t.length;
    } else {
      out += pattern[i];
      i += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- upper

export function upper(text: string, tr: boolean): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c === 0x69 && tr) out += "\u0130";
    else if (c >= 0x61 && c <= 0x7a) out += String.fromCodePoint(c - 0x20);
    else if (c >= 0xe0 && c <= 0xfe && c !== 0xf7) out += String.fromCodePoint(c - 0x20);
    else if (c === 0x11f) out += "\u011e";
    else if (c === 0x15f) out += "\u015e";
    else if (c === 0x131) out += "I";
    else out += ch;
  }
  return out;
}

// ---------------------------------------------------------------- formats

function sameKey(a: Value, k: number | string): boolean {
  return (typeof a === "number" && typeof k === "number" && a === k) ||
    (typeof a === "string" && typeof k === "string" && a === k);
}

/** A format's value steps alone — until, scale, add, steps, map — as rules use them. */
export function applyValueSteps(input: Value, f: Format, ctx: FormatContext): Value {
  let v: Value = input;
  if (v === null) return null;
  if (f.shift) {
    const m = readTime(v, ctx.zone, ctx.now);
    if (!m) return null;
    const by = ctx.values?.get(f.shift.v);
    v = m.epoch + (typeof by === "number" && Number.isFinite(by) ? by * (f.shift.scale ?? 1) : 0);
  }
  if (f.days) {
    const m = readTime(v, ctx.zone, ctx.now);
    if (!m) return null;
    const today = toLocal(ctx.zone, ctx.now);
    v = daysFromCivil(m.local.year, m.local.month, m.local.day) - daysFromCivil(today.year, today.month, today.day);
  } else if (f.until) {
    const m = readTime(v, ctx.zone, ctx.now);
    if (!m || m.epoch < ctx.now) return null;
    v = Math.floor((m.epoch - ctx.now) / 60);
  }
  if (f.scale !== undefined || f.add !== undefined) {
    if (typeof v !== "number") return null;
    v = v * (f.scale ?? 1) + (f.add ?? 0);
  }
  if (f.steps) {
    if (typeof v !== "number") return null;
    const n = v;
    const k = f.steps.t.filter((t) => t <= n).length;
    v = f.steps.o[k] ?? null;
    if (v === null) return null;
  }
  if (f.map) {
    const i = f.map.k.findIndex((k) => sameKey(v, k));
    v = i >= 0 ? (f.map.o[i] ?? null) : (f.map.d ?? null);
  }
  return v;
}

/** Apply a format, returning the resulting value (text, or null). */
function applyFormat(input: Value, f: Format, ctx: FormatContext): Value {
  let v = applyValueSteps(input, f, ctx);
  if (v === null) return null;
  if (f.num) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    if (f.num.compact && Math.abs(v) >= 1000) v = compact(v);
    else if (f.num.d === undefined) v = automatic(v);
    else {
      const d = Math.max(0, Math.min(15, Math.trunc(f.num.d)));
      if (Math.abs(v) * 10 ** d >= 2 ** 63) return null;
      v = fixed(v, d, f.num.sep);
    }
  }
  if (f.time !== undefined) {
    const m = readTime(v, ctx.zone, ctx.now);
    if (!m) return null;
    v = formatTime(f.time, m.local, ctx.locale);
  }
  if (f.upper) v = upper(toText(v), f.tr === true);
  return v;
}

export function formatValue(v: Value, f: Format | undefined, ctx: FormatContext): string {
  if (!f) return toText(v);
  const out = applyFormat(v, f, ctx);
  return out === null ? (f.fallback ?? DEFAULT_FALLBACK) : toText(out);
}
