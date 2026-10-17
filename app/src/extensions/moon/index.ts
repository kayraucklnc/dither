import type { Condition, Format } from "@/runtime/types";
import { localeFor } from "@/compiler/locale";
import { posixTz } from "@/compiler/timezone";
import { civilFromDays, daysFromCivil, fromLocal, parseZone, toLocal, type Zone } from "@/runtime/tz";
import { defineExtension, type Box, type Draw, type Env, type Fact } from "../api";
import { phaseAt, phasesBetween, type PhaseEvent, type Quarter } from "./ephemeris";
import { moonInk } from "./render";

// The moon tonight, and when it is next full and new. The panel cannot do the
// astronomy, so the project works out the next three years when it is built,
// one local day at a time, and hands the panel tables to read by its clock:
// which picture, what it is called, how much is lit. The dates ahead are
// groups that each show between two phases. Flashing again starts three more.

const YEARS = 3;
/** Pictures in a month, 15° apart, so each quarter has its own. */
const BUCKETS = 24;
/** The moon is shown as it is at this local hour. */
const EVENING = 21;
/** A larger moon is a larger bitmap, once per picture. */
const MAX_MOON = 224;
const AIR = 4; // some glyphs reach above the ascent

export const QUARTERS = ["New moon", "First quarter", "Full moon", "Last quarter"] as const;
const BETWEEN = ["Waxing crescent", "Waxing gibbous", "Waning gibbous", "Waning crescent"] as const;
const NAMES = [...QUARTERS, ...BETWEEN];

export interface MoonDay {
  /** Local midnight that starts the day, and the next; Unix seconds. */
  start: number;
  end: number;
  /** Phase angle at `EVENING`: 0 new, 180 full. */
  angle: number;
  lit: number;
  /** A phase that falls on this day. */
  event: PhaseEvent | null;
}

/** The panel's own rules for the zone, so the days here end where its days do. Finding them asks Intl a year of questions: once. */
const zones = new Map<string, Zone>();
function zoneOf(timezone: string): Zone {
  let zone = zones.get(timezone);
  if (!zone) zones.set(timezone, (zone = parseZone(posixTz(timezone))));
  return zone;
}

/** Every local day from yesterday (the panel's clock may run behind) for `years` years. */
export function moonDays(now: number, timezone: string, years = YEARS): MoonDay[] {
  const zone = zoneOf(timezone);
  const today = toLocal(zone, now);
  const first = daysFromCivil(today.year, today.month, today.day) - 1;
  const count = Math.round(years * 365.25) + 1;
  const midnight = (n: number, hour = 0) => fromLocal(zone, { ...civilFromDays(first + n), hour, minute: 0, second: 0 });
  const days: MoonDay[] = [];
  for (let n = 0; n < count; n++) {
    const { angle, lit } = phaseAt(midnight(n, EVENING));
    days.push({ start: midnight(n), end: midnight(n + 1), angle, lit, event: null });
  }
  for (const e of phasesBetween(days[0].start, days[days.length - 1].end)) {
    const day = days.find((d) => e.at >= d.start && e.at < d.end);
    if (day) day.event = e;
  }
  return days;
}

export function nameOf(day: MoonDay): string {
  return day.event ? QUARTERS[day.event.quarter] : BETWEEN[Math.min(3, Math.floor(day.angle / 90))];
}

/** The picture for a day: on a quarter's day, exactly that quarter. */
export function bucketOf(day: MoonDay): number {
  if (day.event) return (day.event.quarter * BUCKETS) / 4;
  return Math.round(day.angle / (360 / BUCKETS)) % BUCKETS;
}

/** Whole percent; 100 only on the full moon's day and 0 only on the new moon's, so the name and number agree. */
export function litOf(day: MoonDay): string {
  const q = day.event?.quarter;
  const pct = Math.round(day.lit * 100);
  return String(q === 2 ? 100 : q === 0 ? 0 : Math.min(99, Math.max(1, pct)));
}

/**
 * `clock.epoch` through `steps` to what `of` says for that day; `after` once
 * the tables run out, and today's answer while the clock is unknown.
 */
export function daily(days: readonly MoonDay[], today: MoonDay, of: (d: MoonDay) => string, after: string): Format {
  const t: number[] = [];
  const o = [of(days[0])];
  for (const d of days.slice(1)) {
    const v = of(d);
    if (v === o[o.length - 1]) continue;
    t.push(d.start);
    o.push(v);
  }
  t.push(days[days.length - 1].end);
  o.push(after);
  return { steps: { t, o }, fallback: of(today) };
}

const isoDate = (epoch: number, timezone: string) => {
  const l = toLocal(zoneOf(timezone), epoch);
  return `${l.year}-${String(l.month).padStart(2, "0")}-${String(l.day).padStart(2, "0")}`;
};

interface Stretch {
  /** From the day after the last such phase to the end of this one's day. */
  when: Condition;
  /** The phase's local date, `YYYY-MM-DD`, and the day before it began. */
  date: string;
  eve: number;
}

/** For each phase of kind `q`: when it is the next one, and its date. Today's also shows while the clock is unknown. */
export function stretches(days: readonly MoonDay[], q: Quarter, now: number, timezone: string): Stretch[] {
  const out: Stretch[] = [];
  let from = days[0].start;
  for (const d of days) {
    if (d.event?.quarter !== q) continue;
    const span: Condition = { v: "clock.epoch", op: "between", x: [from, d.end] };
    const current = now >= from && now < d.end;
    out.push({ when: current ? { any: [span, { v: "clock.epoch", op: "absent" }] } : span, date: isoDate(d.event.at, timezone), eve: d.start - 86400 });
    from = d.end;
  }
  return out;
}

/** The date of the next phase of kind `q`, read off the clock and written in the panel's language. */
export function nextDate(days: readonly MoonDay[], q: Quarter, timezone: string): Format {
  const t: number[] = [];
  const o: string[] = [];
  for (const d of days) {
    if (d.event?.quarter !== q) continue;
    o.push(isoDate(d.event.at, timezone));
    t.push(d.end);
  }
  o.push("");
  return { steps: { t, o }, time: "ddd D MMM", fallback: "" };
}

const IN_DAYS: Format = { days: true, num: { d: 0 } };
const NEAR: Format = { days: true, map: { k: [0, 1], o: ["today", "tomorrow"] }, fallback: "" };

interface Settings extends Record<string, unknown> {
  hemisphere: "auto" | "north" | "south";
  details: boolean;
  phases: boolean;
}

const southern = (s: Settings, env: Env) =>
  s.hemisphere === "south" || (s.hemisphere !== "north" && (env.place?.latitude ?? 0) < 0);

/** The worst case of a short date in the panel's language, to lay out for. */
function longestDate(d: Draw, env: Env, size: number, weight: 400 | 700): string {
  const locale = localeFor(env.language);
  const widest = (xs: readonly string[]) => xs.reduce((a, b) => (d.measure(b, size, weight) > d.measure(a, size, weight) ? b : a));
  return `${widest(locale.daysShort)} 30 ${widest(locale.monthsShort)}`;
}

function drawMoon(d: Draw, box: Box, days: readonly MoonDay[], today: MoonDay, south: boolean): void {
  const size = Math.min(box.w, box.h, MAX_MOON);
  const at = { x: box.x + Math.floor((box.w - size) / 2), y: box.y + Math.floor((box.h - size) / 2), w: size, h: size };
  const pictures: Record<string, (x: number, y: number) => boolean> = {};
  for (const b of new Set(days.map(bucketOf))) pictures[`m${b}`] = moonInk(size, (b * 360) / BUCKETS, south);
  d.pictureFor("clock.epoch", daily(days, today, (x) => `m${bucketOf(x)}`, ""), at, `moon-${south ? "s" : "n"}`, pictures);
}

/** The name, how much is lit, and when it is next full and new, stacked in `box`. */
function drawDetails(d: Draw, box: Box, days: readonly MoonDay[], today: MoonDay, env: Env, align: "left" | "center"): void {
  const name = d.fit(NAMES, box.w, Math.max(12, Math.round(box.h * 0.2)), { weight: 700, min: 12, max: 40 });
  const small = d.fit(["100% lit"], box.w, Math.round(name * 0.7), { min: 12, max: 24 });
  const nameH = d.lineHeight(name, 700) + AIR;
  const smallH = d.lineHeight(small);
  // A row: the phase, then its date and, when there is room beside it, how far off it is.
  const rowSize = d.fit([longestDate(d, env, small, 700)], box.w, smallH, { weight: 700, min: 12, max: small });
  const countdown = align === "left" && d.measure(longestDate(d, env, rowSize, 700), rowSize, 700) + d.measure("  in 29 days", rowSize) <= box.w;
  const rowH = smallH + d.lineHeight(rowSize, 700) + 6;
  const gap = Math.round(small * 0.8);
  const rows = box.h >= nameH + smallH + gap + 2 * rowH ? 2 : box.h >= nameH + smallH + gap + rowH ? 1 : 0;
  const total = nameH + smallH + (rows ? gap + rows * rowH : 0);
  let y = box.y + Math.max(0, Math.floor((box.h - total) / 2));

  d.text(d.value("clock.epoch", daily(days, today, nameOf, "")), { x: box.x, y, w: box.w, h: nameH, size: name, weight: 700, align, valign: "bottom" });
  y += nameH;
  d.text([d.value("clock.epoch", daily(days, today, litOf, "")), "% lit"], { x: box.x, y, w: box.w, h: smallH, size: small, align });
  y += smallH;
  if (!rows) return;
  d.line(box.x + (align === "center" ? Math.round(box.w * 0.25) : 0), y + Math.round(gap / 2), box.x + (align === "center" ? Math.round(box.w * 0.75) : box.w), y + Math.round(gap / 2));
  y += gap;
  for (const q of ([2, 0] as const).slice(0, rows)) {
    d.text(QUARTERS[q], { x: box.x, y, w: box.w, h: smallH, size: small, align });
    const dateY = y + smallH;
    const lh = d.lineHeight(rowSize, 700);
    const date = d.value("clock.epoch", nextDate(days, q, env.timezone));
    // How far off: "in 9 days" from a number the panel counts, "today" and "tomorrow" in words.
    const far = (st: Stretch, fn: () => void) => d.when({ all: [st.when, { v: "clock.epoch", op: "lt", x: st.eve }] }, fn);
    const near = (st: Stretch) => d.constant(st.date, NEAR);
    d.text(date, { x: box.x, y: dateY, w: box.w, h: lh, size: rowSize, weight: 700, align });
    if (countdown) {
      for (const st of stretches(days, q, env.now, env.timezone)) {
        far(st, () => d.text(["in ", d.constant(st.date, IN_DAYS), " days"], { x: box.x, y: dateY, w: box.w, h: lh, size: rowSize, align: "right" }));
        d.when(st.when, () => d.text(near(st), { x: box.x, y: dateY, w: box.w, h: lh, size: rowSize, align: "right" }));
      }
    }
    y += rowH;
  }
}

/** The next new moon, first quarter, full moon and last quarter, in that order, along `box`. */
function drawPhases(d: Draw, box: Box, days: readonly MoonDay[], env: Env, south: boolean): void {
  const col = Math.floor(box.w / 4);
  const size = d.fit([longestDate(d, env, 14, 400)], col - 4, 24, { min: 12, max: 16 });
  const lh = d.lineHeight(size);
  const icon = Math.max(16, Math.min(40, box.h - lh - 6));
  ([0, 1, 2, 3] as const).forEach((q) => {
    const x = box.x + q * col;
    d.bitmap({ x: x + Math.floor((col - icon) / 2), y: box.y, w: icon, h: icon }, `moon-${south ? "s" : "n"}-${q}`, moonInk(icon, q * 90, south));
    d.text(d.value("clock.epoch", nextDate(days, q, env.timezone)), { x, y: box.y + icon + 4, w: col, h: lh, size, align: "center" });
  });
}

export default defineExtension<Settings>({
  id: "moon",
  name: "Moon",
  description: "Tonight's moon, drawn from NASA's map of it, and when it is next full and new.",
  icon: "moon",
  category: "time",
  size: { min: [3, 3], default: [10, 5] },
  fields: [
    {
      key: "hemisphere", label: "Seen from", kind: "select", options: [
        { value: "auto", label: "Where the panel is" },
        { value: "north", label: "Northern hemisphere" },
        { value: "south", label: "Southern hemisphere" },
      ],
      help: "South of the equator the moon looks upside down.",
    },
    { key: "details", label: "Name and dates", kind: "toggle" },
    { key: "phases", label: "Next four phases", kind: "toggle", help: "Along the bottom, when the widget is tall enough." },
  ],
  defaults: () => ({ hemisphere: "auto", details: true, phases: true }),
  refresh: () => 24 * 60,
  title: () => "Moon",
  facts: (_s, env) => {
    const days = moonDays(env.now, env.timezone);
    const on = (q: Quarter): Condition => ({
      any: days.filter((d) => d.event?.quarter === q).map((d) => ({ v: "clock.epoch", op: "between" as const, x: [d.start, d.end] })),
    });
    const facts: Fact[] = [
      { key: "full", label: "Full moon today", type: "flag", test: on(2) },
      { key: "new", label: "New moon today", type: "flag", test: on(0) },
    ];
    return facts;
  },
  draw(d, s, env) {
    const days = moonDays(env.now, env.timezone);
    const today = days[1];
    const south = southern(s, env);
    const end = days[days.length - 1].end;
    const W = d.width, H = d.height;

    // The tables run out after three years: say so where the moon was.
    d.when({ v: "clock.epoch", op: "ge", x: end }, () => {
      const size = d.fit(["Flash again to", "keep the moon going"], W, H, { min: 12, max: 24 });
      d.text("Flash again to keep the moon going", { x: 0, y: 0, w: W, h: H, size, align: "center", valign: "middle", wrap: true });
    });

    d.when({ not: { v: "clock.epoch", op: "ge", x: end } }, () => {
      const strip = s.phases !== false && W >= 200 && H >= 240 ? Math.min(72, Math.round(H * 0.24)) : 0;
      const top = H - (strip ? strip + 8 : 0);
      if (strip) {
        d.line(0, top, W, top);
        drawPhases(d, { x: 0, y: top + 8, w: W, h: strip }, days, env, south);
      }
      if (s.details === false) return drawMoon(d, { x: 0, y: 0, w: W, h: top }, days, today, south);

      if (W >= top * 1.5) {
        // Side by side: the moon at full height, the words beside it.
        const size = Math.min(top, MAX_MOON);
        const gap = Math.max(12, Math.round(size * 0.1));
        drawMoon(d, { x: 0, y: 0, w: size, h: top }, days, today, south);
        drawDetails(d, { x: size + gap, y: 0, w: W - size - gap, h: top }, days, today, env, "left");
        return;
      }
      // Stacked: the moon, then as much as fits beneath it.
      const words = top - W >= 40 ? top - W : top >= 180 ? Math.round(top * 0.3) : 0;
      drawMoon(d, { x: 0, y: 0, w: W, h: top - words }, days, today, south);
      if (words) drawDetails(d, { x: 0, y: top - words + 6, w: W, h: words - 6 }, days, today, env, "center");
    });
  },
});
