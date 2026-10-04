// Write spec/fixtures/: blobs, values and the images the TypeScript runtime
// draws from them. The firmware's host tests must draw the same bits.
//
//   npm run goldens

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadFonts, nodeLibrary } from "../src/assets/node";
import { fontInfo } from "../src/assets/library";
import { compile } from "../src/compiler";
import { localeFor } from "../src/compiler/locale";
import { createProject, STARTERS } from "../src/project/starters";
import { encodeBlob } from "../src/runtime/blob";
import { toPbm } from "../src/runtime/pbm";
import { applyMerges } from "../src/runtime/merge";
import { formatContext, render } from "../src/runtime/render";
import type { Element, Runtime, Value } from "../src/runtime/types";
import { builtins } from "../src/runtime/values";

const root = fileURLToPath(new URL("../../spec/fixtures/", import.meta.url));
const NOW = Date.UTC(2026, 9, 4, 13, 7, 30) / 1000; // Sunday 15:07:30 in Rome
const DEVICE = { "device.battery": 64, "device.usb": false, "device.online": true, "device.rssi": -61 };

function write(name: string, blob: Uint8Array, runtime: Runtime, values: Record<string, Value>, now = NOW) {
  const dir = `${root}${name}/`;
  mkdirSync(dir, { recursive: true });
  const all = builtins(now, runtime.tz, { battery: null, usb: false, online: false, rssi: null });
  for (const k of ["device.battery", "device.usb", "device.online", "device.rssi"]) all.set(k, null);
  for (const [k, v] of Object.entries(values)) all.set(k, v);
  applyMerges(runtime.merges, all, formatContext(runtime, now, all));
  const { fb, screen } = render(runtime, blob, all, now);
  writeFileSync(`${dir}blob.bin`, blob);
  writeFileSync(`${dir}values.json`, `${JSON.stringify({ now, values }, null, 2)}\n`);
  writeFileSync(`${dir}expected.pbm`, toPbm(fb));
  console.log(`${name}: screen ${screen}, ${blob.length} bytes`);
}

const fonts = await loadFonts();
const deps = { library: nodeLibrary, fonts, picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) };

for (const dir of ["calendar-three-accounts", "revenue", "transit-calendar-alerts", "starter-clock-weather-day", "starter-clock-weather-night", "starter-dashboard", "starter-photo", "primitives", "text-and-formats"]) {
  rmSync(`${root}${dir}`, { recursive: true, force: true });
}

// Every starter, with its sample data, as a person would first flash it.
const place = { name: "Milan", latitude: 45.46, longitude: 9.19 };
for (const s of STARTERS.filter((x) => x.id !== "blank")) {
  const project = createProject({ starter: s.id, timezone: "Europe/Rome", language: "en", units: "metric", place });
  const c = await compile(project, deps);
  const values: Record<string, Value> = { ...DEVICE };
  for (const src of c.sources) for (const [k, v] of src.sample) values[k] = v;
  for (const src of c.sources) Object.assign(values, { [`${src.source.id}._ok`]: true, [`${src.source.id}._age`]: 12 });
  if (s.id === "clock-weather") {
    write("starter-clock-weather-day", c.blob, c.runtime, values);
    write("starter-clock-weather-night", c.blob, c.runtime, { ...values, "device.online": false }, Date.UTC(2026, 9, 4, 22, 41) / 1000);
  } else write(`starter-${s.id}`, c.blob, c.runtime, values);
}

// Trains, a calendar and an alert: shift, wall-clock times, flags and overlays.
{
  const project = createProject({ starter: "blank", timezone: "Europe/Rome", language: "en", units: "metric", place });
  const account = { id: "me", clientId: "id", clientSecret: "secret", refreshToken: "token", email: "", label: "Personal" };
  project.screens[0].widgets = [
    { id: "train", type: "trenord", x: 0, y: 0, w: 12, h: 8, frame: "none", settings: {} },
    { id: "agenda", type: "google-calendar", x: 12, y: 0, w: 8, h: 6, frame: "outline", settings: { calendarName: "Work" } },
    { id: "next", type: "google-calendar", x: 12, y: 6, w: 8, h: 5, frame: "none", settings: { show: "next" } },
    { id: "strip", type: "trenord", x: 0, y: 8, w: 12, h: 2, frame: "none", settings: {} },
  ];
  project.accounts = { google: [account], stripe: null };
  project.alerts = [
    { id: "late", enabled: true, match: "any", checks: [{ fact: "train:trouble", op: "is", value: true }], icon: "train-front", text: "Trouble on your line", value: null, style: "banner" },
  ];
  const c = await compile(project, deps);
  const ids = new Map([...c.widgetSources].map(([w, m]) => [w, m[""]] as const));
  const t = ids.get("train")!;
  const cal = c.widgetSources.get("agenda")!.c0;
  const trains: [string, number, boolean, string, string][] = [
    ["15:01:00", 0, false, "R", "24011"], ["15:12:00", 0, true, "R", "24015"], ["15:20:00", 6, false, "RE", "1611"],
    ["15:41:00", 0, false, "S3", "24121"], ["16:02:00", 2, false, "R", "24023"], ["16:15:00", 0, false, "RE", "1615"],
  ];
  const values: Record<string, Value> = { ...DEVICE, [`${t}.alert`]: "Lavori tra Saronno e Milano Bovisa", [`${t}._ok`]: true, [`${t}._age`]: 3 };
  trains.forEach(([time, delay, gone, kind, n], i) => Object.assign(values, {
    [`${t}.t${i}`]: time, [`${t}.d${i}`]: delay, [`${t}.c${i}`]: gone, [`${t}.s${i}`]: gone ? "S" : "", [`${t}.k${i}`]: kind, [`${t}.n${i}`]: n,
  }));
  Object.assign(values, {
    [`${cal}.t0`]: "Standup", [`${cal}.s0`]: "2026-10-04T15:00:00+02:00", [`${cal}.e0`]: "2026-10-04T15:30:00+02:00", [`${cal}.w0`]: "Room 2",
    [`${cal}.t1`]: "Design review", [`${cal}.s1`]: "2026-10-04T16:00:00+02:00", [`${cal}.e1`]: "2026-10-04T17:00:00+02:00",
    [`${cal}.t2`]: "Ayşe's birthday", [`${cal}.a2`]: "2026-10-05",
    [`${cal}.t3`]: "Gym", [`${cal}.s3`]: "2026-10-05T07:30:00Z", [`${cal}.e3`]: "2026-10-05T08:30:00Z",
    [`${cal}._ok`]: true, [`${cal}._age`]: 4,
  });
  write("transit-calendar-alerts", c.blob, c.runtime, values);
}

// Three accounts side by side: groups, days, ongoing, all-day and later days.
{
  const project = createProject({ starter: "blank", timezone: "Europe/Istanbul", language: "en", units: "metric", place });
  const link = (id: string, label: string) => ({ id, clientId: "id", clientSecret: "secret", refreshToken: `token-${id}`, email: `${id}@example.com`, label });
  project.accounts = { google: [link("me", "Personal"), link("work", "Work"), link("home", "Family")], stripe: null };
  project.screens[0].widgets = [
    { id: "cal", type: "google-calendar", x: 0, y: 0, w: 20, h: 12, frame: "none", settings: {} },
  ];
  const c = await compile(project, deps);
  const lanes = c.widgetSources.get("cal")!;
  // NOW is Sunday 16:07:30 in Istanbul.
  const events: Record<string, Value>[] = [
    { t0: "Standup", s0: "2026-10-04T16:00:00+03:00", e0: "2026-10-04T16:30:00+03:00", w0: "Meet",
      t1: "Design review", s1: "2026-10-04T17:00:00+03:00", e1: "2026-10-04T18:00:00+03:00", w1: "Room 4.2",
      t2: "Quarterly planning", s2: "2026-10-05T09:30:00+03:00", e2: "2026-10-05T11:00:00+03:00",
      t3: "Offsite", a3: "2026-10-07" },
    { t0: "Ayşe's birthday", a0: "2026-10-04", t1: "Gym", s1: "2026-10-04T19:00:00Z", e1: "2026-10-04T20:00:00Z", w1: "Fit Club",
      t2: "Dinner", s2: "2026-10-04T21:00:00+03:00", e2: "2026-10-04T23:30:00+03:00", w2: "Kadıköy" },
    {},
  ];
  const values: Record<string, Value> = { ...DEVICE };
  events.forEach((ev, i) => {
    const id = lanes[`c${i}`];
    for (const [k, v] of Object.entries(ev)) values[`${id}.${k}`] = v;
    Object.assign(values, { [`${id}._ok`]: true, [`${id}._age`]: 2 });
  });
  write("calendar-three-accounts", c.blob, c.runtime, values);
}

// Revenue: list totals, minor units, a page-limit floor.
{
  const project = createProject({ starter: "blank", timezone: "Europe/Istanbul", language: "tr", units: "metric", place });
  project.screens[0].widgets = [
    { id: "today", type: "stripe", x: 0, y: 0, w: 12, h: 12, frame: "none", settings: { currency: "try" } },
    { id: "month", type: "stripe", x: 12, y: 0, w: 8, h: 3, frame: "outline", settings: { period: "month", measure: "net", currency: "jpy" } },
  ];
  project.accounts = { google: [], stripe: { key: "rk_test_golden", name: "" } };
  const c = await compile(project, deps);
  const ids = new Map([...c.widgetSources].map(([w, m]) => [w, m[""]] as const));
  const a = ids.get("today")!;
  const b = ids.get("month")!;
  const values: Record<string, Value> = {
    ...DEVICE,
    [`${a}.gross`]: 1284550, [`${a}.net`]: 1240100, [`${a}.count`]: 23, [`${a}.more`]: false,
    [`${a}.a0`]: 49900, [`${a}.t0`]: NOW - 600, [`${a}.n0`]: "Pro plan",
    [`${a}.a1`]: 129000, [`${a}.t1`]: NOW - 3000, [`${a}.n1`]: "Takım planı, yıllık",
    [`${a}.a2`]: 1900, [`${a}.t2`]: NOW - 7400, [`${a}.n2`]: null,
    [`${b}.gross`]: 9812345, [`${b}.net`]: 9500000, [`${b}.count`]: 100, [`${b}.more`]: true,
  };
  write("revenue", c.blob, c.runtime, values);
}

// Hand-placed elements at their edges: what the starters do not reach.
async function custom(name: string, elements: Element[], fontsUsed: [number, 400 | 700][], values: Record<string, Value>, icons: [string, number][] = []) {
  const assets = [
    ...(await Promise.all(fontsUsed.map(([size, w]) => nodeLibrary.font(fontInfo(size, w))))),
    ...(await Promise.all(icons.map(async ([n, sz]) => (await nodeLibrary.icon(n, sz))!))),
  ];
  const { bytes, runtime } = encodeBlob({
    builtAt: NOW,
    assets,
    runtime: {
      v: 1, board: "xiao-epaper-75", width: 800, height: 480, rotation: 0, wifi: [], tz: "STD-1DST,M3.5.0,M10.5.0/3", ntp: "pool.ntp.org",
      locale: localeFor("tr"), refresh: 900, sources: [], rules: [], screens: [{ name, elements }],
    },
  });
  write(name, bytes, runtime, values);
}

await custom("primitives", [
  { t: "rect", x: 10, y: 10, w: 120, h: 80 },
  { t: "rect", x: 140, y: 10, w: 120, h: 80, r: 16 },
  { t: "rect", x: 270, y: 10, w: 120, h: 80, fill: false, stroke: 3, r: 20 },
  { t: "rect", x: 400, y: 10, w: 7, h: 80, fill: false, stroke: 4, r: 3 },
  { t: "rect", x: 420, y: 10, w: 100, h: 80, r: 60 },
  { t: "rect", x: 530, y: 10, w: 0, h: 80 },
  { t: "circle", x: 600, y: 50, r: 40 },
  { t: "circle", x: 600, y: 50, r: 30, c: 0 },
  { t: "circle", x: 700, y: 50, r: 40, fill: false, stroke: 5 },
  { t: "circle", x: 770, y: 50, r: 0 },
  { t: "line", x1: 10, y1: 110, x2: 390, y2: 190, w: 1 },
  { t: "line", x1: 10, y1: 190, x2: 390, y2: 110, w: 4 },
  { t: "line", x1: 400, y1: 110, x2: 400, y2: 190, w: 3 },
  { t: "line", x1: 420, y1: 150, x2: 780, y2: 150, w: 2 },
  { t: "line", x1: 420, y1: 120, x2: 423, y2: 190, w: 1 },
  { t: "hand", x: 100, y: 330, len: 90, w: 6, v: "t.min", max: 60 },
  { t: "hand", x: 100, y: 330, len: 60, w: 9, v: "t.mins", max: 720 },
  { t: "hand", x: 100, y: 330, len: 80, w: 2, v: "t.five", max: 60 },
  { t: "hand", x: 100, y: 330, len: 80, v: "t.missing", max: 60 },
  { t: "bar", x: 220, y: 230, w: 200, h: 24, v: "t.pct", min: 0, max: 100 },
  { t: "bar", x: 220, y: 260, w: 200, h: 24, v: "t.over", min: 0, max: 100 },
  { t: "bar", x: 430, y: 230, w: 30, h: 200, v: "t.pct", min: 0, max: 100, dir: "u" },
  { t: "chart", x: 480, y: 230, w: 300, h: 100, v: "t.series", kind: "bars", gap: 2 },
  { t: "chart", x: 480, y: 340, w: 300, h: 100, v: "t.series", kind: "line", lw: 3 },
  { t: "chart", x: 220, y: 300, w: 200, h: 120, v: "t.flat", kind: "line", min: 0, max: 10 },
  { t: "rect", x: 220, y: 440, w: 560, h: 30, when: { v: "t.pct", op: "gt", x: 50 } },
  { t: "rect", x: 220, y: 440, w: 30, h: 30, c: 0, when: { any: [{ v: "t.missing", op: "present" }, { not: { v: "t.pct", op: "lt", x: 10 } }] } },
], [], {
  "t.min": 13, "t.mins": 547, "t.five": 5, "t.pct": 62.5, "t.over": 140,
  "t.series": [3, 7, 2, 9, 4, 4, 10, 1, 6, 8, 5, 2.5], "t.flat": [5, 5, 5, 5],
});

await custom("text-and-formats", [
  { t: "rect", x: 0, y: 0, w: 800, h: 70 },
  { t: "text", x: 16, y: 10, w: 768, h: 50, font: 1, c: 0, va: "m", parts: [{ v: "clock.epoch", f: { time: "dddd, D MMMM YYYY · HH:mm" } }] },
  { t: "text", x: 16, y: 80, w: 380, h: 120, font: 0, wrap: true, parts: ["Uzun bir cümle: şişli, ığdır ve İstanbul — sözcükler satırlara bölünür ve sonunda üç nokta olmalı çünkü kutu küçük."] },
  { t: "text", x: 410, y: 80, w: 370, h: 40, font: 0, a: "r", parts: ["Tek satır, sığmayan bir metin burada kesilmeli"] },
  { t: "text", x: 410, y: 125, w: 370, h: 40, font: 0, a: "c", parts: [{ v: "f.word", f: { upper: true, tr: true } }] },
  { t: "text", x: 410, y: 165, w: 120, h: 60, font: 0, wrap: true, parts: ["Supercalifragilisticexpialidocious"] },
  { t: "text", x: 16, y: 210, w: 380, h: 120, font: 2, va: "b", parts: [{ v: "f.temp", f: { num: { d: 0 } } }, "°"] },
  { t: "text", x: 410, y: 230, w: 370, h: 30, font: 0, parts: [
    { v: "f.big", f: { num: { d: 2, sep: "." } } }, "  ", { v: "f.half", f: { num: { d: 2 } } }, "  ", { v: "f.auto" }, "  ", { v: "f.neg", f: { num: { d: 1 } } },
  ] },
  { t: "text", x: 410, y: 265, w: 370, h: 30, font: 0, parts: [
    { v: "f.code", f: { map: { k: [0, 2, 61], o: ["Açık", "Parçalı", "Yağmur"], d: "?" } } }, " / ",
    { v: "f.level", f: { steps: { t: [20, 50, 80], o: ["boş", "az", "yarım", "dolu"] } } }, " / ",
    { v: "f.missing", f: { num: { d: 0 }, fallback: "yok" } }, " / ", { v: "f.missing" },
  ] },
  { t: "text", x: 410, y: 300, w: 370, h: 30, font: 0, parts: [
    { v: "f.soon", f: { until: true } }, " dk · ", { k: "2026-10-25", f: { until: true, scale: 1 / 1440, add: 0.4999, num: { d: 0 } } }, " gün · ",
    { v: "f.iso", f: { time: "ddd D MMM h:mm A [saat]" } },
  ] },
  { t: "text", x: 410, y: 335, w: 370, h: 140, font: 0, wrap: true, lines: 3, va: "m", a: "c", parts: ["Bir\n\nüç satır sınırı olan\nparagraflar ve boş satırlar ve dördüncü satır görünmemeli"] },
  { t: "icon", x: 16, y: 340, w: 120, h: 120, v: "f.code", f: { map: { k: [2], o: ["cloud-sun"] } }, set: { "cloud-sun": 3 } },
  { t: "bitmap", x: 150, y: 370, a: 4 },
  { t: "bitmap", x: 230, y: 370, a: 4, c: 1 },
], [[24, 400], [24, 700], [128, 700]], {
  "f.word": "istanbul ığdır", "f.temp": -3.5, "f.big": 1234567.891, "f.half": 2.675, "f.auto": 20.5, "f.neg": -0.04,
  "f.code": 2, "f.level": 55, "f.missing": null, "f.soon": "2026-10-04T16:00", "f.iso": "2026-10-25T02:30:00Z",
}, [["cloud-sun", 96], ["wifi", 64]]);
