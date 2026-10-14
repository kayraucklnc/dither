import type { Condition, Format } from "@/runtime/types";
import type { Place } from "@/project/schema";
import { defineExtension, type Box, type Draw, type Env } from "../api";

// Open-Meteo's air-quality model: how clean the air is, how strong the sun,
// and — in Europe only — how much pollen is about. Outside Europe every
// pollen value comes back null, and the widget simply has no pollen to show.

type Index = "eu" | "us";

interface Settings extends Record<string, unknown> {
  place: Place | null;
  index: "auto" | Index;
  show: "auto" | "air" | "uv" | "all";
}

interface Scale {
  key: string;
  series: string;
  name: string;
  /** Where each band starts, after the first. */
  t: number[];
  bands: string[];
  /** The index at which air stops being fine for everyone. */
  unhealthy: number;
}

const INDEX: Record<Index, Scale> = {
  // The European Environment Agency's bands.
  eu: { key: "aqiEu", series: "aqiEuH", name: "European AQI", t: [20, 40, 60, 80, 100], bands: ["Good", "Fair", "Moderate", "Poor", "Very poor", "Extremely poor"], unhealthy: 60 },
  // The US EPA's.
  us: { key: "aqiUs", series: "aqiUsH", name: "US AQI", t: [51, 101, 151, 201, 301], bands: ["Good", "Moderate", "Unhealthy for some", "Unhealthy", "Very unhealthy", "Hazardous"], unhealthy: 151 },
};

const UV_T = [3, 6, 8, 11];
const UV_BANDS = ["Low", "Moderate", "High", "Very high", "Extreme"];

/**
 * Grains per m³ where each pollen's Low, Moderate, High and Very high begin,
 * after the scales European pollen services publish. Trees shed far more
 * grains than weeds before anyone sneezes.
 */
const POLLEN: { key: string; name: string; icon: string; t: [number, number, number, number] }[] = [
  { key: "alder", name: "Alder", icon: "trees", t: [1, 10, 50, 100] },
  { key: "birch", name: "Birch", icon: "trees", t: [1, 10, 50, 100] },
  { key: "olive", name: "Olive", icon: "leaf", t: [1, 50, 200, 400] },
  { key: "grass", name: "Grass", icon: "wheat", t: [1, 10, 50, 150] },
  { key: "mugwort", name: "Mugwort", icon: "sprout", t: [1, 10, 30, 50] },
  { key: "ragweed", name: "Ragweed", icon: "flower-2", t: [1, 5, 15, 50] },
];
const POLLEN_BANDS = ["None", "Low", "Moderate", "High", "Very high"];

const band = (t: number[], bands: string[]): Format => ({ steps: { t, o: bands } });
export const bandOf = (index: Index): Format => band(INDEX[index].t, INDEX[index].bands);
export const UV_BAND = band(UV_T, UV_BANDS);
const WHOLE: Format = { num: { d: 0 } };

const placeOf = (s: Settings, env: Env) => s.place ?? env.place;
/** US AQI where the panel keeps American time, the European index elsewhere: units follow the zone. */
export const indexOf = (s: Settings, env: Env): Index => (s.index === "eu" || s.index === "us" ? s.index : env.timezone.startsWith("America/") ? "us" : "eu");

const anyPollen: Condition = { any: POLLEN.map((p) => ({ v: p.key, op: "present" })) };

// --------------------------------------------------------------- drawing helpers

/** Text placed so its baseline sits at `baseline`. */
function onBaseline(d: Draw, content: Parameters<Draw["text"]>[0], x: number, baseline: number, w: number, size: number, weight: 400 | 700, align: "left" | "right" | "center" = "left") {
  const m = d.metrics(size, weight);
  d.text(content, { x, y: baseline - m.ascent, w, h: m.lineHeight, size, weight, align });
}

/**
 * A row of segments, one per band past the first, filled up to the value's:
 * the level at a glance, wherever the number lands.
 */
function levels(d: Draw, key: string, t: number[], box: Box) {
  const gap = 3;
  const n = t.length;
  const sw = (box.w - gap * (n - 1)) / n;
  t.forEach((start, j) => {
    const seg = { x: box.x + j * (sw + gap), y: box.y, w: sw, h: box.h };
    d.rect(seg, { fill: false, stroke: 1, radius: 2 });
    d.when({ v: key, op: "ge", x: start }, () => d.rect(seg, { radius: 2 }));
  });
}

/** The index, large, with its band and the level bar beside it. */
function air(d: Draw, index: Index, box: Box) {
  const sc = INDEX[index];
  const big = d.fit(["888"], Math.round(box.w * 0.5), box.h, { weight: 700, max: 96 });
  const nw = d.measure("888", big, 700);
  const capH = Math.round(big * 0.73);
  const top = box.y + Math.round((box.h - capH) / 2);
  const base = top + capH;
  onBaseline(d, [d.value(sc.key, WHOLE)], box.x, base, nw + 4, big, 700, "right");
  const tx = box.x + nw + Math.max(10, Math.round(big * 0.2));
  const tw = box.x + box.w - tx;
  // Short of room, the index's name goes: the band and the bar say more.
  const named = capH >= 44;
  const word = d.fit(sc.bands, tw, Math.round(capH * (named ? 0.45 : 0.6)), { weight: 700, max: 32 });
  const small = Math.max(12, Math.min(18, Math.round(word * 0.6)));
  // Name above, band in the middle, bar along the bottom: together as tall as the digits.
  if (named) onBaseline(d, sc.name, tx, top + Math.round(small * 0.8), tw, small, 400);
  onBaseline(d, [d.value(sc.key, { ...bandOf(index), fallback: "–" })], tx, top + Math.round(capH * (named ? 0.66 : 0.62)), tw, word, 700);
  const barH = Math.max(6, Math.round(capH * 0.14));
  levels(d, sc.key, sc.t, { x: tx, y: base - barH, w: Math.min(tw, 220), h: barH });
}

/** "UV 4 · Moderate, up to 6 today". */
function uvLine(d: Draw, x: number, baseline: number, w: number, size: number) {
  const icon = Math.round(size * 1.1);
  d.icon("sun", { x, y: baseline - Math.round(size * 0.86), w: icon, h: icon });
  onBaseline(d, [
    "UV ", d.value("uv", WHOLE), " · ", d.value("uv", UV_BAND),
    ", up to ", d.value("uvMax", WHOLE), " today",
  ], x + icon + 8, baseline, w - icon - 8, size, 700);
}

function pollutants(d: Draw, x: number, baseline: number, w: number, size: number) {
  onBaseline(d, [
    "PM2.5 ", d.value("pm25", WHOLE), "   PM10 ", d.value("pm10", WHOLE),
    "   O3 ", d.value("o3", WHOLE), "   NO2 ", d.value("no2", WHOLE), "  µg/m³",
  ], x, baseline, w, size, 400);
}

/** One pollen: what it is, how much, and four dots that fill with it. */
function pollenCell(d: Draw, p: (typeof POLLEN)[number], box: Box) {
  const size = Math.max(13, Math.min(18, Math.round(box.h * 0.26)));
  const icon = Math.min(Math.round(box.h * 0.5), 32);
  d.icon(p.icon, { x: box.x, y: box.y + Math.round((box.h - icon) / 2), w: icon, h: icon });
  const tx = box.x + icon + 8;
  const tw = box.w - icon - 8;
  onBaseline(d, p.name, tx, box.y + Math.round(box.h * 0.4), tw, size, 700);
  onBaseline(d, [d.value(p.key, { ...band(p.t, POLLEN_BANDS), fallback: "–" })], tx, box.y + Math.round(box.h * 0.75), tw, size, 400);
  const r = Math.max(3, Math.round(size * 0.22));
  const dotsX = tx + Math.max(...POLLEN_BANDS.map((b) => d.measure(b, size))) + r * 3;
  p.t.forEach((start, j) => {
    const cx = dotsX + j * (r * 3);
    const cy = box.y + Math.round(box.h * 0.75) - Math.round(size * 0.35);
    if (cx + r > box.x + box.w) return;
    d.circle(cx, cy, r, { fill: false, stroke: 1 });
    d.when({ v: p.key, op: "ge", x: start }, () => d.circle(cx, cy, r));
  });
}

function pollen(d: Draw, box: Box) {
  const cols = box.w >= 540 ? 3 : 2;
  const rows = Math.ceil(POLLEN.length / cols);
  const cw = Math.floor(box.w / cols);
  const ch = Math.floor(box.h / rows);
  d.when(anyPollen, () => {
    POLLEN.forEach((p, i) => pollenCell(d, p, { x: box.x + (i % cols) * cw, y: box.y + Math.floor(i / cols) * ch, w: cw - 8, h: ch }));
  });
  d.when({ not: anyPollen }, () =>
    d.text("No pollen forecast for this place", { ...box, size: Math.max(13, Math.min(18, Math.round(box.h * 0.12))), align: "center", valign: "middle" }));
}

function needsPlace(d: Draw) {
  d.icon("wind", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  d.text("Choose a place in Panel settings", { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit(["Choose a place in"], d.width, 40, { max: 24 }), align: "center", wrap: true, lines: 2 });
}

// --------------------------------------------------------------- the widget

export default defineExtension<Settings>({
  id: "air-quality",
  name: "Air quality",
  description: "How clean the air is, how strong the sun, and in Europe how much pollen is about. From Open-Meteo, no account needed.",
  icon: "wind",
  category: "weather",
  size: { min: [4, 2], default: [8, 6] },
  fields: [
    { key: "place", label: "Place", kind: "place", help: "Leave empty to use the project's place." },
    {
      key: "index", label: "Index", kind: "select",
      options: [
        { value: "auto", label: "As used where the panel is" },
        { value: "eu", label: "European AQI" },
        { value: "us", label: "US AQI" },
      ],
    },
    {
      key: "show", label: "Show", kind: "select",
      options: [
        { value: "auto", label: "As much as fits" },
        { value: "air", label: "Just the air" },
        { value: "uv", label: "Air and UV" },
        { value: "all", label: "Air, UV and pollen" },
      ],
    },
  ],
  defaults: () => ({ place: null, index: "auto", show: "auto" }),
  title: (s, env) => `Air quality in ${placeOf(s, env)?.name ?? "…"}`,
  refresh: () => 60,
  source(s, env) {
    const place = placeOf(s, env);
    if (!place) return null;
    const q = new URLSearchParams({
      latitude: place.latitude.toFixed(3),
      longitude: place.longitude.toFixed(3),
      current: ["european_aqi", "us_aqi", "pm2_5", "pm10", "ozone", "nitrogen_dioxide", "uv_index", ...POLLEN.map((p) => `${p.key}_pollen`)].join(","),
      hourly: "european_aqi,us_aqi,uv_index",
      daily: "uv_index_max",
      forecast_hours: "24",
      timezone: "auto",
    });
    return {
      url: `https://air-quality-api.open-meteo.com/v1/air-quality?${q.toString().replace(/%2C/g, ",")}`,
      every: 60,
      values: {
        aqiEu: "current.european_aqi",
        aqiUs: "current.us_aqi",
        pm25: "current.pm2_5",
        pm10: "current.pm10",
        o3: "current.ozone",
        no2: "current.nitrogen_dioxide",
        uv: "current.uv_index",
        uvMax: "daily.uv_index_max.0",
        ...Object.fromEntries(POLLEN.map((p) => [p.key, `current.${p.key}_pollen`])),
        aqiEuH: { path: "hourly.european_aqi", count: 24 },
        aqiUsH: { path: "hourly.us_aqi", count: 24 },
        uvH: { path: "hourly.uv_index", count: 24 },
      },
    };
  },
  sample: () => ({
    aqiEu: 75, aqiUs: 104, pm25: 62, pm10: 70, o3: 7, no2: 89, uv: 4, uvMax: 6,
    alder: 0, birch: 0, olive: 0, grass: 14, mugwort: 32, ragweed: 3,
    aqiEuH: [75, 74, 70, 65, 63, 64, 65, 65, 63, 58, 52, 47, 44, 42, 41, 43, 46, 52, 60, 68, 76, 81, 80, 73],
    aqiUsH: [104, 107, 110, 112, 110, 106, 104, 101, 97, 92, 85, 78, 74, 70, 68, 70, 74, 82, 94, 104, 112, 116, 114, 108],
    uvH: [0, 0, 0, 0, 0, 0, 0, 0.3, 1.1, 2.4, 3.6, 4.6, 5.4, 5.8, 5.2, 4.1, 2.8, 1.5, 0.5, 0, 0, 0, 0, 0],
  }),
  facts: (s, env) => {
    const sc = INDEX[indexOf(s, env)];
    return [
      { key: "aqi", label: `Air quality (${sc.name})`, type: "number", value: sc.key },
      { key: "uv", label: "UV index now", type: "number", value: "uv" },
      { key: "uvMax", label: "Highest UV today", type: "number", value: "uvMax" },
      { key: "unhealthy", label: "The air is unhealthy", type: "flag", test: { v: sc.key, op: "ge", x: sc.unhealthy } },
      { key: "strongSun", label: "UV is high", type: "flag", test: { v: "uv", op: "ge", x: 6 } },
      { key: "pollen", label: "Pollen is high", type: "flag", test: { any: POLLEN.map((p) => ({ v: p.key, op: "ge", x: p.t[2] })) } },
    ];
  },
  draw(d, s, env) {
    if (!placeOf(s, env)) return needsPlace(d);
    const index = indexOf(s, env);
    const sc = INDEX[index];
    const { width: w, height: h } = d;
    const show = s.show === "auto" ? (h >= 300 && w >= 360 ? "all" : h >= 150 ? "uv" : "air") : s.show;
    if (show === "air") return air(d, index, { x: 0, y: 0, w, h });

    const line = Math.max(14, Math.min(22, Math.round(h * 0.07)));
    const lh = d.lineHeight(line, 700);
    if (show === "uv") {
      const airH = h - lh * 2 - 16;
      air(d, index, { x: 0, y: 0, w, h: airH });
      d.line(0, airH + 6, w, airH + 6, { width: 1 });
      uvLine(d, 0, airH + 8 + Math.round(lh * 0.8), w, line);
      pollutants(d, 0, h - Math.round(lh * 0.25), w, Math.max(13, line - 4));
      return;
    }

    // Everything: the air and its day, the sun and its day, then the pollen.
    const airH = Math.round(h * 0.34);
    const chartX = Math.round(w * 0.66);
    air(d, index, { x: 0, y: 0, w: chartX - 12, h: airH });
    const small = Math.max(12, Math.min(15, Math.round(line * 0.75)));
    onBaseline(d, "Next 24 hours", chartX, small, w - chartX, small, 400);
    d.chart({ x: chartX, y: small + 6, w: w - chartX, h: airH - small - 6 }, sc.series, { kind: "bars", min: 0, gap: 1 });
    let y = airH + 10;
    d.line(0, y, w, y, { width: 1 });
    y += 6;
    uvLine(d, 0, y + Math.round(lh * 0.8), w, line);
    y += lh + 4;
    pollutants(d, 0, y + Math.round(lh * 0.7), w, Math.max(13, line - 4));
    y += lh + 8;
    d.line(0, y, w, y, { width: 1 });
    pollen(d, { x: 0, y: y + 8, w, h: h - y - 8 });
  },
});
