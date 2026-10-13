// The agenda: events grouped by day, times in a column, titles in bold.
//
// Three arrangements of one idea, by width:
//   diary   — the day named in its own left column ("Tomorrow / Wed 14 Oct");
//   compact — the same column, as the date's number and the weekday;
//   stacked — no column: each row says its own day above the title.
// A rule runs between days. Rows sit on a fixed pitch, so nothing has to move
// when the values arrive; only "nothing else today" takes a row of its own,
// and that is one of two whole arrangements chosen on the panel.

import type { Box, Draw } from "../api";
import { and, dayIs, not, sameDay, within, type List } from "./events";
import { dayCell, row, todayCell, type Geo, type Mode } from "./rows";
import { at, hasDetail, horizon, timeWidth, type Opt } from "./style";

/** Title sizes to try, largest first: the largest that still shows a few events wins. */
function titles(mode: Mode, o: Opt, w: number): number[] {
  if (mode === "stacked") return o.dense ? [14] : w >= 180 ? [16, 14] : [14];
  if (mode === "compact") return o.dense ? [16] : w >= 480 ? [24, 20, 16] : w >= 360 ? [20, 16] : [16];
  return o.dense ? [20, 16] : [24, 20];
}

function geometry(d: Draw, o: Opt, w: number, h: number, max: number): Geo {
  const mode: Mode = w >= 600 ? "diary" : w >= 290 ? "compact" : "stacked";
  const options = titles(mode, o, w).map((t) => sized(d, o, mode, t));
  const fits = (g: Geo) => Math.min(max, Math.floor((h + g.gap) / g.pitch));
  const enough = Math.min(4, fits(options[options.length - 1]));
  const g = options.find((x) => fits(x) >= enough) ?? options[options.length - 1];
  // Whatever is left over goes between the rows, up to a point.
  const n = Math.max(1, fits(g));
  const spare = n > 1 ? Math.min(Math.floor((h - n * g.pitch + g.gap) / (n - 1)), Math.round(g.title * 0.6)) : 0;
  return { ...g, gap: g.gap + spare, pitch: g.pitch + spare };
}

function sized(d: Draw, o: Opt, mode: Mode, title: number): Geo {
  const roomy = !o.dense;
  const small = title >= 20 ? 16 : title >= 16 ? 14 : 12;
  const padV = mode === "stacked" ? 5 : roomy ? 7 : 5;
  const two = mode === "stacked" || hasDetail(o);
  const tm = d.metrics(title, 700);
  const sm = d.metrics(small);
  let b1: number;
  let b2: number;
  let rowH: number;
  if (mode === "stacked") {
    b1 = padV + small;
    b2 = b1 + tm.lineHeight;
    rowH = b2 + tm.descent + padV;
  } else {
    b1 = padV + title;
    b2 = b1 + sm.lineHeight + Math.round(title / 8);
    rowH = (two ? b2 + sm.descent : b1 + tm.descent) + padV;
  }
  const gap = mode === "stacked" ? 4 : roomy ? Math.round(title * 0.35) : 3;
  const inset = o.emphasis ? (mode === "stacked" ? 6 : 8) : 0;
  const timeW = mode === "stacked" ? 0 : Math.max(
    timeWidth(d, o, title),
    d.measure("All day", title),
    d.measure("Now", title, 700),
    two ? timeWidth(d, o, small, 400, "until ") : 0,
    two && o.emphasis ? timeWidth(d, { ...o, hmShapes: ["##"] }, small, 700, "in ") + d.measure(" min", small, 700) : 0,
  );
  const dayW = mode === "diary"
    ? Math.max(d.measure("Wednesday", title, 700), d.measure("Wed 30 Sep", small))
    : mode === "compact" ? Math.max(d.measure("30", title, 700), d.measure("Today", small, 700), d.measure("Wed", small)) : 0;
  const gutter = mode === "diary" ? Math.round(title * 0.8) : Math.max(10, Math.round(title * 0.6));
  return { mode, title, small, rowH, b1, b2, two, gap, pitch: rowH + gap, dayW, timeW, gutter, inset };
}

/** One row's place in the list: the event shown (or -1, "nothing else today"), and whether it opens the list. */
interface Slot {
  n: number;
  first: boolean;
}

function slot(d: Draw, l: List, o: Opt, g: Geo, sl: Slot, x: number, top: number, w: number): void {
  const column = g.mode !== "stacked";
  const rowX = column ? x + g.dayW + g.gutter : x;
  const rowW = x + w - rowX;
  const textX = column ? rowX + g.inset + g.timeW + g.gutter : rowX + g.inset;
  const rule = () => {
    const y = top - Math.ceil(g.gap / 2);
    d.line(x, y, x + w - 1, y, { width: 1 });
  };
  if (sl.n < 0) {
    todayCell(d, g, x, top);
    at(d, "Nothing else today", textX, top + g.b1, x + w - textX, g.title, 400);
    return;
  }
  const n = sl.n;
  // Under the last event, say the list ends because the calendar does.
  if (n > 0) {
    const noteX = column ? rowX + g.inset : x;
    d.when(and(within(l, n - 1, o.ahead), not(within(l, n, o.ahead))), () =>
      at(d, `Nothing else ${horizon(o.ahead, g.mode === "stacked")}`, noteX, top + g.b1, x + w - noteX, g.small, 400));
  }
  d.when(within(l, n, o.ahead), () => {
    if (column) {
      if (sl.first || n === 0) dayCell(d, l, n, g, x, top);
      else d.when(not(sameDay(l, n, n - 1)), () => dayCell(d, l, n, g, x, top));
    }
    if (!sl.first && n > 0) d.when(not(sameDay(l, n, n - 1)), rule);
    else if (!sl.first) rule();
    row(d, l, n, o, g, rowX, top, rowW);
  });
}

/** Free: said plainly, in the middle. */
function clear(d: Draw, o: Opt, box: Box): void {
  const text = `No events ${horizon(o.ahead, box.w < 300)}`;
  const big = d.fit(["All clear"], box.w, box.h / 3, { weight: 700, max: 32 });
  const small = Math.max(14, Math.min(big >= 28 ? 20 : 16, d.fit([text], box.w, box.h / 4, { max: 20 })));
  const bm = d.metrics(big, 700);
  const sm = d.metrics(small);
  const lines = d.linesFor(text, small, box.w) > 1 ? 2 : 1;
  const block = bm.lineHeight + 2 + sm.lineHeight * lines;
  const top = box.y + Math.max(0, Math.round((box.h - block) / 2));
  at(d, "All clear", box.x, top + bm.ascent, box.w, big, 700, { align: "center" });
  d.text(text, { x: box.x, y: top + bm.lineHeight + 2, w: box.w, h: sm.lineHeight * lines, size: small, wrap: true, lines, align: "center" });
}

/** Events of `l`, grouped by day, in `box`; at most `max` rows. */
export function agenda(d: Draw, l: List, o: Opt, box: Box, max: number): void {
  const g = geometry(d, o, box.w, box.h, max);
  const slots = Math.max(1, Math.min(max, Math.floor((box.h + g.gap) / g.pitch)));
  const y = (i: number) => box.y + i * g.pitch;
  const draw = (shift: number) => {
    for (let i = 0; i < slots; i++) slot(d, l, o, g, { n: i - shift, first: i === 0 }, box.x, y(i), box.w);
  };
  if (g.mode === "stacked") {
    // Each narrow row names its own day, so an empty today needs no row.
    d.when(within(l, 0, o.ahead), () => draw(0));
  } else {
    d.when(and(within(l, 0, o.ahead), dayIs(l, 0, "0")), () => draw(0));
    d.when(and(within(l, 0, o.ahead), not(dayIs(l, 0, "0"))), () => draw(1));
  }
  d.when(not(within(l, 0, o.ahead)), () => clear(d, o, box));
}
