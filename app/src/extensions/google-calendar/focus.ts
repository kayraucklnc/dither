// The date, and the one event that matters most, set large.

import type { Box, Draw } from "../api";
import { MINUTES, TIMED, and, dayIs, not, ongoing, ref, soon, within } from "./events";
import { at, detail, horizon, timeWidth, type Content, type Opt } from "./style";

const l = TIMED;

/** A tear-off calendar page: weekday, the day large, month and year. */
export function datePane(d: Draw, box: Box): void {
  const num = d.fit(["28", "30", "00"], box.w, box.h * 0.45, { weight: 700, max: 128 });
  // Sized for the longest month and weekday, not today's.
  const side = Math.min(num >= 96 ? 24 : num >= 64 ? 20 : 16, d.fit(["September 2026"], box.w, 40), d.fit(["Wednesday"], box.w, 40, { weight: 700 }));
  const sm = d.metrics(side, 700);
  const nm = d.metrics(num, 700);
  // Digits sit on the baseline and reach about 0.73 of the size above it.
  const capTop = Math.round(num * 0.27);
  let y = box.y + side;
  at(d, d.time("dddd"), box.x, y, box.w, side, 700);
  y += Math.round(side * 0.8) + num - capTop;
  d.text(d.time("D"), { x: box.x - Math.round(num * 0.04), y: y - nm.ascent, w: box.w + Math.round(num * 0.04), h: nm.lineHeight, size: num, weight: 700 });
  y += Math.round(side * 0.6) + sm.ascent;
  at(d, d.time("MMMM YYYY"), box.x, y, box.w, side, 400);
}

/** The date across the top — weekday bold, date to the right, or beneath when narrow — and a heavy rule. */
export function dateBar(d: Draw, box: Box): number {
  const size = box.w >= 440 ? 24 : box.w >= 300 ? 20 : 16;
  const m = d.metrics(size, 700);
  const base = box.y + size;
  let bottom = base + m.descent;
  if (box.w >= 300) {
    const half = Math.floor(box.w / 2);
    at(d, d.time("dddd"), box.x, base, half + 40, size, 700);
    at(d, d.time("D MMMM"), box.x + half, base, box.w - half, size, 400, { align: "right" });
  } else {
    at(d, d.time("dddd"), box.x, base, box.w, size, 700);
    at(d, d.time("D MMMM"), box.x, base + m.lineHeight, box.w, size, 400);
    bottom += m.lineHeight;
  }
  const rule = bottom + 6;
  d.rect({ x: box.x, y: rule, w: box.w, h: 2 });
  return rule + 2 - box.y;
}

/** When the next event is, said as plainly as possible. */
function kicker(d: Draw, o: Opt, n: number, draw: (text: Content) => void): void {
  const s = ref(l, "s", n);
  d.when(ongoing(l, n), () => draw(["Now · until ", d.value(ref(l, "e", n), o.hm)]));
  d.when(and(not(ongoing(l, n)), dayIs(l, n, "0")), () => {
    d.when(soon(l, n), () => draw(["In ", d.value(s, MINUTES), " min · ", d.value(s, o.hm)]));
    d.when(not(soon(l, n)), () => draw(["Today · ", d.value(s, o.hm)]));
  });
  d.when(and(not(ongoing(l, n)), dayIs(l, n, "1")), () => draw(["Tomorrow · ", d.value(s, o.hm)]));
  d.when(and(not(dayIs(l, n, "0")), not(dayIs(l, n, "1"))), () => draw([d.value(s, { time: "dddd D MMM" }), " · ", d.value(s, o.hm)]));
}

/** What follows, one line each: "11:00  Design review", "Wed 09:30  Quarterly planning". */
function then(d: Draw, o: Opt, x: number, y: number, w: number, h: number, size: number): void {
  const m = d.metrics(size);
  const pitch = m.lineHeight + Math.round(size * 0.35);
  const count = Math.min(4, Math.floor((h + pitch - m.lineHeight) / pitch));
  const timeW = timeWidth(d, o, size, 400, "Wed ") + Math.round(size * 0.8);
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const base = y + i * pitch + m.ascent;
    d.when(within(l, n, o.ahead), () => {
      const s = ref(l, "s", n);
      d.when(dayIs(l, n, "0"), () => at(d, d.value(s, o.hm), x, base, timeW, size, 400));
      d.when(not(dayIs(l, n, "0")), () => at(d, d.value(s, { time: `ddd ${o.hm.time}` }), x, base, timeW, size, 400));
      at(d, d.value(ref(l, "t", n)), x + timeW, base, w - timeW, size, 700);
    });
  }
}

/** The event on now, or next: when as an inverted band, what large, where beneath; then what follows. */
export function focus(d: Draw, o: Opt, box: Box): void {
  const { x, y, w, h } = box;
  const label = h >= 220 && w >= 300 ? 20 : h >= 140 ? 16 : 14;
  const small = label;
  const lm = d.metrics(label, 700);
  const sm = d.metrics(small);
  const chipH = lm.lineHeight + 8;
  // One line of title, as large as a typical one fits; a long one ends in "…".
  const room = Math.min(h - chipH - 10 - sm.lineHeight - 6, Math.max(40, h * 0.4));
  const titleSize = Math.max(16, d.fit(["Quarterly planning"], w, room, { weight: 700, max: 64 }));
  const tm = d.metrics(titleSize, 700);
  const chip = (text: Content) => {
    d.rect({ x, y, w, h: chipH }, { radius: 6 });
    at(d, text, x + 10, y + 4 + lm.ascent, w - 20, label, 700, { white: true });
  };
  const ty = y + chipH + 8;
  const dy = ty + tm.lineHeight + 2 + sm.ascent;

  d.when(within(l, 0, o.ahead), () => {
    kicker(d, o, 0, chip);
    d.text(d.value(ref(l, "t", 0)), { x, y: ty, w, h: tm.lineHeight, size: titleSize, weight: 700 });
    detail(d, l, 0, o, x, dy, w, small);
    const ruleY = dy + sm.descent + 14;
    const rest = y + h - ruleY - 12;
    if (rest < sm.lineHeight) return;
    d.when(within(l, 1, o.ahead), () => d.line(x, ruleY, x + w - 1, ruleY, { width: 1 }));
    then(d, o, x, ruleY + 12, w, rest, small);
  });
  d.when(not(within(l, 0, o.ahead)), () => {
    chip("Next up");
    d.text("All clear", { x, y: ty, w, h: tm.lineHeight, size: titleSize, weight: 700 });
    at(d, `No events ${horizon(o.ahead, w < 300)}`, x, dy, w, small, 400);
  });
}
