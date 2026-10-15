import type { Condition, Format } from "@/runtime/types";
import type { Place } from "@/project/schema";
import { defineExtension, type Box, type Draw, type Env, type SourceSpec } from "../api";
import { AIRLINES } from "./airlines";
import AIRPORTS from "./airports.json";

// OpenSky's live state vectors: every aircraft whose transponder was heard in
// a box around the place. The answer is a list of positional arrays, read slot
// by slot; the panel works out how far and which way each one is from you, keeps
// those within the radius, and lists them nearest (or lowest) first.

export const OPENSKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

/** Slots read from each answer. Every one is kept across sleeps, so few. */
const SLOTS = 12;
const FIELDS = ["cs", "lat", "lon", "alt", "vel", "trk", "vr", "cat", "sq"] as const;
type Field = (typeof FIELDS)[number];
/** Index of each field in an OpenSky state vector (`cat` needs `extended=1`). */
const COLUMN: Record<Field, number> = { cs: 1, lon: 5, lat: 6, alt: 7, vel: 9, trk: 10, vr: 11, sq: 14, cat: 17 };
const KM_PER_DEG = 111.32;
/** Faster than this, in m/s, a plane is climbing or descending rather than level. */
const CLIMB = 1;
/** Minutes after which kept positions are too old to draw: a jet covers 100 km in ten. */
const STALE = 15;
/** "Low overhead", in metres: about 5,000 ft. */
const LOW = 1524;

type Units = "aviation" | "metric" | "imperial";
type Layout = "auto" | "radar" | "sky" | "hero" | "list" | "count";
type Order = "near" | "low";

interface Settings extends Record<string, unknown> {
  place: Place | null;
  radius: number;
  layout: Layout;
  order: Order;
  units: Units;
  hideGround: boolean;
  airports: boolean;
}

const UNITS: Record<Units, { alt: number; altUnit: string; vel: number; velUnit: string }> = {
  aviation: { alt: 3.28084, altUnit: "ft", vel: 1.94384, velUnit: "kt" },
  metric: { alt: 1, altUnit: "m", vel: 3.6, velUnit: "km/h" },
  imperial: { alt: 3.28084, altUnit: "ft", vel: 2.23694, velUnit: "mph" },
};

const radiusOf = (s: Settings) => Math.min(100, Math.max(5, Number(s.radius) || 25));
const placeOf = (s: Settings, env: Env) => s.place ?? env.place;

/** The box OpenSky is asked about: square on the ground, so a degree of longitude shrinks with latitude. */
export function boxAround(place: Place, km: number): { lamin: number; lamax: number; lomin: number; lomax: number } {
  const dLat = km / KM_PER_DEG;
  const dLon = km / (KM_PER_DEG * Math.max(0.05, Math.cos((place.latitude * Math.PI) / 180)));
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    lamin: r(Math.max(-90, place.latitude - dLat)),
    lamax: r(Math.min(90, place.latitude + dLat)),
    lomin: r(Math.max(-180, place.longitude - dLon)),
    lomax: r(Math.min(180, place.longitude + dLon)),
  };
}

/** Airports inside a box, the large ones first. */
export function airportsIn(b: ReturnType<typeof boxAround>): { code: string; lat: number; lon: number; large: boolean }[] {
  return (AIRPORTS as [string, number, number, number][])
    .filter(([, lat, lon]) => lat >= b.lamin && lat <= b.lamax && lon >= b.lomin && lon <= b.lomax)
    .map(([code, lat, lon, large]) => ({ code, lat, lon, large: large === 1 }))
    .sort((a, c) => Number(c.large) - Number(a.large));
}

// --------------------------------------------------------------- what a plane is

const k = (field: Field | "dist" | "brg", i: number) => `near/${field}${i}`;
const there = (i: number): Condition => ({ v: k("lat", i), op: "present" });
const climbing = (i: number): Condition => ({ v: k("vr", i), op: "gt", x: CLIMB });
const descending = (i: number): Condition => ({ v: k("vr", i), op: "lt", x: -CLIMB });
const aloft = (i: number): Condition => ({ v: k("alt", i), op: "present" });
/** The last answer is recent enough to say where anything is. */
const fresh: Condition = { v: "_age", op: "le", x: STALE };
const showing: Condition = { all: [there(0), fresh] };

/** Transponder codes a crew sets when something is wrong. */
const SQUAWKS: Record<string, string> = { "7500": "Hijack", "7600": "Radio failure", "7700": "Emergency" };
const emergency = (i: number): Condition => ({ v: k("sq", i), op: "in", x: Object.keys(SQUAWKS) });
const SQUAWK: Format = { map: { k: Object.keys(SQUAWKS), o: Object.values(SQUAWKS) }, upper: true };

/** OpenSky's emitter categories; 0 and 1 mean nobody said. */
const CATEGORIES: [number, string][] = [
  [2, "Light"], [3, "Small"], [4, "Large"], [5, "Large"], [6, "Heavy"], [7, "Fast"], [8, "Helicopter"],
  [9, "Glider"], [10, "Balloon"], [11, "Parachutist"], [12, "Ultralight"], [14, "Drone"], [15, "Spacecraft"],
];
const CATEGORY: Format = { map: { k: CATEGORIES.map(([c]) => c), o: CATEGORIES.map(([, n]) => n), d: "" } };
const AIRLINE: Format = { head: 3, map: { k: Object.keys(AIRLINES), o: Object.values(AIRLINES), d: "" } };

// --------------------------------------------------------------- what kind of aircraft

/** Each kind's icon, flying its heading: 16 of them, each the middle of its 22.5° slice. */
const KINDS = ["jet", "heavy", "prop", "heli", "glider", "fast"] as const;
type Kind = (typeof KINDS)[number];
/** "-3d" picks the same kind as a solid model, seen at a slant, for the 3D view. */
const namesOf = (kind: Kind, view = "") => Array.from({ length: 16 }, (_, i) => `${kind}${view}-${Math.floor(i * 22.5)}`);
/** Where one heading's slice ends and the next begins, to the degree: each is spelled out in every icon. */
const SLICES = Array.from({ length: 16 }, (_, i) => Math.round(i * 22.5 + 11.25));
/** The icon for a heading; without one, the aircraft points north. */
export const heading = (kind: Kind, view = ""): Format => ({
  steps: { t: SLICES, o: [...namesOf(kind, view), `${kind}${view}-0`] },
  fallback: `${kind}${view}-0`,
});

/** Categories OpenSky reports for each kind. Most transponders report none at all. */
const CATS: Record<Exclude<Kind, "jet">, number[]> & { jet: number[] } = {
  jet: [3, 4], heavy: [5, 6], prop: [2, 11, 12, 14], heli: [8], glider: [9, 10], fast: [7],
};
const KNOWN = Object.values(CATS).flat();
/** With no category, slow and low is taken for a light aircraft, anything else for a jet. */
const slowAndLow = (i: number): Condition => ({ all: [{ v: k("vel", i), op: "lt", x: 70 }, { v: k("alt", i), op: "lt", x: 3000 }] });

function kindIs(kind: Kind, i: number): Condition {
  const reported: Condition = { v: k("cat", i), op: "in", x: CATS[kind] };
  const unreported: Condition = { not: { v: k("cat", i), op: "in", x: KNOWN } };
  if (kind === "jet") return { any: [reported, { all: [unreported, { not: slowAndLow(i) }] }] };
  if (kind === "prop") return { any: [reported, { all: [unreported, slowAndLow(i)] }] };
  return reported;
}

/** Which way a plane is from you, on eight points. */
const COMPASS: Format = {
  steps: { t: [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5], o: ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"] },
  fallback: "",
};
const overhead = (i: number): Condition => ({ v: k("dist", i), op: "lt", x: 1 });
const located = (i: number): Condition => ({ v: k("dist", i), op: "present" });

const altitude = (u: Units): Format => ({ scale: UNITS[u].alt, num: { d: 0, sep: "," } });
const shortAltitude = (u: Units): Format => ({ scale: UNITS[u].alt, num: { d: 0, compact: true } });
const speed = (u: Units): Format => ({ scale: UNITS[u].vel, num: { d: 0 } });

// --------------------------------------------------------------- drawing helpers

/** Text placed so its baseline sits at `baseline`. */
function onBaseline(d: Draw, content: Parameters<Draw["text"]>[0], x: number, baseline: number, w: number, size: number, weight: 400 | 700, align: "left" | "right" | "center" = "left", white = false) {
  const m = d.metrics(size, weight);
  d.text(content, { x, y: baseline - m.ascent, w, h: m.lineHeight, size, weight, align, white });
}

/** Baseline that centres a line of this size in a band of height h, on the cap height. */
const centre = (y: number, h: number, size: number) => y + Math.round((h + Math.round(size * 0.73)) / 2);

/**
 * A callsign comes from the web, so its font goes on the panel whole. Above
 * 48 px fonts carry only ASCII and below 32 they are small: skip 40 and 48,
 * the heaviest whole fonts there are.
 */
function callsignSize(d: Draw, w: number, h: number): number {
  for (const size of [64, 32, 28, 24, 20, 16]) if (d.measure("WZZ1234", size, 700) <= w && d.lineHeight(size, 700) <= h) return size;
  return 14;
}

/** The aircraft itself: its kind, pointing where it flies. */
function craft(d: Draw, i: number, box: Box) {
  for (const kind of KINDS) d.when(kindIs(kind, i), () => d.iconFor(k("trk", i), heading(kind), namesOf(kind), box));
}

function trend(d: Draw, i: number, box: Box) {
  d.when(climbing(i), () => d.icon("arrow-up", box));
  d.when(descending(i), () => d.icon("arrow-down", box));
}

/** "8 km NE", or "overhead" when it is within a kilometre. */
function directionText(d: Draw, i: number, x: number, baseline: number, w: number, size: number, weight: 400 | 700, align: "left" | "right", prefix = "") {
  d.when({ all: [located(i), { not: overhead(i) }] }, () =>
    onBaseline(d, [prefix, d.value(k("dist", i), { num: { d: 0 } }), " km ", d.value(k("brg", i), COMPASS)], x, baseline, w, size, weight, align));
  d.when(overhead(i), () => onBaseline(d, `${prefix}overhead`, x, baseline, w, size, weight, align));
}

function altitudeText(d: Draw, i: number, u: Units, x: number, baseline: number, w: number, size: number, weight: 400 | 700, align: "left" | "right") {
  d.when(aloft(i), () => onBaseline(d, [d.value(k("alt", i), altitude(u)), ` ${UNITS[u].altUnit}`], x, baseline, w, size, weight, align));
  d.when({ not: aloft(i) }, () => onBaseline(d, "on ground", x, baseline, w, size, weight, align));
}

/** "Turkish Airlines · Heavy", or the emergency instead, in a black band. */
function about(d: Draw, i: number, x: number, baseline: number, w: number, size: number) {
  // Airline on the left, kind on the right: either may be unknown and blank.
  d.when({ not: emergency(i) }, () => {
    onBaseline(d, [d.value(k("cs", i), AIRLINE)], x, baseline, w, size, 400);
    onBaseline(d, [d.value(k("cat", i), CATEGORY)], x, baseline, w, size, 400, "right");
  });
  d.when(emergency(i), () => {
    const m = d.metrics(size, 700);
    const label = ["SQUAWK ", d.value(k("sq", i)), " ", d.value(k("sq", i), SQUAWK)];
    const tw = Math.min(w, d.measure("SQUAWK 7700 RADIO FAILURE", size, 700) + 12);
    d.rect({ x, y: baseline - m.ascent - 3, w: tw, h: m.lineHeight + 4 }, { radius: 4 });
    onBaseline(d, label, x + 6, baseline, tw - 12, size, 700, "left", true);
  });
}

// --------------------------------------------------------------- nothing to show

function empty(d: Draw, s: Settings, box: Box) {
  const size = Math.max(14, Math.min(26, Math.round(box.h * 0.14), d.fit([`No aircraft within ${radiusOf(s)} km`], box.w, box.h, { weight: 700, max: 26 })));
  const say = (text: string) => d.text(text, { ...box, size, weight: 700, align: "center", valign: "middle", wrap: true, lines: 2 });
  // An empty sky and no answer are different news. Positions kept from an
  // answer long ago are no news at all: those planes are elsewhere by now.
  // A failed look after a recent empty answer is still an empty sky: OpenSky misses a beat now and then.
  const emptySky: Condition = { all: [{ not: there(0) }, fresh] };
  d.when(emptySky, () => say(`No aircraft within ${radiusOf(s)} km`));
  d.when({ all: [{ not: showing }, { not: emptySky }] }, () => say("OpenSky isn't answering — planes will show when it does"));
}

function needsSetup(d: Draw, text: string) {
  d.icon("plane", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  d.text(text, { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit([text.split(" ").slice(0, 4).join(" ")], d.width, 40, { max: 24 }), align: "center", wrap: true, lines: 2 });
}

// --------------------------------------------------------------- layouts

/**
 * How many are within the radius: the slots that hold a plane. OpenSky's own
 * count is the whole box, corners and runways too. Drawn once per count.
 */
function howMany(d: Draw, draw: (text: string) => void) {
  d.when({ not: there(0) }, () => draw("0"));
  for (let i = 0; i < SLOTS - 1; i++) d.when({ all: [there(i), { not: there(i + 1) }] }, () => draw(String(i + 1)));
  d.when(there(SLOTS - 1), () => draw(`${SLOTS}+`));
}

/** Just how many: "7 aircraft within 25 km". */
function count(d: Draw, s: Settings) {
  const { width: w, height: h } = d;
  const icon = Math.min(Math.round(h * 0.6), Math.round(w * 0.28), 64);
  const big = d.fit([`${SLOTS}+`], Math.round((w - icon - 12) * 0.45), h, { weight: 700, max: 96 });
  const small = Math.max(14, Math.min(22, Math.round(big * 0.3)));
  const numW = d.measure(`${SLOTS}+`, big, 700) + 6;
  const block = numW + small * 0.4 + Math.max(d.measure("aircraft", small, 700), d.measure(`within ${radiusOf(s)} km`, small));
  const x0 = Math.max(0, Math.round((w - icon - 12 - block) / 2));
  d.icon("plane", { x: x0, y: Math.round((h - icon) / 2), w: icon, h: icon });
  const nx = x0 + icon + 12;
  const base = centre(0, h, big);
  d.when(fresh, () => howMany(d, (n) => onBaseline(d, n, nx, base, numW, big, 700)));
  d.when({ not: fresh }, () => onBaseline(d, "–", nx, base, numW, big, 700));
  const tx = nx + numW + Math.round(small * 0.4);
  onBaseline(d, "aircraft", tx, base - Math.round(small * 1.15), w - tx, small, 700);
  onBaseline(d, `within ${radiusOf(s)} km`, tx, base, w - tx, small, 400);
}

/** The first plane, large: who it is, whose, how high, how fast, where. */
function hero(d: Draw, s: Settings, box: Box) {
  const u = s.units;
  const { x, y, w, h } = box;
  const footH = h >= 160 ? Math.max(18, Math.round(h * 0.12)) : 0;
  const bodyH = h - footH;
  // Sixteen headings of six kinds go on the panel: 64 px is as large as that stays cheap.
  const iconS = Math.max(24, Math.min(Math.round(bodyH * 0.8), Math.round(w * 0.3), 64));
  craft(d, 0, { x, y: y + Math.round((bodyH - iconS) / 2), w: iconS, h: iconS });
  const tx = x + iconS + 14;
  const tw = w - (tx - x);
  const big = callsignSize(d, tw, Math.round(bodyH * 0.4));
  const mid = Math.max(14, Math.min(32, Math.round(big * 0.5)));
  const small = Math.max(13, Math.min(20, Math.round(mid * 0.75)));
  const gap = Math.round(mid * 0.3);
  const lines = d.metrics(big, 700).ascent + gap + d.metrics(small).lineHeight + d.metrics(mid, 700).lineHeight * 2;
  let base = y + Math.max(0, Math.round((bodyH - lines) / 2)) + d.metrics(big, 700).ascent;
  onBaseline(d, [d.value(k("cs", 0), { fallback: "Unknown" })], tx, base, tw, big, 700);
  base += gap + d.metrics(small).lineHeight;
  about(d, 0, tx, base, tw, small);
  base += d.metrics(mid, 700).lineHeight;
  const altW = Math.min(tw, d.measure(`88,888 ${UNITS[u].altUnit}`, mid, 700) + 8);
  altitudeText(d, 0, u, tx, base, altW, mid, 700, "left");
  const arrow = Math.round(mid * 0.9);
  trend(d, 0, { x: tx + altW, y: base - Math.round(mid * 0.73) - Math.round((arrow - mid * 0.73) / 2), w: arrow, h: arrow });
  base += d.metrics(mid, 700).lineHeight;
  const velW = d.measure(`888 ${UNITS[u].velUnit}`, mid) + 4;
  onBaseline(d, [d.value(k("vel", 0), speed(u)), ` ${UNITS[u].velUnit}`], tx, base, velW, mid, 400);
  directionText(d, 0, tx + velW, base, tw - velW, mid, 400, "left", "· ");
  if (footH) {
    const fs = Math.max(13, Math.min(18, Math.round(footH * 0.8)));
    d.line(x, y + bodyH + 2, x + w, y + bodyH + 2, { width: 1 });
    howMany(d, (n) => onBaseline(d, `${n} aircraft within ${radiusOf(s)} km`, x, y + h - Math.round(fs * 0.25), w, fs, 400, "left"));
  }
}

/** One row per plane, nearest (or lowest) first, in columns that line up. */
function list(d: Draw, s: Settings, box: Box) {
  const u = s.units;
  const { x, y, w, h } = box;
  // Two lines a row (callsign over airline) where there is room for them.
  const roomy = w >= 300 && h / 46 >= 4;
  const rows = Math.max(1, Math.min(SLOTS, Math.floor(h / (roomy ? 46 : 30))));
  const rowH = Math.floor(h / rows);
  const iconS = Math.max(16, Math.min(32, Math.round(rowH * (roomy ? 0.62 : 0.75))));
  const csX = x + iconS + 10;
  // The callsign is never cut short: speed goes first, then the type shrinks.
  // Then where it is goes too.
  const columns = (size: number, withSpeed: boolean, withWhere = true) => {
    const altW = d.measure(`88,888 ${UNITS[u].altUnit}`, size, 700) + 8;
    const dirW = withWhere ? d.measure("88 km NW", size) + 12 : 0;
    const velW = withSpeed ? d.measure(`888 ${UNITS[u].velUnit}`, size) + 12 : 0;
    const arrow = Math.round(size * 0.85);
    return { size, altW, dirW, velW, arrow, csW: w - (csX - x) - altW - dirW - velW - arrow - 6 };
  };
  const fits = (c: ReturnType<typeof columns>) => c.csW >= d.measure("WZZ1234", c.size, 700) + 4;
  const target = roomy ? Math.round(rowH * 0.42) : Math.round(rowH * 0.75);
  let c = columns(Math.min(callsignSize(d, w * 0.4, target), 28), true);
  if (!fits(c)) c = columns(c.size, false);
  for (const size of [24, 20, 16, 14]) if (!fits(c) && size < c.size) c = columns(size, false);
  if (!fits(c)) c = columns(c.size, false, false);
  const { size, altW, dirW, velW, arrow, csW } = c;
  const small = Math.max(13, Math.min(18, Math.round(size * 0.7)));
  for (let i = 0; i < rows; i++) {
    const ry = y + i * rowH;
    d.when(there(i), () => {
      if (i > 0) d.line(x, ry, x + w, ry, { width: 1 });
      craft(d, i, { x, y: ry + Math.round((rowH - iconS) / 2), w: iconS, h: iconS });
      const base = roomy ? ry + Math.round(rowH * 0.48) : centre(ry, rowH, size);
      onBaseline(d, [d.value(k("cs", i), { fallback: "?" })], csX, base, csW, size, 700);
      if (roomy) about(d, i, csX, ry + rowH - Math.round(small * 0.45), w - (csX - x), small);
      altitudeText(d, i, u, csX + csW, base, altW, size, 700, "right");
      if (dirW) directionText(d, i, csX + csW + altW, base, dirW, size, 400, "right");
      if (velW) onBaseline(d, [d.value(k("vel", i), speed(u)), ` ${UNITS[u].velUnit}`], csX + csW + altW + dirW, base, velW, size, 400, "right");
      trend(d, i, { x: x + w - arrow, y: base - Math.round(size * 0.73) - Math.round((arrow - size * 0.73) / 2), w: arrow, h: arrow });
    });
  }
}

/**
 * Where they are: each aircraft placed by its latitude and longitude, its
 * kind's icon turned to its heading, north up. The lowest few carry their
 * callsign and height; one squawking an emergency is ringed.
 */
function radar(d: Draw, s: Settings, env: Env, box: Box) {
  const u = s.units;
  const km = radiusOf(s);
  const b = boxAround(placeOf(s, env)!, km);
  const span = Math.min(box.w, box.h);
  const cx = box.x + Math.round(box.w / 2);
  const cy = box.y + Math.round(box.h / 2);
  const small = Math.max(13, Math.min(16, Math.round(span / 30)));
  // The compass points sit outside the scope, like a bezel, so nothing cuts the ring.
  const R = Math.round(span / 2) - small - 6;
  const iconS = span >= 400 ? 32 : span >= 220 ? 24 : 16;
  // The outer ring is the radius asked for: aircraft are placed within its square.
  const plot = { x: cx - R, y: cy - R, w: R * 2, h: R * 2 };
  const px = (lon: number) => plot.x + ((lon - b.lomin) / (b.lomax - b.lomin)) * plot.w;
  const py = (lat: number) => plot.y + ((b.lamax - lat) / (b.lamax - b.lamin)) * plot.h;

  // The scope: a bold rim, range rings at thirds, crosshairs, and ticks every 10°.
  d.circle(cx, cy, R, { fill: false, stroke: 3 });
  for (const f of [1 / 3, 2 / 3]) d.circle(cx, cy, Math.round(R * f), { fill: false, stroke: 1 });
  d.line(cx, cy - R, cx, cy + R, { width: 1 });
  d.line(cx - R, cy, cx + R, cy, { width: 1 });
  for (let deg = 0; deg < 360; deg += 10) {
    const a = (deg * Math.PI) / 180;
    const len = deg % 90 === 0 ? 0 : deg % 30 === 0 ? Math.round(R * 0.07) : Math.round(R * 0.035);
    if (!len) continue;
    d.line(cx + Math.sin(a) * (R - len), cy - Math.cos(a) * (R - len), cx + Math.sin(a) * R, cy - Math.cos(a) * R, { width: deg % 30 === 0 ? 2 : 1 });
  }
  const th = d.lineHeight(small, 700);
  const letter = (t: string, x: number, y: number) => d.text(t, { x: x - th, y: y - th / 2, w: th * 2, h: th, size: small, weight: 700, align: "center" });
  letter("N", cx, cy - R - th / 2 - 2);
  letter("S", cx, cy + R + th / 2 + 2);
  letter("W", cx - R - th / 2 - 2, cy);
  letter("E", cx + R + th / 2 + 2, cy);
  // Each ring's distance where it crosses the north axis, just inside and to the right.
  const thirds = [Math.round(km / 3), Math.round((km * 2) / 3), km];
  thirds.forEach((dist, j) => {
    const ry = cy - Math.round((R * (j + 1)) / 3);
    const text = `${dist} km`;
    d.text(text, { x: cx + 4, y: ry + 2, w: d.measure(text, small - 1) + 4, h: th, size: small - 1 });
  });
  if (s.airports !== false) {
    for (const a of airportsIn(b).slice(0, 6)) {
      const ax = Math.round(px(a.lon));
      const ay = Math.round(py(a.lat));
      const m = a.large ? 5 : 4;
      d.rect({ x: ax - m, y: ay - m, w: m * 2, h: m * 2 }, { fill: false, stroke: 2 });
      d.text(a.code, { x: ax + m + 3, y: ay - th / 2, w: d.measure(a.code, small, 700) + 4, h: th, size: small, weight: a.large ? 700 : 400 });
    }
  }
  d.icon("house", { x: cx - 8, y: cy - 8, w: 16, h: 16 });

  // The aircraft, highest first so the lowest are drawn on top.
  const labelled = 4;
  const labelW = d.measure("WZZ1234 88.8k", small, 700) + 8;
  const half = Math.round(iconS / 2);
  for (let i = SLOTS - 1; i >= 0; i--) {
    d.place({ x: k("lon", i), y: k("lat", i), box: plot, xs: [b.lomin, b.lomax], ys: [b.lamax, b.lamin] }, () => {
      d.when(emergency(i), () => d.circle(0, 0, half + 5, { fill: false, stroke: 3 }));
      craft(d, i, { x: -half, y: -half, w: iconS, h: iconS });
      if (i < labelled) {
        d.text([d.value(k("cs", i), { fallback: "?" }), " ", d.value(k("alt", i), { ...shortAltitude(u), fallback: "" })],
          { x: -labelW / 2, y: half + 1, w: labelW, h: th, size: small, weight: 700, align: "center" });
      }
    });
  }
}

/** The ground seen at a slant: a circle this many times as tall as it is wide. */
const TILT = 0.38;
/** The top of the sky in the 3D view, in metres: 51,000 ft, above anything but a few business jets. */
const CEILING = 15500;

/** The aircraft as a solid model seen at a slant, turned to where it flies. */
function solidCraft(d: Draw, i: number, box: Box) {
  for (const kind of KINDS) d.when(kindIs(kind, i), () => d.iconFor(k("trk", i), heading(kind, "-3d"), namesOf(kind, "-3d"), box));
}

/** An ellipse as straight segments, from angle a0 to a1 (radians, 0 = east, counterclockwise on screen is up). */
function arc(d: Draw, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, steps: number, width: number) {
  let px = Math.round(cx + rx * Math.cos(a0));
  let py = Math.round(cy - ry * Math.sin(a0));
  for (let j = 1; j <= steps; j++) {
    const a = a0 + ((a1 - a0) * j) / steps;
    const x = Math.round(cx + rx * Math.cos(a));
    const y = Math.round(cy - ry * Math.sin(a));
    if (x !== px || y !== py) d.line(px, py, x, y, { width });
    px = x;
    py = y;
  }
}

/** A model seen at a slant is flatter than its box: one size up from the radar's. */
const skyIcon = (w: number, h: number) => (Math.min(w, h) >= 400 ? 48 : Math.min(w, h) >= 220 ? 32 : 24);

/** How much room the 3D view takes for a given ground radius. */
function skySize(R: number, th: number, iconS: number) {
  const H = Math.round(R * 0.8);
  return { H, w: 2 * R + 2 * (th + 8), h: Math.round(iconS / 2) + 4 + H + Math.round(2 * R * TILT) + th + 6 };
}

function skyRadius(box: Box, th: number, iconS: number): number {
  let R = Math.floor((box.w - 2 * (th + 8)) / 2);
  while (R > 20 && skySize(R, th, iconS).h > box.h) R--;
  return R;
}

/**
 * Where they are and how high, at a slant: the ground as a tilted scope, each
 * aircraft standing above its spot on a thin stalk as tall as its altitude.
 * Its shadow on the ground is where it is; how high the icon floats is how high
 * it flies. The mast at your house carries the altitude scale.
 */
function sky(d: Draw, s: Settings, env: Env, box: Box) {
  const u = s.units;
  const km = radiusOf(s);
  const b = boxAround(placeOf(s, env)!, km);
  const small = Math.max(13, Math.min(16, Math.round(Math.min(box.w, box.h) / 30)));
  const th = d.lineHeight(small, 700);
  const iconS = skyIcon(box.w, box.h);
  const R = skyRadius(box, th, iconS);
  const size = skySize(R, th, iconS);
  const H = size.H;
  const ry = Math.round(R * TILT);
  const cx = box.x + Math.round(box.w / 2);
  const top = box.y + Math.max(0, Math.round((box.h - size.h) / 2));
  const cy = top + Math.round(iconS / 2) + 4 + H + ry;
  // The ground square the aircraft are placed in, squashed like the scope.
  const plot = { x: cx - R, y: cy - ry, w: R * 2, h: ry * 2 };
  const gx = (lon: number) => plot.x + ((lon - b.lomin) / (b.lomax - b.lomin)) * plot.w;
  const gy = (lat: number) => plot.y + ((b.lamax - lat) / (b.lamax - b.lamin)) * plot.h;

  // The ground: the far half of the rim thin, the near half bold, so it reads as a disc seen from above the edge.
  arc(d, cx, cy, R, ry, 0, Math.PI, 48, 1);
  arc(d, cx, cy, R, ry, Math.PI, 2 * Math.PI, 48, 3);
  for (const f of [1 / 3, 2 / 3]) arc(d, cx, cy, Math.round(R * f), Math.round(ry * f), 0, 2 * Math.PI, 48, 1);
  d.line(cx - R, cy, cx + R, cy, { width: 1 });
  d.line(cx, cy - ry, cx, cy + ry, { width: 1 });
  const letter = (t: string, x: number, y: number) => d.text(t, { x: x - th, y: y - th / 2, w: th * 2, h: th, size: small, weight: 700, align: "center" });
  letter("N", cx + Math.round(th * 0.6), cy - ry - th / 2 - 1);
  letter("S", cx, cy + ry + th / 2 + 3);
  letter("W", cx - R - th / 2 - 4, cy);
  letter("E", cx + R + th / 2 + 4, cy);
  // Each ring's distance where it crosses the near (south) axis, the quietest part of the ground.
  [Math.round(km / 3), Math.round((km * 2) / 3), km].forEach((dist, j) => {
    const text = `${dist} km`;
    const y = cy + Math.round((ry * (j + 1)) / 3);
    d.text(text, { x: cx + 4, y: y - th + 1, w: d.measure(text, small - 1) + 4, h: th, size: small - 1 });
  });
  if (s.airports !== false) {
    for (const a of airportsIn(b).slice(0, 6)) {
      const ax = Math.round(gx(a.lon));
      const ay = Math.round(gy(a.lat));
      const m = a.large ? 4 : 3;
      d.rect({ x: ax - m - 1, y: ay - m + 1, w: m * 2 + 2, h: m * 2 - 2 }, { fill: false, stroke: 2 });
      d.text(a.code, { x: ax + m + 3, y: ay - th / 2, w: d.measure(a.code, small, 700) + 4, h: th, size: small, weight: a.large ? 700 : 400 });
    }
  }

  // The mast at home: a dotted pole with the altitude scale.
  const scale = u === "metric" ? { step: 4000, unit: 1, label: (n: number) => `${n / 1000} km` } : { step: 3048, unit: 3.28084, label: (n: number) => `${Math.round((n * 3.28084) / 1000)}k ft` };
  for (let y = cy - 4; y > cy - H; y -= 4) d.line(cx, y, cx, y - 1, { width: 1 });
  for (let m = scale.step; m < CEILING; m += scale.step) {
    const y = cy - Math.round((m / CEILING) * H);
    d.line(cx - 4, y, cx + 4, y, { width: 1 });
    const text = scale.label(m);
    d.text(text, { x: cx - 8 - d.measure(text, small - 1) - 4, y: y - th / 2, w: d.measure(text, small - 1) + 4, h: th, size: small - 1, align: "right" });
  }
  d.icon("house", { x: cx - 8, y: cy - 14, w: 16, h: 16 });

  // The aircraft, last slot first so the first are drawn on top.
  const labelled = 4;
  const half = Math.round(iconS / 2);
  // The label floats just above: a plane seen side-on is wide but flat, and its stalk hangs below.
  const labelY = -Math.round(iconS * 0.3) - th;
  const labelW = d.measure("WZZ1234 88.8k", small, 700) + 8;
  const plane = (i: number) => {
    d.when(emergency(i), () => d.circle(0, 0, half + 5, { fill: false, stroke: 3 }));
    solidCraft(d, i, { x: -half, y: -half, w: iconS, h: iconS });
  };
  // Ringed in white, a pixel each way, so it reads over a plane or a line.
  const label = (i: number) => {
    const parts = [d.value(k("cs", i), { fallback: "?" }), " ", d.value(k("alt", i), { ...shortAltitude(u), fallback: "" })];
    const at = (dx: number, dy: number, white: boolean) =>
      d.text(parts, { x: -Math.round(labelW / 2) + dx, y: labelY + dy, w: labelW, h: th, size: small, weight: 700, align: "center", white });
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) at(dx, dy, true);
    at(0, 0, false);
  };
  const ground = (i: number, fn: () => void) => d.place({ x: k("lon", i), y: k("lat", i), box: plot, xs: [b.lomin, b.lomax], ys: [b.lamax, b.lamin] }, fn);
  const aloftAt = (i: number, fn: () => void) => d.place({ x: k("alt", i), y: k("alt", i), box: { x: 0, y: -H, w: 0, h: H }, xs: [0, CEILING], ys: [CEILING, 0] }, fn);
  for (let i = SLOTS - 1; i >= 0; i--) {
    ground(i, () => {
      // Its shadow, and the stalk up to it.
      d.rect({ x: -2, y: -1, w: 5, h: 3 });
      d.bar({ x: 0, y: -H, w: 1, h: H }, k("alt", i), 0, CEILING, { vertical: true });
      aloftAt(i, () => plane(i));
      // Each copy of a plane costs its every icon; the one on the ground only when it is shown at all.
      if (!s.hideGround) d.when({ not: aloft(i) }, () => plane(i));
    });
  }
  // The labels last, so no plane covers another's name.
  for (let i = labelled - 1; i >= 0; i--) {
    ground(i, () => {
      aloftAt(i, () => label(i));
      if (!s.hideGround) d.when({ not: aloft(i) }, () => label(i));
    });
  }
}

function layoutFor(d: Draw, s: Settings): Exclude<Layout, "auto"> {
  if (s.layout !== "auto") return s.layout;
  const { width: w, height: h } = d;
  if (h < 90 || w < 160) return "count";
  if (Math.min(w, h) >= 240 && w >= h * 0.8) return "radar";
  if (h >= 170) return "list";
  return "hero";
}

// --------------------------------------------------------------- the widget

function sourceFor(s: Settings, env: Env): SourceSpec | null {
  const place = placeOf(s, env);
  // Never anonymously: its 400 requests a day are shared by everything on the
  // connection, and a day of flashing runs them out without a word.
  const account = env.accounts?.opensky;
  if (!place || !account) return null;
  const b = boxAround(place, radiusOf(s));
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(b).map(([key, v]) => [key, String(v)])), extended: "1" });
  const values: SourceSpec["values"] = { n: { path: "states", agg: "count" } };
  for (let i = 0; i < SLOTS; i++) for (const f of FIELDS) values[`${f}${i}`] = `states.${i}.${COLUMN[f]}`;
  return {
    url: `https://opensky-network.org/api/states/all?${q}`,
    panelOnly: "OpenSky only answers the panel, so the preview shows example planes.",
    // A linked client gets 4,000 requests a day: every 2 minutes is 720.
    every: 2,
    auth: {
      url: OPENSKY_TOKEN_URL,
      form: [["grant_type", "client_credentials"], ["client_id", account.clientId], ["client_secret", account.clientSecret]],
      token: "access_token",
      expires: "expires_in",
    },
    values,
  };
}

/**
 * Plausible traffic around the place: overflights, one on approach, one in
 * trouble, one on the ground, and a few farther out. Each sits a fixed distance
 * east and north of the place, as real planes do, so a wider radius takes in
 * more of them rather than moving them. OpenSky answers only what is in its box.
 */
function sampleFor(s: Settings, env: Env): Record<string, string | number | boolean | null> {
  const place = placeOf(s, env) ?? { name: "", latitude: 45.46, longitude: 9.19 };
  const km = radiusOf(s);
  const at = (east: number, north: number) => ({
    lat: place.latitude + north / KM_PER_DEG,
    lon: place.longitude + east / (KM_PER_DEG * Math.max(0.05, Math.cos((place.latitude * Math.PI) / 180))),
  });
  const planes = [
    { cs: "EJU12HZ ", ...at(10.5, 6), alt: 3802, vel: 184, trk: 244, vr: -4.6, cat: 4, sq: "5554", e: 10.5, n: 6 },
    { cs: "RYR4QK  ", ...at(-10, -15), alt: 11278, vel: 231, trk: 58, vr: 0, cat: 0, sq: "2310", e: -10, n: -15 },
    { cs: "DLH9AC  ", ...at(-2.5, 17.5), alt: 10972, vel: 240, trk: 172, vr: 0, cat: 4, sq: "1000", e: -2.5, n: 17.5 },
    { cs: "THY1TU  ", ...at(4, -5), alt: 1220, vel: 82, trk: 355, vr: 6.2, cat: 6, sq: "4611", e: 4, n: -5 },
    { cs: "SWR17M  ", ...at(-17.5, 12.5), alt: 7620, vel: 205, trk: 120, vr: 8.1, cat: 4, sq: "7700", e: -17.5, n: 12.5 },
    { cs: "UAE91   ", ...at(16, -20), alt: 12192, vel: 252, trk: 300, vr: 0, cat: 6, sq: "3301", e: 16, n: -20 },
    { cs: "IHELI   ", ...at(6, -10), alt: 310, vel: 48, trk: 205, vr: 0, cat: 8, sq: "7000", e: 6, n: -10 },
    { cs: "IABCD   ", ...at(-8.5, 4), alt: 900, vel: 55, trk: 80, vr: 1.5, cat: 0, sq: "7000", e: -8.5, n: 4 },
    { cs: "ITY1325 ", ...at(0, 0), alt: null, vel: 4, trk: 90, vr: null, cat: 4, sq: null, e: 0, n: 0 },
    { cs: "AZA784  ", ...at(-22, 38), alt: 9450, vel: 228, trk: 140, vr: 0, cat: 4, sq: "2265", e: -22, n: 38 },
    { cs: "BAW572  ", ...at(55, -45), alt: 11580, vel: 236, trk: 310, vr: 0, cat: 4, sq: "6012", e: 55, n: -45 },
    { cs: "AFR1622 ", ...at(30, 72), alt: 10360, vel: 230, trk: 200, vr: -2, cat: 4, sq: "1301", e: 30, n: 72 },
  ].filter((p) => Math.abs(p.e) <= km && Math.abs(p.n) <= km);
  const out: Record<string, string | number | boolean | null> = { n: planes.length };
  planes.forEach((p, i) => { for (const f of FIELDS) out[`${f}${i}`] = p[f]; });
  return out;
}

export default defineExtension<Settings>({
  id: "aircraft",
  name: "Aircraft overhead",
  description: "The planes flying near you right now — where, what kind, whose, how high and which way. From OpenSky, with a free account.",
  icon: "plane",
  category: "data",
  requires: ["opensky"],
  size: { min: [3, 2], default: [8, 8] },
  fields: [
    { key: "place", label: "Place", kind: "place", help: "Leave empty to use the project's place." },
    { key: "radius", label: "Within", kind: "number", min: 5, max: 100, step: 5, unit: "km", help: "Planes this far from you, in any direction." },
    {
      key: "layout", label: "Show", kind: "select",
      options: [
        { value: "auto", label: "Whatever fits" },
        { value: "radar", label: "Radar: where they are" },
        { value: "sky", label: "3D: where they are and how high" },
        { value: "list", label: "List" },
        { value: "hero", label: "The first plane, large" },
        { value: "count", label: "Just how many" },
      ],
    },
    {
      key: "order", label: "First", kind: "select",
      options: [
        { value: "near", label: "The nearest" },
        { value: "low", label: "The lowest" },
      ],
    },
    {
      key: "units", label: "Units", kind: "select",
      options: [
        { value: "aviation", label: "Feet and knots" },
        { value: "metric", label: "Metres and km/h" },
        { value: "imperial", label: "Feet and mph" },
      ],
    },
    { key: "hideGround", label: "Leave out planes on the ground", kind: "toggle" },
    { key: "airports", label: "Airports on the radar", kind: "toggle" },
  ],
  defaults: () => ({ place: null, radius: 25, layout: "auto", order: "near", units: "aviation", hideGround: true, airports: true }),
  title: (s, env) => `Aircraft · ${placeOf(s, env)?.name ?? "…"}`,
  refresh: () => 5,
  source: sourceFor,
  merges: (s, env) => {
    const place = placeOf(s, env);
    // How far and which way from the place, worked out on the panel; the box's corners are beyond the radius.
    const geo = place ? {
      lat: "lat", lon: "lon", at: [place.latitude, place.longitude] as [number, number],
      kx: Math.round(KM_PER_DEG * Math.cos((place.latitude * Math.PI) / 180) * 1000) / 1000, ky: KM_PER_DEG, within: radiusOf(s),
    } : undefined;
    return {
      // The nearest (or lowest) first; with no altitude (on the ground) last, or not at all.
      near: { from: [""], fields: [...FIELDS], count: SLOTS, sort: s.order === "low" ? ["alt"] : ["dist"], skip: s.hideGround ? ["alt"] : [], ...(geo ? { geo } : {}) },
    };
  },
  sample: sampleFor,
  facts: (s) => [
    { key: "count", label: "Aircraft in the area (the whole square)", type: "number", value: "n" },
    { key: "nearest", label: "Nearest plane's distance", type: "number", value: "near/dist0", unit: " km" },
    { key: "lowest", label: s.order === "low" ? "Lowest plane's altitude" : "Nearest plane's altitude", type: "number", value: "near/alt0", unit: ` ${UNITS[s.units].altUnit}`, format: { scale: UNITS[s.units].alt } },
    { key: "low", label: s.units === "metric" ? "A plane below 1,500 m" : "A plane below 5,000 ft", type: "flag", test: { any: Array.from({ length: SLOTS }, (_, i) => ({ v: k("alt", i), op: "lt", x: LOW }) as Condition) } },
    { key: "emergency", label: "A plane nearby squawks an emergency", type: "flag", test: { any: Array.from({ length: SLOTS }, (_, i) => emergency(i)) } },
  ],
  draw(d, s, env) {
    if (!env.accounts?.opensky) return needsSetup(d, "Link an OpenSky account in Panel settings");
    if (!placeOf(s, env)) return needsSetup(d, "Choose a place in Panel settings");
    const layout = layoutFor(d, s);
    if (layout === "count") return count(d, s);
    const full = { x: 0, y: 0, w: d.width, h: d.height };
    empty(d, s, full);
    d.when(showing, () => {
      if (layout === "hero") return hero(d, s, full);
      if (layout === "list") return list(d, s, full);
      if (layout === "sky") {
        // As much ground as the height allows; the list beside it when that leaves room.
        const small = Math.max(13, Math.min(16, Math.round(Math.min(d.width, d.height) / 30)));
        const th = d.lineHeight(small, 700);
        const iconS = skyIcon(d.width, d.height);
        const used = skySize(skyRadius({ ...full, w: Math.round(d.height * 1.6) }, th, iconS), th, iconS).w;
        if (d.width - used >= 220) {
          sky(d, s, env, { x: 0, y: 0, w: used, h: d.height });
          return list(d, s, { x: used + 12, y: 0, w: d.width - used - 12, h: d.height });
        }
        return sky(d, s, env, full);
      }
      // A radar with room beside it lists the planes there too.
      const side = Math.min(d.width, d.height);
      if (d.width - side >= 200) {
        radar(d, s, env, { x: 0, y: 0, w: side, h: side });
        list(d, s, { x: side + 16, y: 0, w: d.width - side - 16, h: d.height });
      } else radar(d, s, env, full);
    });
  },
});
