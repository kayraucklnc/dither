// One event as a row: when on the left, what in bold, where beneath.
// An event on now is a black band; one starting within the hour counts down.

import type { Part } from "@/runtime/types";
import type { Draw } from "../api";
import { MINUTES, and, dayIs, not, ongoing, ref, soon, timed, type List } from "./events";
import { at, detail, type Content, type Opt } from "./style";

export type Mode = "diary" | "compact" | "stacked";

export interface Geo {
  mode: Mode;
  title: number;
  small: number;
  /** A row's height and the baselines of its two lines, from its top. */
  rowH: number;
  b1: number;
  b2: number;
  two: boolean;
  /** Space between rows; a rule runs through its middle where the day changes. */
  gap: number;
  pitch: number;
  /** The day's own column (diary, compact). */
  dayW: number;
  timeW: number;
  gutter: number;
  /** Text inset from the row's edge, so an inverted row keeps a margin. */
  inset: number;
}

const s = (l: List, n: number) => ref(l, "s", n);
const e = (l: List, n: number) => ref(l, "e", n);

function timeRange(d: Draw, l: List, n: number, o: Opt): Content {
  const start = d.value(s(l, n), o.hm);
  return o.ends ? [start, " – ", d.value(e(l, n), { ...o.hm, fallback: "" })] : start;
}

/** The date of record n through a pattern, whether it is timed or all-day. */
export function dateOf(d: Draw, l: List, n: number, pattern: string): Content {
  if (!l.mixed) return d.value(s(l, n), { time: pattern });
  return [d.value(s(l, n), { time: pattern, fallback: "" }), d.value(ref(l, "a", n), { time: pattern, fallback: "" })];
}

const later = (l: List, n: number) => and(not(dayIs(l, n, "0")), not(dayIs(l, n, "1")));

/** A narrow row's first line says everything about when: "Tomorrow · 08:00", "In 25 min · 11:00". */
function whenLine(d: Draw, l: List, n: number, o: Opt, put: (c: Content, weight: 400 | 700) => void): void {
  d.when(timed(l, n), () => {
    d.when(dayIs(l, n, "0"), () => {
      if (!o.emphasis) return put(timeRange(d, l, n, o), 400);
      d.when(soon(l, n), () => put(["In ", d.value(s(l, n), MINUTES), " min · ", d.value(s(l, n), o.hm)], 700));
      d.when(not(soon(l, n)), () => put(timeRange(d, l, n, o), 400));
    });
    d.when(dayIs(l, n, "1"), () => put(["Tomorrow · ", d.value(s(l, n), o.hm)], 400));
    d.when(later(l, n), () => put([d.value(s(l, n), { time: "ddd D MMM" }), " · ", d.value(s(l, n), o.hm)], 400));
  });
  if (!l.mixed) return;
  d.when(not(timed(l, n)), () => {
    d.when(dayIs(l, n, "0"), () => put("All day", 400));
    d.when(dayIs(l, n, "1"), () => put("Tomorrow · all day", 400));
    d.when(later(l, n), () => put([d.value(ref(l, "a", n), { time: "ddd D MMM" }), " · all day"], 400));
  });
}

function stacked(d: Draw, l: List, n: number, o: Opt, g: Geo, x: number, top: number, w: number, live: boolean): void {
  const ix = x + g.inset;
  const iw = w - g.inset * 2;
  if (live) at(d, ["Now · until ", d.value(e(l, n), o.hm)], ix, top + g.b1, iw, g.small, 700, { white: true });
  else whenLine(d, l, n, o, (c, weight) => at(d, c, ix, top + g.b1, iw, g.small, weight));
  at(d, d.value(ref(l, "t", n)), ix, top + g.b2, iw, g.title, 700, { white: live });
}

function columns(d: Draw, l: List, n: number, o: Opt, g: Geo, x: number, top: number, w: number, live: boolean): void {
  const ix = x + g.inset;
  const tx = ix + g.timeW + g.gutter;
  const tw = x + w - g.inset - tx;
  const cw = g.timeW + 4;
  if (live) {
    at(d, "Now", ix, top + g.b1, cw, g.title, 700, { white: true });
    if (g.two) at(d, ["until ", d.value(e(l, n), o.hm)], ix, top + g.b2, cw, g.small, 400, { white: true });
  } else {
    d.when(timed(l, n), () => {
      at(d, d.value(s(l, n), o.hm), ix, top + g.b1, cw, g.title, 400);
      if (!g.two) return;
      const end = () => { if (o.ends) at(d, d.value(e(l, n), { ...o.hm, fallback: "" }), ix, top + g.b2, cw, g.small, 400); };
      if (!o.emphasis) return end();
      d.when(soon(l, n), () => at(d, ["in ", d.value(s(l, n), MINUTES), " min"], ix, top + g.b2, cw, g.small, 700));
      d.when(not(soon(l, n)), end);
    });
    if (l.mixed) d.when(not(timed(l, n)), () => at(d, "All day", ix, top + g.b1, cw, g.title, 400));
  }
  at(d, d.value(ref(l, "t", n)), tx, top + g.b1, tw, g.title, 700, { white: live });
  if (g.two) detail(d, l, n, o, tx, top + g.b2, tw, g.small, live);
}

/** Record n of `l` as a row, `x` where its time begins. */
export function row(d: Draw, l: List, n: number, o: Opt, g: Geo, x: number, top: number, w: number): void {
  const draw = (live: boolean) => {
    if (live) d.rect({ x, y: top, w, h: g.rowH }, { radius: 6 });
    (g.mode === "stacked" ? stacked : columns)(d, l, n, o, g, x, top, w, live);
  };
  if (!o.emphasis) return draw(false);
  d.when(ongoing(l, n), () => draw(true));
  d.when(not(ongoing(l, n)), () => draw(false));
}

const TOMORROW: Part = { v: "clock.epoch", f: { add: 86400, time: "ddd D MMM" } };

/** The day, in its own column, beside the first event on it. */
export function dayCell(d: Draw, l: List, n: number, g: Geo, x: number, top: number): void {
  const w = g.dayW + Math.round(g.gutter / 2);
  const put = (name: Content, nameSize: number, date: Content, bold = false) => {
    at(d, name, x, top + g.b1, w, nameSize, 700);
    if (g.two) at(d, date, x, top + g.b2, w, g.small, bold ? 700 : 400);
  };
  if (g.mode === "diary") {
    d.when(dayIs(l, n, "0"), () => put("Today", g.title, d.time("ddd D MMM")));
    d.when(dayIs(l, n, "1"), () => put("Tomorrow", g.title, TOMORROW));
    d.when(later(l, n), () => put(dateOf(d, l, n, "dddd"), g.title, dateOf(d, l, n, "D MMM")));
    return;
  }
  // Compact: the date's number large, and what the day is beneath.
  d.when(dayIs(l, n, "0"), () => put(d.time("D"), g.title, "Today", true));
  d.when(not(dayIs(l, n, "0")), () => put(dateOf(d, l, n, "D"), g.title, dateOf(d, l, n, "ddd")));
}

/** "Today" with nothing under it, in the day column. */
export function todayCell(d: Draw, g: Geo, x: number, top: number): void {
  const w = g.dayW + Math.round(g.gutter / 2);
  if (g.mode === "diary") {
    at(d, "Today", x, top + g.b1, w, g.title, 700);
    if (g.two) at(d, d.time("ddd D MMM"), x, top + g.b2, w, g.small, 400);
  } else {
    at(d, d.time("D"), x, top + g.b1, w, g.title, 700);
    if (g.two) at(d, "Today", x, top + g.b2, w, g.small, 700);
  }
}
