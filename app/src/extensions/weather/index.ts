import type { Format } from "@/runtime/types";
import { defineExtension, type Draw } from "../api";

// WMO weather codes, as Open-Meteo reports them.
const GROUPS: { id: string; label: string; codes: number[]; day: string; night: string }[] = [
  { id: "clear", label: "Clear", codes: [0], day: "sun", night: "moon" },
  { id: "partly", label: "Partly cloudy", codes: [1, 2], day: "cloud-sun", night: "cloud-moon" },
  { id: "cloudy", label: "Cloudy", codes: [3], day: "cloud", night: "cloud" },
  { id: "fog", label: "Fog", codes: [45, 48], day: "cloud-fog", night: "cloud-fog" },
  { id: "drizzle", label: "Drizzle", codes: [51, 53, 55, 56, 57], day: "cloud-drizzle", night: "cloud-drizzle" },
  { id: "rain", label: "Rain", codes: [61, 63, 65, 66, 67, 80, 81, 82], day: "cloud-rain", night: "cloud-rain" },
  { id: "snow", label: "Snow", codes: [71, 73, 75, 77, 85, 86], day: "cloud-snow", night: "cloud-snow" },
  { id: "storm", label: "Thunderstorm", codes: [95, 96, 99], day: "cloud-lightning", night: "cloud-lightning" },
];

const ICON_NAMES = [...new Set(GROUPS.flatMap((g) => [g.day, g.night]))];

function codeMap(pick: (g: (typeof GROUPS)[number]) => string, fallback: string): Format {
  const k: number[] = [];
  const o: string[] = [];
  for (const g of GROUPS) for (const c of g.codes) { k.push(c); o.push(pick(g)); }
  return { map: { k, o, d: fallback } };
}

const DAY_ICON = codeMap((g) => g.day, "cloud");
const NIGHT_ICON = codeMap((g) => g.night, "cloud");
const LABEL = codeMap((g) => g.label, "");
const DEG: Format = { num: { d: 0 } };

interface Settings extends Record<string, unknown> {
  place: { name: string; latitude: number; longitude: number } | null;
  detail: "auto" | "now" | "today" | "forecast";
}

function conditionIcon(d: Draw, box: { x: number; y: number; w: number; h: number }, codeKey: string, dayKey?: string) {
  if (!dayKey) {
    d.iconFor(codeKey, DAY_ICON, ICON_NAMES, box);
    return;
  }
  d.when({ v: d.ref(dayKey), op: "eq", x: 0 }, () => d.iconFor(codeKey, NIGHT_ICON, ICON_NAMES, box));
  d.when({ not: { v: d.ref(dayKey), op: "eq", x: 0 } }, () => d.iconFor(codeKey, DAY_ICON, ICON_NAMES, box));
}

function drawNow(d: Draw, x: number, y: number, w: number, h: number) {
  const iconSide = Math.min(h, Math.floor(w * 0.42));
  conditionIcon(d, { x, y: y + Math.floor((h - iconSide) / 2), w: iconSide, h: iconSide }, "code", "isDay");
  const tw = w - iconSide - 8;
  const size = d.fit(["-88°"], tw, h, { weight: 700 });
  d.text([d.value("temp", DEG), "°"], { x: x + iconSide + 8, y, w: tw, h, size, weight: 700, valign: "middle", align: "center" });
}

function drawToday(d: Draw, x: number, y: number, w: number, h: number) {
  const nowH = Math.round(h * 0.62);
  drawNow(d, x, y, w, nowH);
  const rest = h - nowH;
  const size = d.fit(["Partly cloudy · ↑88° ↓-88° · 100%"], w, Math.floor(rest / 2));
  const lh = d.lineHeight(size);
  d.text(d.value("code", LABEL), { x, y: y + nowH, w, h: lh, size, weight: 700, align: "center" });
  d.text(["↑", d.value("hi", DEG), "°  ↓", d.value("lo", DEG), "°  ·  ", d.value("rain", DEG), "% rain"],
    { x, y: y + nowH + lh, w, h: lh, size, align: "center" });
}

function drawForecast(d: Draw, x: number, y: number, w: number, h: number) {
  const days = [1, 2];
  const colW = Math.floor(w / days.length);
  const size = d.fit(["Wed", "↑88° ↓-88°"], colW - 8, Math.floor(h / 4));
  const lh = d.lineHeight(size);
  days.forEach((n, i) => {
    const cx = x + i * colW;
    d.text(d.value(`d${n}date`, { time: "dddd" }), { x: cx, y, w: colW, h: lh, size, weight: 700, align: "center" });
    const iconH = h - 2 * lh;
    d.iconFor(`d${n}code`, DAY_ICON, ICON_NAMES, { x: cx, y: y + lh, w: colW, h: iconH });
    d.text(["↑", d.value(`d${n}hi`, DEG), "° ↓", d.value(`d${n}lo`, DEG), "°"], { x: cx, y: y + h - lh, w: colW, h: lh, size, align: "center" });
  });
}

export default defineExtension<Settings>({
  id: "weather",
  name: "Weather",
  description: "Now, today and the next days, from Open-Meteo. No account needed.",
  icon: "cloud-sun",
  category: "weather",
  size: { min: [3, 2], default: [8, 6] },
  fields: [
    { key: "place", label: "Place", kind: "place", help: "Leave empty to use the project's place." },
    {
      key: "detail", label: "Show", kind: "select",
      options: [
        { value: "auto", label: "As much as fits" },
        { value: "now", label: "Just now" },
        { value: "today", label: "Now and today" },
        { value: "forecast", label: "Today and the next two days" },
      ],
    },
  ],
  defaults: () => ({ place: null, detail: "auto" }),
  title: (s, env) => `Weather in ${(s.place ?? env.place)?.name ?? "…"}`,
  source(s, env) {
    const place = s.place ?? env.place;
    if (!place) return null;
    const imperial = env.units === "imperial";
    const q = new URLSearchParams({
      latitude: place.latitude.toFixed(3),
      longitude: place.longitude.toFixed(3),
      current: "temperature_2m,weather_code,is_day,wind_speed_10m",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
      hourly: "temperature_2m",
      forecast_days: "3",
      forecast_hours: "24",
      timezone: "auto",
      ...(imperial ? { temperature_unit: "fahrenheit", wind_speed_unit: "mph" } : {}),
    });
    return {
      url: `https://api.open-meteo.com/v1/forecast?${q.toString().replace(/%2C/g, ",")}`,
      every: 30,
      values: {
        temp: "current.temperature_2m",
        code: "current.weather_code",
        isDay: "current.is_day",
        wind: "current.wind_speed_10m",
        hi: "daily.temperature_2m_max.0",
        lo: "daily.temperature_2m_min.0",
        rain: "daily.precipitation_probability_max.0",
        d1date: "daily.time.1", d1code: "daily.weather_code.1", d1hi: "daily.temperature_2m_max.1", d1lo: "daily.temperature_2m_min.1",
        d2date: "daily.time.2", d2code: "daily.weather_code.2", d2hi: "daily.temperature_2m_max.2", d2lo: "daily.temperature_2m_min.2",
        hourly: { path: "hourly.temperature_2m", count: 24 },
      },
    };
  },
  sample: () => ({
    temp: 18.4, code: 2, isDay: 1, wind: 12, hi: 21.2, lo: 11.8, rain: 30,
    d1date: "2026-10-05", d1code: 61, d1hi: 17, d1lo: 10,
    d2date: "2026-10-06", d2code: 0, d2hi: 22, d2lo: 12,
    hourly: [16, 17, 18, 19, 20, 21, 21, 20, 19, 17, 16, 15, 14, 13, 13, 12, 12, 12, 13, 14, 15, 16, 17, 18],
  }),
  facts: (_s, env) => [
    { key: "temp", label: "Temperature now", type: "number", value: "temp", unit: env.units === "imperial" ? "°F" : "°C" },
    { key: "rain", label: "Chance of rain today", type: "number", value: "rain", unit: "%" },
    { key: "wind", label: "Wind", type: "number", value: "wind", unit: env.units === "imperial" ? " mph" : " km/h" },
    {
      key: "condition", label: "Weather now", type: "choice", value: "code",
      choices: [
        ...GROUPS.map((g) => ({ id: g.id, label: g.label, match: g.codes })),
        { id: "wet", label: "Rain, drizzle or storm", match: [...GROUPS[4].codes, ...GROUPS[5].codes, ...GROUPS[7].codes] },
      ],
    },
  ],
  draw(d, s) {
    const detail = s.detail === "auto"
      ? d.height >= 260 && d.width >= 320 ? "forecast" : d.height >= 150 ? "today" : "now"
      : s.detail;
    if (detail === "now") return drawNow(d, 0, 0, d.width, d.height);
    if (detail === "today") return drawToday(d, 0, 0, d.width, d.height);
    const topH = Math.round(d.height * 0.55);
    drawToday(d, 0, 0, d.width, topH);
    d.line(0, topH + 6, d.width, topH + 6, { width: 2 });
    drawForecast(d, 0, topH + 14, d.width, d.height - topH - 14);
  },
});
