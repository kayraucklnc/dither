import type { Condition, Format } from "@/runtime/types";
import type { Place } from "@/project/schema";
import { defineExtension, type Box, type Draw, type Env, type Fact, type MergeSpec, type SourceSpec } from "../api";
import { boxAround, KM_PER_DEG } from "../geo";
import { coastInk, letterbox, ringsFor } from "./coast-draw";
import { type Bounds, CUSTOM, REGION_OPTIONS, boundsOf as regionBounds, regionOf } from "./regions";

// The ships in a stretch of sea right now — the Bosphorus, the Cyclades, the
// Gulf of Finland — from Open Waters AIS, which gathers the national feeds
// (Fintraffic, Kystverket) and AISHub's receivers worldwide, and answers a box
// as GeoJSON to anyone. The answer is unordered and can run to hundreds of
// ships; the panel reads the first few slots of it, draws them where they are
// on a coastline drawn when the project compiles, and counts them all.

export const OPEN_WATERS = "https://ais.openwaters.io/v1/vessels";

const FIELDS = ["name", "lat", "lon", "sog", "cog", "nav", "type", "dest", "flag"] as const;
type Field = (typeof FIELDS)[number];
/** Where each field sits in a GeoJSON feature. */
const PATH: Record<Field, string> = {
  name: "properties.name", lat: "geometry.coordinates.1", lon: "geometry.coordinates.0", sog: "properties.sog", cog: "properties.cog",
  nav: "properties.nav_status", type: "properties.type", dest: "properties.destination", flag: "properties.flag",
};
/** A chart needs only where each ship is, which way it goes and its name, so it can carry twice as many. */
const CHART_FIELDS: readonly Field[] = ["name", "lat", "lon", "sog", "cog", "type"];
const COUNT_FIELDS: readonly Field[] = ["sog"];
/** Every slot is kept across sleeps in a cache shared by every widget, so few. */
const SLOTS = { chart: 24, count: 20, full: 12 } as const;
/** Ships on the chart that carry their name: the fastest few, which are the ones going somewhere. */
const LABELLED = 4;
/** Knots below which a ship is stopped: anchored, moored, or drifting at a quay. */
const MOVING_KN = 0.5;
/** Minutes after which kept positions are too old to draw. */
const STALE = 30;
/** Minutes between asks: Open Waters is a community service, and ships are slow. */
const EVERY = 10;
/** The ruler's far end, in knots: nothing afloat goes this fast. */
const RULER_KN = 100;

type Layout = "auto" | "chart" | "list" | "hero" | "count";
type Show = "all" | "underway";
type Units = "knots" | "kmh";

interface Settings extends Record<string, unknown> {
  region: string;
  place: Place | null;
  radius: number;
  layout: Layout;
  show: Show;
  units: Units;
  labels: boolean;
  maxAge: string;
}

const MAX_AGES = [600, 1800, 7200];
const radiusOf = (s: Settings) => Math.min(100, Math.max(5, Number(s.radius) || 25));
const placeOf = (s: Settings, env: Env) => s.place ?? env.place;
const maxAgeOf = (s: Settings) => (MAX_AGES.includes(Number(s.maxAge)) ? Number(s.maxAge) : MAX_AGES[0]);
const regionIdOf = (s: Settings) => (s.region === CUSTOM || regionOf(s.region) ? s.region : "bosphorus");

/** The box asked about: a preset's, or one around the place; null while a custom box has no place. */
export function boundsFor(s: Settings, env: Env): Bounds | null {
  if (regionIdOf(s) === CUSTOM) {
    const place = placeOf(s, env);
    if (!place) return null;
    const b = boxAround(place, radiusOf(s));
    return { south: b.lamin, west: b.lomin, north: b.lamax, east: b.lomax };
  }
  return regionBounds(regionOf(regionIdOf(s))!);
}

/** "the Bosphorus", or "around Milan". */
function nameOf(s: Settings, env: Env): string {
  if (regionIdOf(s) === CUSTOM) return `around ${placeOf(s, env)?.name ?? "the place"}`;
  return regionOf(regionIdOf(s))!.name;
}

/** How many slots a layout reads, and what of each. */
export function shapeOf(s: Settings): { slots: number; fields: readonly Field[] } {
  if (s.layout === "chart") return { slots: SLOTS.chart, fields: CHART_FIELDS };
  if (s.layout === "count") return { slots: SLOTS.count, fields: COUNT_FIELDS };
  return { slots: SLOTS.full, fields: FIELDS };
}

// --------------------------------------------------------------- what a ship is

/** A raw slot, as the answer lists them. */
const k = (f: Field, i: number) => `${f}${i}`;
/** The fleet: fastest first (nearest first around a place). */
const fk = (f: Field | "dist" | "brg", i: number) => `fleet/${f}${i}`;
/** Only the ships under way. */
const mk = (i: number) => `moving/sog${i}`;

const there = (i: number): Condition => ({ v: k("lat", i), op: "present" });
const listed = (i: number): Condition => ({ v: fk("sog", i), op: "present" });
const moving = (sogKey: string): Condition => ({ v: sogKey, op: "ge", x: MOVING_KN });
/** Fishing boats, yachts and pleasure craft: a smaller hull. */
const BOATS = [30, 36, 37];
const boatIs = (typeKey: string): Condition => ({ v: typeKey, op: "in", x: BOATS });
/** The last answer is recent enough to say where anything is. */
const fresh: Condition = { v: "_age", op: "le", x: STALE };
const showing: Condition = { all: [there(0), fresh] };
/** A destination worth printing. */
const bound = (i: number): Condition => ({ all: [{ v: fk("dest", i), op: "present" }, { v: fk("dest", i), op: "ne", x: "" }] });

/** Each hull turned to its course: 16 of them, each the middle of its 22.5° slice. */
type Kind = "ship" | "boat";
export const namesOf = (kind: Kind) => Array.from({ length: 16 }, (_, i) => `${kind}-${Math.floor(i * 22.5)}`);
const SLICES = Array.from({ length: 16 }, (_, i) => Math.round(i * 22.5 + 11.25));
/** The icon for a course; without one (or 360, "not available"), the ship points north. */
export const course = (kind: Kind): Format => ({ steps: { t: SLICES, o: [...namesOf(kind), `${kind}-0`] }, fallback: `${kind}-0` });

/** AIS navigational status, where it says something. */
const STATUSES: [number, string][] = [
  [0, "Under way"], [1, "At anchor"], [2, "Not under command"], [3, "Restricted"], [4, "Constrained by draught"], [5, "Moored"],
  [6, "Aground"], [7, "Fishing"], [8, "Sailing"], [11, "Towing"], [12, "Towing"], [14, "In distress"],
];
export const STATUS: Format = { map: { k: STATUSES.map(([c]) => c), o: STATUSES.map(([, w]) => w), d: "" }, fallback: "" };
const statusKnown = (navKey: string): Condition => ({ v: navKey, op: "in", x: STATUSES.map(([c]) => c) });

/** AIS ship types by their first digit, with the single-code special craft spelled out. */
const TYPE_STEPS: [number, string][] = [
  [30, "Fishing"], [31, "Towing"], [33, "Dredging"], [34, "Diving"], [35, "Military"], [36, "Sailing"], [37, "Pleasure"], [38, ""],
  [40, "High-speed"], [50, "Pilot"], [51, "Rescue"], [52, "Tug"], [53, "Tender"], [54, "Anti-pollution"], [55, "Police"], [56, ""],
  [58, "Medical"], [59, ""], [60, "Passenger"], [70, "Cargo"], [80, "Tanker"], [90, "Other"], [100, ""],
];
export const TYPE: Format = { steps: { t: TYPE_STEPS.map(([t]) => t), o: ["", ...TYPE_STEPS.map(([, w]) => w)] }, fallback: "" };

/** Which way a ship is going, on eight points. */
const COMPASS: Format = {
  steps: { t: [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5], o: ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"] },
  fallback: "",
};

const UNITS: Record<Units, { scale: number; unit: string; d: number }> = { knots: { scale: 1, unit: "kn", d: 1 }, kmh: { scale: 1.852, unit: "km/h", d: 0 } };
const speed = (u: Units): Format => ({ scale: UNITS[u].scale, num: { d: UNITS[u].d } });

// --------------------------------------------------------------- drawing helpers

/** Text placed so its baseline sits at `baseline`. */
function onBaseline(d: Draw, content: Parameters<Draw["text"]>[0], x: number, baseline: number, w: number, size: number, weight: 400 | 700, align: "left" | "right" | "center" = "left", white = false) {
  const m = d.metrics(size, weight);
  d.text(content, { x, y: baseline - m.ascent, w, h: m.lineHeight, size, weight, align, white });
}

/** Baseline that centres a line of this size in a band of height h, on the cap height. */
const centre = (y: number, h: number, size: number) => y + Math.round((h + Math.round(size * 0.73)) / 2);

/**
 * A name comes from the web, so its font goes on the panel whole. Above 48 px
 * fonts carry only ASCII and below 32 they are small: skip 40 and 48, the
 * heaviest whole fonts there are.
 */
function nameSize(d: Draw, w: number, h: number): number {
  for (const size of [64, 32, 28, 24, 20, 16]) if (d.measure("MAERSK KOTKA", size, 700) <= w && d.lineHeight(size, 700) <= h) return size;
  return 14;
}

/** The ship itself, its kind's hull turned to its course. */
function hull(d: Draw, typeKey: string, cogKey: string, box: Box) {
  d.when(boatIs(typeKey), () => d.iconFor(cogKey, course("boat"), namesOf("boat"), box));
  d.when({ not: boatIs(typeKey) }, () => d.iconFor(cogKey, course("ship"), namesOf("ship"), box));
}

/** "Moored", or by its speed when the status says nothing: "Under way" or "Stopped". */
function statusText(d: Draw, i: number, x: number, baseline: number, w: number, size: number, weight: 400 | 700, align: "left" | "right") {
  const nav = fk("nav", i);
  d.when(statusKnown(nav), () => onBaseline(d, [d.value(nav, STATUS)], x, baseline, w, size, weight, align));
  d.when({ all: [{ not: statusKnown(nav) }, moving(fk("sog", i))] }, () => onBaseline(d, "Under way", x, baseline, w, size, weight, align));
  d.when({ all: [{ not: statusKnown(nav) }, { not: moving(fk("sog", i)) }] }, () => onBaseline(d, "Stopped", x, baseline, w, size, weight, align));
}

/** "Cargo · to POTI", "Pleasure", or just "to POTI". */
function aboutText(d: Draw, i: number, x: number, baseline: number, w: number, size: number) {
  d.when(bound(i), () => onBaseline(d, [d.value(fk("type", i), TYPE), " · to ", d.value(fk("dest", i))], x, baseline, w, size, 400));
  d.when({ not: bound(i) }, () => onBaseline(d, [d.value(fk("type", i), { ...TYPE, fallback: "Ship" })], x, baseline, w, size, 400));
}

/** How many of a list's slots hold a ship: drawn once per count. */
function howMany(d: Draw, present: (i: number) => Condition, slots: number, draw: (text: string) => void) {
  d.when({ not: present(0) }, () => draw("0"));
  for (let i = 0; i < slots - 1; i++) d.when({ all: [present(i), { not: present(i + 1) }] }, () => draw(String(i + 1)));
  d.when(present(slots - 1), () => draw(`${slots}+`));
}

const underway = (i: number): Condition => ({ v: mk(i), op: "present" });

// --------------------------------------------------------------- nothing to show

function empty(d: Draw, s: Settings, env: Env, box: Box) {
  const name = nameOf(s, env);
  const size = Math.max(14, Math.min(26, Math.round(box.h * 0.14), d.fit([`No ships ${name}`], box.w, box.h, { weight: 700, max: 26 })));
  const say = (text: string) => d.text(text, { ...box, size, weight: 700, align: "center", valign: "middle", wrap: true, lines: 2 });
  // An empty sea and no answer are different news. Positions kept from an
  // answer long ago are no news at all: those ships are elsewhere by now.
  const emptySea: Condition = { all: [{ not: there(0) }, fresh] };
  d.when(emptySea, () => say(`No ships ${regionIdOf(s) === CUSTOM ? name : `in ${name}`}`));
  d.when({ all: [{ not: showing }, { not: emptySea }] }, () => say("Open Waters isn't answering — ships will show when it does"));
}

/** Ships about, but none under way, when only those are wanted. */
function nothingUnderWay(d: Draw, box: Box) {
  const size = Math.max(14, Math.min(22, Math.round(box.h * 0.12)));
  d.when({ all: [there(0), { not: listed(0) }] }, () => d.text("Nothing under way", { ...box, size, weight: 700, align: "center", valign: "middle" }));
}

function needsSetup(d: Draw, text: string) {
  d.icon("ship", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  d.text(text, { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit([text.split(" ").slice(0, 4).join(" ")], d.width, 40, { max: 24 }), align: "center", wrap: true, lines: 2 });
}

// --------------------------------------------------------------- layouts

/** Just how many: "97 ships in the Bosphorus · 13 under way". */
function count(d: Draw, s: Settings, env: Env, slots: number) {
  const { width: w, height: h } = d;
  const name = nameOf(s, env);
  const icon = Math.min(Math.round(h * 0.6), Math.round(w * 0.28), 64);
  const big = d.fit(["8,888"], Math.round((w - icon - 12) * 0.45), h, { weight: 700, max: 96 });
  const small = Math.max(14, Math.min(22, Math.round(big * 0.3)));
  const numW = d.measure("8,888", big, 700) + 6;
  const lines = h >= small * 3.6 ? 3 : 2;
  const block = numW + small * 0.4 + Math.max(d.measure("ships", small, 700), d.measure(`in ${name}`, small), lines === 3 ? d.measure(`${slots}+ under way`, small) : 0);
  const x0 = Math.max(0, Math.round((w - icon - 12 - block) / 2));
  d.icon("ship", { x: x0, y: Math.round((h - icon) / 2), w: icon, h: icon });
  const nx = x0 + icon + 12;
  const base = centre(0, h, big);
  d.when(fresh, () => onBaseline(d, [d.value("n", { num: { d: 0, sep: "," }, fallback: "–" })], nx, base, numW, big, 700));
  d.when({ not: fresh }, () => onBaseline(d, "–", nx, base, numW, big, 700));
  const tx = nx + numW + Math.round(small * 0.4);
  const lh = Math.round(small * 1.15);
  const top = lines === 3 ? base - lh : base - Math.round(lh / 2);
  onBaseline(d, "ships", tx, top, w - tx, small, 700);
  onBaseline(d, `in ${name}`, tx, top + lh, w - tx, small, 400);
  if (lines === 3) d.when(fresh, () => howMany(d, underway, slots, (n) => onBaseline(d, `${n} under way`, tx, top + lh * 2, w - tx, small, 400)));
}

/** The first ship, large: its name, what it is, where it is bound, how fast and which way. */
function hero(d: Draw, s: Settings, env: Env, box: Box, slots: number) {
  const u = s.units;
  const { x, y, w, h } = box;
  const footH = h >= 160 ? Math.max(18, Math.round(h * 0.12)) : 0;
  const bodyH = h - footH;
  const iconS = Math.max(24, Math.min(Math.round(bodyH * 0.8), Math.round(w * 0.3), 64));
  d.when(listed(0), () => hull(d, fk("type", 0), fk("cog", 0), { x, y: y + Math.round((bodyH - iconS) / 2), w: iconS, h: iconS }));
  const tx = x + iconS + 14;
  const tw = w - (tx - x);
  const big = nameSize(d, tw, Math.round(bodyH * 0.4));
  const mid = Math.max(14, Math.min(32, Math.round(big * 0.5)));
  const small = Math.max(13, Math.min(20, Math.round(mid * 0.75)));
  const gap = Math.round(mid * 0.3);
  const lines = d.metrics(big, 700).ascent + gap + d.metrics(small).lineHeight + d.metrics(mid, 700).lineHeight * 2;
  let base = y + Math.max(0, Math.round((bodyH - lines) / 2)) + d.metrics(big, 700).ascent;
  d.when(listed(0), () => {
    onBaseline(d, [d.value(fk("name", 0), { fallback: "Unknown" })], tx, base, tw, big, 700);
    const flagW = d.measure("WW", small, 700) + 4;
    aboutText(d, 0, tx, base + gap + d.metrics(small).lineHeight, tw - flagW, small);
    onBaseline(d, [d.value(fk("flag", 0), { fallback: "" })], tx + tw - flagW, base + gap + d.metrics(small).lineHeight, flagW, small, 700, "right");
  });
  base += gap + d.metrics(small).lineHeight + d.metrics(mid, 700).lineHeight;
  d.when(listed(0), () => {
    const velW = Math.min(tw, d.measure(`88.8 ${UNITS[u].unit}`, mid, 700) + 8);
    onBaseline(d, [d.value(fk("sog", 0), speed(u)), ` ${UNITS[u].unit}`], tx, base, velW, mid, 700);
    d.when(moving(fk("sog", 0)), () => onBaseline(d, ["· ", d.value(fk("cog", 0), COMPASS)], tx + velW, base, tw - velW, mid, 400));
  });
  base += d.metrics(mid, 700).lineHeight;
  statusText(d, 0, tx, base, tw, mid, 400, "left");
  nothingUnderWay(d, { x: tx, y, w: tw, h: bodyH });
  if (footH) {
    const fs = Math.max(13, Math.min(18, Math.round(footH * 0.8)));
    d.line(x, y + bodyH + 2, x + w, y + bodyH + 2, { width: 1 });
    const fy = y + h - Math.round(fs * 0.25);
    const countW = d.measure(`8,888 ships in ${nameOf(s, env)} · `, fs) + 4;
    onBaseline(d, [d.value("n", { num: { d: 0, sep: "," }, fallback: "–" }), ` ships in ${nameOf(s, env)} · `], x, fy, countW, fs, 400);
    howMany(d, underway, slots, (n) => onBaseline(d, `${n} under way`, x + countW, fy, w - countW, fs, 400));
  }
}

/** One row per ship, fastest first, in columns that line up. */
function list(d: Draw, s: Settings, box: Box, slots: number) {
  const u = s.units;
  const { x, y, w, h } = box;
  // Two lines a row (name over what it is and where it is bound) where there is room for them.
  const roomy = w >= 300 && h / 46 >= 4;
  const rows = Math.max(1, Math.min(slots, Math.floor(h / (roomy ? 46 : 30))));
  const rowH = Math.floor(h / rows);
  const iconS = Math.max(16, Math.min(32, Math.round(rowH * (roomy ? 0.62 : 0.75))));
  const nameX = x + iconS + 10;
  // The name is never cut short: the status goes first, then the name shrinks.
  const columns = (size: number, withStatus: boolean) => {
    const velW = d.measure(`88.8 ${UNITS[u].unit}`, size, 700) + 10;
    const statusW = withStatus ? d.measure("Constrained by draught", size) + 12 : 0;
    return { size, velW, statusW, nameW: w - (nameX - x) - velW - statusW - 4 };
  };
  const fits = (c: ReturnType<typeof columns>) => c.nameW >= d.measure("MAERSK KOTKA", c.size, 700) + 4;
  const target = roomy ? Math.round(rowH * 0.42) : Math.round(rowH * 0.75);
  let c = columns(Math.min(nameSize(d, w * 0.4, target), 28), true);
  for (const size of [24, 20, 16, 14]) if (!fits(c) && size < c.size) c = columns(size, true);
  if (!fits(c)) c = columns(c.size, false);
  const { size, velW, statusW, nameW } = c;
  const small = Math.max(13, Math.min(18, Math.round(size * 0.7)));
  for (let i = 0; i < rows; i++) {
    const ry = y + i * rowH;
    d.when(listed(i), () => {
      if (i > 0) d.line(x, ry, x + w, ry, { width: 1 });
      hull(d, fk("type", i), fk("cog", i), { x, y: ry + Math.round((rowH - iconS) / 2), w: iconS, h: iconS });
      const base = roomy ? ry + Math.round(rowH * 0.48) : centre(ry, rowH, size);
      onBaseline(d, [d.value(fk("name", i), { fallback: "?" })], nameX, base, nameW, size, 700);
      if (roomy) {
        const lower = ry + rowH - Math.round(small * 0.45);
        aboutText(d, i, nameX, lower, Math.round(nameW * 0.9), small);
        statusText(d, i, nameX + nameW, lower, velW + statusW, small, 400, "right");
      } else if (statusW) statusText(d, i, nameX + nameW, base, statusW, size, 400, "right");
      onBaseline(d, [d.value(fk("sog", i), speed(u)), ` ${UNITS[u].unit}`], x + w - velW, base, velW, size, 700, "right");
    });
  }
  nothingUnderWay(d, box);
}

/** A round length for the scale bar: at most a third of the chart. */
function scaleBar(d: Draw, plot: Box, b: Bounds, small: number) {
  const kmPerPx = ((b.east - b.west) * KM_PER_DEG * Math.cos(((b.south + b.north) / 2) * (Math.PI / 180))) / plot.w;
  const km = [1, 2, 5, 10, 20, 50, 100, 200, 500].filter((n) => n / kmPerPx <= plot.w / 3).pop();
  if (!km) return;
  const len = Math.round(km / kmPerPx);
  const text = `${km} km`;
  const th = d.lineHeight(small);
  const tw = d.measure(text, small);
  const x0 = plot.x + 6;
  const y0 = plot.y + plot.h - 6;
  d.rect({ x: x0 - 3, y: y0 - th - 5, w: Math.max(len, tw) + 6, h: th + 8 }, { fill: true, white: true });
  d.line(x0, y0, x0 + len, y0, { width: 2 });
  d.line(x0, y0 - 4, x0, y0, { width: 2 });
  d.line(x0 + len, y0 - 4, x0 + len, y0, { width: 2 });
  d.text(text, { x: x0, y: y0 - th - 3, w: tw + 4, h: th, size: small });
}

/**
 * Where they are: the region's coast, and each ship placed by its latitude and
 * longitude, its hull turned to its course, north up. Ships that are stopped
 * are dots. The first few carry their name.
 */
function chart(d: Draw, s: Settings, env: Env, box: Box, slots: number, labelled: boolean) {
  const b = boundsFor(s, env)!;
  const { x, y, w, h } = box;
  const small = Math.max(13, Math.min(16, Math.round(Math.min(w, h) / 30)));
  const th = d.lineHeight(small, 700);
  const headH = th + 6;
  const footH = h >= 200 ? th + 6 : 0;
  const name = nameOf(s, env);
  const title = regionIdOf(s) === CUSTOM ? `Ships ${name}` : name.replace(/^the /, "The ");

  // The header: the waters, and how many ships the whole box holds.
  const countW = d.measure(`8,888 ships · ${slots} shown`, small) + 4;
  onBaseline(d, title, x, y + th - 3, w - countW, small, 700);
  const n = d.value("n", { num: { d: 0, sep: "," }, fallback: "–" });
  d.when({ v: "n", op: "gt", x: slots }, () => onBaseline(d, [n, ` ships · ${slots} shown`], x + w - countW, y + th - 3, countW, small, 400, "right"));
  d.when({ v: "n", op: "le", x: slots }, () => onBaseline(d, [n, " ships"], x + w - countW, y + th - 3, countW, small, 400, "right"));

  const plot = letterbox(b, { x, y: y + headH, w, h: h - headH - footH });
  const rings = ringsFor(b, regionIdOf(s) === CUSTOM ? undefined : regionIdOf(s));
  if (rings.length) {
    const key = regionIdOf(s) === CUSTOM ? `coast:${b.south},${b.west},${b.north},${b.east}` : `coast:${regionIdOf(s)}`;
    d.bitmap(plot, key, coastInk(rings, b, plot.w, plot.h));
  }
  d.rect(plot, { fill: false, stroke: 1 });
  scaleBar(d, plot, b, small - 1);
  if (regionIdOf(s) === CUSTOM) d.icon("house", { x: plot.x + Math.round(plot.w / 2) - 8, y: plot.y + Math.round(plot.h / 2) - 8, w: 16, h: 16 });

  // The ships, last slot first so the first are drawn on top.
  const span = Math.min(plot.w, plot.h);
  const iconS = span >= 400 ? 24 : 16;
  const half = Math.round(iconS / 2);
  const dot = span >= 400 ? 3 : 2;
  const labelW = d.measure("MAERSK KOTKA", small, 700) + 8;
  // Ringed in white, a pixel each way, so it reads over the coast or another hull.
  const label = (i: number) => {
    const parts = [d.value(fk("name", i), { fallback: "" })];
    const at = (dx: number, dy: number, white: boolean) =>
      d.text(parts, { x: -Math.round(labelW / 2) + dx, y: half + 1 + dy, w: labelW, h: th, size: small, weight: 700, align: "center", white });
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) at(dx, dy, true);
    at(0, 0, false);
  };
  // At 16 px a boat's hull is a ship's: one icon a slot, not two under a condition each.
  const hullBox = { x: -half, y: -half, w: iconS, h: iconS };
  const craft = (i: number) => (iconS >= 24 ? hull(d, k("type", i), k("cog", i), hullBox) : d.iconFor(k("cog", i), course("ship"), namesOf("ship"), hullBox));
  for (let i = slots - 1; i >= 0; i--) {
    d.place({ x: k("lon", i), y: k("lat", i), box: plot, xs: [b.west, b.east], ys: [b.north, b.south] }, () => {
      d.when(moving(k("sog", i)), () => craft(i));
      if (s.show !== "underway") d.when({ not: moving(k("sog", i)) }, () => d.circle(0, 0, dot, { fill: true }));
    });
  }
  // The names last, under the fastest few, so no hull covers one; a stopped ship is not worth a name.
  if (labelled) {
    for (let i = LABELLED - 1; i >= 0; i--) {
      d.place({ x: fk("lon", i), y: fk("lat", i), box: plot, xs: [b.west, b.east], ys: [b.north, b.south] }, () => d.when(moving(fk("sog", i)), () => label(i)));
    }
  }

  // The footer: whose data, and how many are under way.
  if (footH) {
    const fy = y + h - Math.round(small * 0.3);
    onBaseline(d, "Open Waters AIS · AISHub", x, fy, Math.round(w * 0.6), small - 1, 400);
    howMany(d, underway, slots, (m) => onBaseline(d, `${m} under way`, x + Math.round(w * 0.6), fy, w - Math.round(w * 0.6), small - 1, 400, "right"));
  }
}

function layoutFor(d: Draw, s: Settings): Exclude<Layout, "auto"> {
  if (s.layout !== "auto") return s.layout;
  const { width: w, height: h } = d;
  if (h < 90 || w < 160) return "count";
  if (Math.min(w, h) >= 240) return "chart";
  if (h >= 170) return "list";
  return "hero";
}

// --------------------------------------------------------------- the widget

function sourceFor(s: Settings, env: Env): SourceSpec | null {
  const b = boundsFor(s, env);
  if (!b) return null;
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  const { slots, fields } = shapeOf(s);
  const values: SourceSpec["values"] = { n: { path: "features", agg: "count" } };
  for (let i = 0; i < slots; i++) for (const f of fields) values[k(f, i)] = `features.${i}.${PATH[f]}`;
  return {
    // Ships not heard from lately are left out: that keeps the answer small, and the quays' sleepers off the chart.
    url: `${OPEN_WATERS}?bbox=${r(b.south)},${r(b.west)},${r(b.north)},${r(b.east)}&max_age=${maxAgeOf(s)}`,
    every: EVERY,
    values,
  };
}

/**
 * The panel can sort a list only by a `geo` distance, and `geo` is plain
 * arithmetic over any two fields (docs/format.md, "Merges"): with both set to
 * the speed and the point at 100 knots, a ship's "distance" is 100 − its speed.
 * Sorted by that, the fastest comes first; within 99.5 of it, only the ships
 * under way remain. The real geography is used around a place, where nearest
 * first is what is asked for.
 */
function mergesFor(s: Settings, env: Env): Record<string, MergeSpec> {
  const { slots, fields } = shapeOf(s);
  const ruler = { lat: "sog", lon: "sog", at: [0, RULER_KN] as [number, number], kx: 1, ky: 0 };
  const underwayOnly = { ...ruler, within: RULER_KN - MOVING_KN };
  const place = regionIdOf(s) === CUSTOM ? placeOf(s, env) : null;
  const around = place ? {
    lat: "lat", lon: "lon", at: [place.latitude, place.longitude] as [number, number],
    kx: Math.round(KM_PER_DEG * Math.cos((place.latitude * Math.PI) / 180) * 1000) / 1000, ky: KM_PER_DEG, within: radiusOf(s),
  } : null;
  return {
    fleet: { from: [""], fields: [...fields], count: slots, sort: ["dist"], geo: around ?? (s.show === "underway" ? underwayOnly : ruler) },
    moving: { from: [""], fields: ["sog"], count: slots, geo: underwayOnly },
  };
}

/** Plausible traffic, placed at fractions of the box so every region's preview looks right. */
const SAMPLE: { name: string; fx: number; fy: number; sog: number; cog: number | null; nav: number | null; type: number | null; dest: string; flag: string }[] = [
  { name: "ASTROL-2", fx: 0.46, fy: 0.42, sog: 11.8, cog: 210, nav: 0, type: 70, dest: "POTI", flag: "RU" },
  { name: "MAERSK KOTKA", fx: 0.58, fy: 0.55, sog: 8.2, cog: 28, nav: 0, type: 80, dest: "NOVOROSSIYSK", flag: "DK" },
  { name: "TURGUT-REIS", fx: 0.52, fy: 0.48, sog: 18.4, cog: 95, nav: 0, type: 60, dest: "KADIKOY", flag: "TR" },
  { name: "KADRIYE ANA", fx: 0.38, fy: 0.61, sog: 4.1, cog: 300, nav: 7, type: 30, dest: "", flag: "TR" },
  { name: "THOE", fx: 0.63, fy: 0.37, sog: 5.6, cog: 160, nav: 8, type: 36, dest: "", flag: "GB" },
  { name: "LEADER S", fx: 0.35, fy: 0.35, sog: 0.1, cog: 360, nav: 1, type: 70, dest: "ISTANBUL", flag: "PA" },
  { name: "OCEAN MARY", fx: 0.41, fy: 0.52, sog: 0, cog: 360, nav: 1, type: 80, dest: "", flag: "LR" },
  { name: "PRINCE AMIN", fx: 0.66, fy: 0.62, sog: 0.2, cog: 360, nav: 1, type: 70, dest: "AMBARLI", flag: "MT" },
  { name: "YILDIZ BURNU", fx: 0.32, fy: 0.47, sog: 0, cog: 360, nav: 5, type: 69, dest: "", flag: "TR" },
  { name: "SAFE SEA", fx: 0.57, fy: 0.68, sog: 0, cog: 360, nav: 5, type: 79, dest: "", flag: "TR" },
  { name: "PILOT 3", fx: 0.49, fy: 0.58, sog: 9.3, cog: 352, nav: 0, type: 50, dest: "", flag: "TR" },
  { name: "VASILIKI", fx: 0.44, fy: 0.3, sog: 12.6, cog: 190, nav: null, type: null, dest: "", flag: "GR" },
  { name: "GOLDEN HIND", fx: 0.69, fy: 0.45, sog: 6.9, cog: 72, nav: 0, type: 37, dest: "", flag: "GB" },
  { name: "ARMONY", fx: 0.3, fy: 0.66, sog: 2.4, cog: 120, nav: 0, type: 90, dest: "", flag: "TR" },
  { name: "MSC FANTASIA", fx: 0.54, fy: 0.32, sog: 14.2, cog: 42, nav: 0, type: 60, dest: "PIRAEUS", flag: "PA" },
  { name: "BOSPHORUS 1", fx: 0.6, fy: 0.5, sog: 0.3, cog: 360, nav: 5, type: 52, dest: "", flag: "TR" },
];

function sampleFor(s: Settings, env: Env): Record<string, string | number | boolean | null> {
  const b = boundsFor(s, env) ?? regionBounds(regionOf("bosphorus")!);
  const { slots, fields } = shapeOf(s);
  const out: Record<string, string | number | boolean | null> = { n: 97 };
  SAMPLE.slice(0, slots).forEach((ship, i) => {
    const at = { lat: Math.round((b.south + ship.fy * (b.north - b.south)) * 1e5) / 1e5, lon: Math.round((b.west + ship.fx * (b.east - b.west)) * 1e5) / 1e5 };
    const value = (f: Field) => (f === "lat" ? at.lat : f === "lon" ? at.lon : ship[f]);
    for (const f of fields) out[k(f, i)] = value(f);
  });
  return out;
}

export default defineExtension<Settings>({
  id: "ships",
  name: "Ships",
  description: "The ships in a stretch of sea right now — the Bosphorus, the Cyclades, the Gulf of Finland — where they are on a chart, what they are, how fast and where they are bound. From Open Waters AIS, with no account.",
  icon: "ship",
  category: "data",
  size: { min: [3, 2], default: [8, 8] },
  fields: [
    { key: "region", label: "Waters", kind: "search", placeholder: "Bosphorus", options: () => REGION_OPTIONS },
    { key: "place", label: "Place", kind: "place", visible: (s) => s.region === CUSTOM, help: "Leave empty to use the project's place." },
    { key: "radius", label: "Within", kind: "number", min: 5, max: 100, step: 5, unit: "km", visible: (s) => s.region === CUSTOM, help: "Ships this far from the place, in any direction." },
    {
      key: "layout", label: "Show", kind: "select",
      options: [
        { value: "auto", label: "Whatever fits" },
        { value: "chart", label: "Chart: where they are" },
        { value: "list", label: "List, fastest first" },
        { value: "hero", label: "The fastest ship, large" },
        { value: "count", label: "Just how many" },
      ],
    },
    {
      key: "show", label: "Ships", kind: "select",
      options: [{ value: "all", label: "All" }, { value: "underway", label: "Under way only" }],
      help: "Under way is half a knot or more. Around a place, the list stays nearest first and only the chart and the count leave the others out.",
    },
    { key: "units", label: "Speed in", kind: "select", options: [{ value: "knots", label: "Knots" }, { value: "kmh", label: "km/h" }] },
    { key: "labels", label: "Names on the chart", kind: "toggle" },
    {
      key: "maxAge", label: "Heard within", kind: "select",
      options: [{ value: "600", label: "10 minutes" }, { value: "1800", label: "30 minutes" }, { value: "7200", label: "2 hours" }],
      help: "Ships that have not reported for longer are left out.",
    },
  ],
  defaults: () => ({ region: "bosphorus", place: null, radius: 25, layout: "auto", show: "all", units: "knots", labels: true, maxAge: "600" }),
  example: { region: "bosphorus" },
  title: (s, env) => `Ships · ${regionIdOf(s) === CUSTOM ? nameOf(s, env) : regionOf(regionIdOf(s))!.label}`,
  refresh: () => EVERY,
  source: sourceFor,
  merges: mergesFor,
  sample: sampleFor,
  facts: (s) => {
    const u = UNITS[s.units];
    const custom = regionIdOf(s) === CUSTOM;
    const facts: Fact[] = [
      { key: "count", label: "Ships in the area (the whole box)", type: "number", value: "n" },
      { key: "underway", label: "A ship is under way", type: "flag", test: underway(0) },
      { key: "fastest", label: custom ? "Nearest ship's speed" : "Fastest ship's speed", type: "number", value: fk("sog", 0), unit: ` ${u.unit}`, format: { scale: u.scale } },
    ];
    if (custom) facts.push({ key: "nearest", label: "Nearest ship's distance", type: "number", value: fk("dist", 0), unit: " km" });
    return facts;
  },
  draw(d, s, env) {
    if (!boundsFor(s, env)) return needsSetup(d, "Choose a place in Panel settings");
    const { slots } = shapeOf(s);
    const layout = layoutFor(d, s);
    if (layout === "count") return count(d, s, env, slots);
    const full = { x: 0, y: 0, w: d.width, h: d.height };
    empty(d, s, env, full);
    d.when(showing, () => {
      if (layout === "hero") return hero(d, s, env, full, slots);
      if (layout === "list") return list(d, s, full, slots);
      // A chart with room beside it lists the ships there too, when the layout is left to fit.
      const side = Math.min(d.width, d.height);
      if (s.layout === "auto" && d.width - side >= 200) {
        chart(d, s, env, { x: 0, y: 0, w: side, h: side }, slots, s.labels !== false);
        list(d, s, { x: side + 16, y: 0, w: d.width - side - 16, h: d.height }, slots);
      } else chart(d, s, env, full, slots, s.labels !== false);
    });
  },
});
