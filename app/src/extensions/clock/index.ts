import type { Condition, Format, Part } from "@/runtime/types";
import { defineExtension, type Draw } from "../api";

type Style = "digits" | "tiles" | "thin" | "stacked" | "dial" | "words";

interface Settings extends Record<string, unknown> {
  style: Style;
  hours: "24" | "12";
  numerals: "ticks" | "arabic" | "roman" | "dots" | "none";
  hands: "classic" | "bold" | "thin";
  showDate: boolean;
  date: string;
  every: string;
}

const DATES = [
  { value: "dddd, D MMMM", label: "Sunday, 4 October" },
  { value: "dddd", label: "Sunday" },
  { value: "ddd D MMM", label: "Sun 4 Oct" },
  { value: "D MMMM YYYY", label: "4 October 2026" },
  { value: "MMMM D", label: "October 4" },
  { value: "DD.MM.YYYY", label: "04.10.2026" },
  { value: "YYYY-MM-DD", label: "2026-10-04" },
];
/** The widest each date format can get, for sizing. */
const WIDEST: Record<string, string> = {
  "dddd, D MMMM": "Wednesday, 30 September", dddd: "Wednesday", "ddd D MMM": "Wed 30 Sep",
  "D MMMM YYYY": "30 September 2026", "MMMM D": "September 30", "DD.MM.YYYY": "30.09.2026", "YYYY-MM-DD": "2026-09-30",
};

const ROMAN = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

function dateLine(d: Draw, s: Settings, y: number, h: number, align: "left" | "center" = "center") {
  const sample = WIDEST[s.date] ?? "Wednesday, 30 September";
  const size = d.fit([sample], d.width, h);
  d.text(d.time(s.date), { x: 0, y, w: d.width, h: d.lineHeight(size), size, align });
}

/** Big digits, bold or light, with the date beneath. */
function digits(d: Draw, s: Settings, weight: 400 | 700) {
  const twelve = s.hours === "12";
  const dateH = s.showDate ? Math.max(16, Math.round(d.height * 0.2)) : 0;
  const ampmW = twelve ? d.measure("PM", Math.round(d.height * 0.16), 700) + 8 : 0;
  const size = d.fit([twelve ? "12:00" : "00:00"], d.width - ampmW, d.height - dateH, { weight });
  const lh = d.lineHeight(size, weight);
  const dateSize = dateH ? d.fit([WIDEST[s.date] ?? "Wednesday, 30 September"], d.width, dateH) : 0;
  const block = lh + (dateH ? d.lineHeight(dateSize) : 0);
  const top = Math.max(0, Math.floor((d.height - block) / 2));
  const timeW = d.measure(twelve ? "12:00" : "00:00", size, weight);
  const x = Math.floor((d.width - timeW - ampmW) / 2);
  d.text(d.time(twelve ? "h:mm" : "HH:mm"), { x, y: top, w: timeW + 8, h: lh, size, weight, align: "center" });
  if (twelve) {
    const a = Math.max(14, Math.round(size * 0.24));
    d.text(d.time("A"), { x: x + timeW + 8, y: top + Math.round(lh * 0.22), w: ampmW, h: d.lineHeight(a, 700), size: a, weight: 700 });
  }
  if (dateH) dateLine(d, s, top + lh, d.lineHeight(dateSize));
}

/** Hours and minutes on two black tiles, like a flip clock. */
function tiles(d: Draw, s: Settings) {
  const dateH = s.showDate ? Math.max(16, Math.round(d.height * 0.18)) : 0;
  const gap = Math.max(8, Math.round(d.width * 0.04));
  const tileW = Math.floor((d.width - gap) / 2);
  const tileH = Math.min(d.height - dateH - (dateH ? 10 : 0), Math.round(tileW * 0.95));
  const top = Math.max(0, Math.floor((d.height - tileH - dateH - (dateH ? 10 : 0)) / 2));
  const size = d.fit(["88"], tileW * 0.86, tileH * 0.9, { weight: 700 });
  const pattern = s.hours === "12" ? "hh" : "HH";
  [[0, pattern], [tileW + gap, "mm"]].forEach(([x, p]) => {
    d.rect({ x: Number(x), y: top, w: tileW, h: tileH }, { radius: Math.round(tileW * 0.08) });
    d.text(d.time(String(p)), { x: Number(x), y: top, w: tileW, h: tileH, size, weight: 700, align: "center", valign: "middle", white: true });
    // The fold of a flip card.
    d.line(Number(x), top + Math.round(tileH / 2), Number(x) + tileW - 1, top + Math.round(tileH / 2), { width: 2, white: true });
  });
  if (dateH) dateLine(d, s, top + tileH + 10, dateH);
}

/** Hour over minutes, filling a tall box. */
function stacked(d: Draw, s: Settings) {
  const dateH = s.showDate ? Math.max(16, Math.round(d.height * 0.14)) : 0;
  const half = Math.floor((d.height - dateH) / 2);
  const size = d.fit(["88"], d.width, half * 1.05, { weight: 700 });
  const lh = d.lineHeight(size, 700);
  const top = Math.max(0, Math.floor((d.height - dateH - lh * 2 * 0.86) / 2));
  d.text(d.time(s.hours === "12" ? "hh" : "HH"), { x: 0, y: top, w: d.width, h: lh, size, weight: 700, align: "center" });
  d.text(d.time("mm"), { x: 0, y: top + Math.round(lh * 0.86), w: d.width, h: lh, size, weight: 400, align: "center" });
  if (dateH) dateLine(d, s, d.height - dateH, dateH);
}

/** A dial, in one of several faces. */
function dial(d: Draw, s: Settings) {
  const dateH = s.showDate ? Math.max(16, Math.round(d.height * 0.14)) : 0;
  const r = Math.floor(Math.min(d.width, d.height - dateH) / 2) - 2;
  const cx = Math.floor(d.width / 2);
  const cy = Math.floor((d.height - dateH) / 2);
  const t = Math.max(2, Math.round(r / 34));
  // Every face but the dots has a rim; the plain one is only a rim.
  if (s.numerals !== "dots") d.circle(cx, cy, r, { fill: false, stroke: s.numerals === "none" ? Math.max(2, t - 1) : t });
  const pos = (i: number, at: number) => {
    const a = (i / 12) * 2 * Math.PI;
    return [cx + Math.round(Math.sin(a) * at), cy - Math.round(Math.cos(a) * at)] as const;
  };
  for (let i = 0; i < 12; i++) {
    if (s.numerals === "ticks") {
      const [x1, y1] = pos(i, i % 3 === 0 ? r * 0.78 : r * 0.86);
      const [x2, y2] = pos(i, r - t * 2.5);
      d.line(x1, y1, x2, y2, { width: i % 3 === 0 ? t * 2 : t });
    } else if (s.numerals === "dots") {
      const [x, y] = pos(i, r - t * 3);
      d.circle(x, y, i % 3 === 0 ? t * 2.4 : t * 1.3);
    } else if (s.numerals === "arabic" || s.numerals === "roman") {
      const label = s.numerals === "roman" ? ROMAN[i] : String(i === 0 ? 12 : i);
      const size = Math.max(14, Math.round(r * (s.numerals === "roman" ? 0.15 : 0.19)));
      const box = size * 2.2;
      const [x, y] = pos(i, r - size * 1.15);
      d.text(label, { x: x - box / 2, y: y - box / 2, w: box, h: box, size, weight: 700, align: "center", valign: "middle" });
    }
  }
  const w = s.hands === "bold" ? Math.max(6, t * 4) : s.hands === "thin" ? Math.max(2, t) : Math.max(4, t * 3);
  d.hand(cx, cy, r * 0.5, "clock.minutes", 720, { width: w + (s.hands === "thin" ? 1 : 2) });
  d.hand(cx, cy, r * 0.78, "clock.minute", 60, { width: w });
  d.circle(cx, cy, Math.max(4, Math.round(w * 0.9)));
  if (dateH) dateLine(d, s, d.height - dateH, dateH);
}

// --------------------------------------------------------------- in words

const HOURS = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const hourWord: Format = { map: { k: Array.from({ length: 24 }, (_, i) => i), o: Array.from({ length: 24 }, (_, i) => HOURS[i % 12]) } };
const nextHourWord: Format = { map: { k: Array.from({ length: 24 }, (_, i) => i), o: Array.from({ length: 24 }, (_, i) => HOURS[(i + 1) % 12]) } };
// Rounded to the nearest five minutes: 3–7 is "five past", 33–37 "twenty-five to".
const phrase: Format = {
  steps: {
    t: [3, 8, 13, 18, 23, 28, 33, 38, 43, 48, 53],
    o: ["", "five past", "ten past", "quarter past", "twenty past", "twenty-five past", "half past", "twenty-five to", "twenty to", "quarter to", "ten to", "five to"],
  },
};
const minuteIn = (lo: number, hi: number): Condition => ({ v: "clock.minute", op: "between", x: [lo, hi] });

/** "It's quarter past four": the time the way people say it, to the nearest five minutes. */
function words(d: Draw) {
  const longest = "It's twenty-five past eleven";
  let size = 12;
  for (const s of [128, 96, 80, 64, 48, 40, 32, 28, 24, 20, 16, 14, 12]) {
    if (d.linesFor(longest, s, d.width, 700) * d.lineHeight(s, 700) <= d.height) {
      size = s;
      break;
    }
  }
  const box = { x: 0, y: 0, w: d.width, h: d.height, size, weight: 700 as const, wrap: true, valign: "middle" as const };
  const hour: Part = { v: "clock.hour", f: hourWord };
  const next: Part = { v: "clock.hour", f: nextHourWord };
  const say: Part = { v: "clock.minute", f: phrase };
  d.when(minuteIn(0, 3), () => d.text(["It's ", hour, " o'clock"], box));
  d.when(minuteIn(3, 33), () => d.text(["It's ", say, " ", hour], box));
  d.when(minuteIn(33, 58), () => d.text(["It's ", say, " ", next], box));
  d.when(minuteIn(58, 60), () => d.text(["It's ", next, " o'clock"], box));
}

const is = (v: Style) => (s: Record<string, unknown>) => s.style === v;
const isAny = (...v: Style[]) => (s: Record<string, unknown>) => v.includes(s.style as Style);

export default defineExtension<Settings>({
  id: "clock",
  name: "Clock",
  description: "The time as digits, flip tiles, a dial or words — with the date how you like it.",
  icon: "clock",
  category: "time",
  size: { min: [3, 2], default: [8, 4] },
  fields: [
    {
      key: "style", label: "Style", kind: "select",
      options: [
        { value: "digits", label: "Digits, bold" },
        { value: "thin", label: "Digits, light" },
        { value: "tiles", label: "Flip tiles" },
        { value: "stacked", label: "Hour over minutes" },
        { value: "dial", label: "Dial" },
        { value: "words", label: "In words (English)" },
      ],
    },
    { key: "hours", label: "Hours", kind: "select", options: [{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }], visible: isAny("digits", "thin", "tiles", "stacked") },
    {
      key: "numerals", label: "Face", kind: "select", visible: is("dial"),
      options: [{ value: "ticks", label: "Ticks" }, { value: "arabic", label: "Numbers" }, { value: "roman", label: "Roman numerals" }, { value: "dots", label: "Dots, no rim" }, { value: "none", label: "Plain" }],
    },
    { key: "hands", label: "Hands", kind: "select", visible: is("dial"), options: [{ value: "classic", label: "Classic" }, { value: "bold", label: "Bold" }, { value: "thin", label: "Thin" }] },
    { key: "showDate", label: "Show the date", kind: "toggle", visible: (s) => s.style !== "words" },
    { key: "date", label: "Date as", kind: "select", options: DATES, visible: (s) => s.style !== "words" && s.showDate === true },
    {
      key: "every", label: "Update every", kind: "select",
      options: [{ value: "1", label: "Minute" }, { value: "5", label: "5 minutes" }, { value: "15", label: "15 minutes" }],
      help: "Each update redraws the panel. Less often saves battery; words only change every five minutes anyway.",
    },
  ],
  defaults: () => ({ style: "digits", hours: "24", numerals: "ticks", hands: "classic", showDate: true, date: "dddd, D MMMM", every: "1" }),
  refresh: (s) => Number(s.every) || 1,
  draw(d, s) {
    // Projects from before the styles were split called the dial "analog".
    switch ((s.style as string) === "analog" ? "dial" : s.style) {
      case "tiles": return tiles(d, s);
      case "thin": return digits(d, s, 400);
      case "stacked": return stacked(d, s);
      case "dial": return dial(d, s);
      case "words": return words(d);
      default: return digits(d, s, 700);
    }
  },
});
