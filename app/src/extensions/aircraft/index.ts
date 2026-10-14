import type { Condition, Format } from "@/runtime/types";
import type { Place } from "@/project/schema";
import { defineExtension, type Box, type Draw, type Env, type SourceSpec } from "../api";
import { AIRLINES } from "./airlines";
import AIRPORTS from "./airports.json";

// OpenSky's live state vectors: every aircraft whose transponder was heard in
// a box around the place. The answer is a list of positional arrays, read slot
// by slot; the panel cannot work out distances, so "near" means "in the box",
// and the list is ordered lowest first — the planes you can see and hear.

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
type Layout = "auto" | "radar" | "hero" | "list" | "count";

interface Settings extends Record<string, unknown> {
  place: Place | null;
  radius: number;
  layout: Layout;
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

const k = (field: Field, i: number) => `near/${field}${i}`;
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
const namesOf = (kind: Kind) => Array.from({ length: 16 }, (_, i) => `${kind}-${Math.floor(i * 22.5)}`);
/** Where one heading's slice ends and the next begins, to the degree: each is spelled out in every icon. */
const SLICES = Array.from({ length: 16 }, (_, i) => Math.round(i * 22.5 + 11.25));
/** The icon for a heading; without one, the aircraft points north. */
export const heading = (kind: Kind): Format => ({
  steps: { t: SLICES, o: [...namesOf(kind), `${kind}-0`] },
  fallback: `${kind}-0`,
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
  const emptySky: Condition = { all: [{ not: there(0) }, { v: "_ok", op: "true" }, fresh] };
  d.when(emptySky, () => say(`No aircraft within ${radiusOf(s)} km`));
  d.when({ all: [{ not: showing }, { not: emptySky }] }, () => say("OpenSky isn't answering — planes will show when it does"));
}

function needsPlace(d: Draw) {
  d.icon("plane", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  d.text("Choose a place in Panel settings", { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit(["Choose a place in"], d.width, 40, { max: 24 }), align: "center", wrap: true, lines: 2 });
}

// --------------------------------------------------------------- layouts

/** Just how many: "7 aircraft within 25 km". */
function count(d: Draw, s: Settings) {
  const { width: w, height: h } = d;
  const icon = Math.min(Math.round(h * 0.6), Math.round(w * 0.28), 64);
  const big = d.fit(["88"], Math.round((w - icon - 12) * 0.45), h, { weight: 700, max: 96 });
  const small = Math.max(14, Math.min(22, Math.round(big * 0.3)));
  const numW = d.measure("88", big, 700) + 6;
  const block = numW + small * 0.4 + Math.max(d.measure("aircraft", small, 700), d.measure(`within ${radiusOf(s)} km`, small));
  const x0 = Math.max(0, Math.round((w - icon - 12 - block) / 2));
  d.icon("plane", { x: x0, y: Math.round((h - icon) / 2), w: icon, h: icon });
  const nx = x0 + icon + 12;
  const base = centre(0, h, big);
  d.when(fresh, () => onBaseline(d, [d.value("n", { num: { d: 0 }, fallback: "0" })], nx, base, numW, big, 700));
  d.when({ not: fresh }, () => onBaseline(d, "–", nx, base, numW, big, 700));
  const tx = nx + numW + Math.round(small * 0.4);
  onBaseline(d, "aircraft", tx, base - Math.round(small * 1.15), w - tx, small, 700);
  onBaseline(d, `within ${radiusOf(s)} km`, tx, base, w - tx, small, 400);
}

/** The lowest plane, large: who it is, whose, how high, how fast, which way. */
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
  onBaseline(d, [d.value(k("vel", 0), speed(u)), ` ${UNITS[u].velUnit}`], tx, base, tw, mid, 400);
  if (footH) {
    const fs = Math.max(13, Math.min(18, Math.round(footH * 0.8)));
    d.line(x, y + bodyH + 2, x + w, y + bodyH + 2, { width: 1 });
    onBaseline(d, [d.value("n", { num: { d: 0 }, fallback: "0" }), ` aircraft within ${radiusOf(s)} km`], x, y + h - Math.round(fs * 0.25), w, fs, 400, "left");
  }
}

/** One row per plane, lowest first, in columns that line up. */
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
  const columns = (size: number, withSpeed: boolean) => {
    const altW = d.measure(`88,888 ${UNITS[u].altUnit}`, size, 700) + 8;
    const velW = withSpeed ? d.measure(`888 ${UNITS[u].velUnit}`, size) + 12 : 0;
    const arrow = Math.round(size * 0.85);
    return { size, altW, velW, arrow, csW: w - (csX - x) - altW - velW - arrow - 6 };
  };
  const fits = (c: ReturnType<typeof columns>) => c.csW >= d.measure("WZZ1234", c.size, 700) + 4;
  const target = roomy ? Math.round(rowH * 0.42) : Math.round(rowH * 0.75);
  let c = columns(Math.min(callsignSize(d, w * 0.4, target), 28), true);
  if (!fits(c)) c = columns(c.size, false);
  for (const size of [24, 20, 16, 14]) if (!fits(c) && size < c.size) c = columns(size, false);
  const { size, altW, velW, arrow, csW } = c;
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
      if (velW) onBaseline(d, [d.value(k("vel", i), speed(u)), ` ${UNITS[u].velUnit}`], csX + csW + altW, base, velW, size, 400, "right");
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
  const x0 = box.x + Math.round((box.w - span) / 2);
  const y0 = box.y + Math.round((box.h - span) / 2);
  const cx = x0 + Math.round(span / 2);
  const cy = y0 + Math.round(span / 2);
  const R = Math.round(span / 2);
  const small = Math.max(13, Math.min(16, Math.round(span / 30)));
  const iconS = span >= 400 ? 32 : span >= 220 ? 24 : 16;
  const px = (lon: number) => x0 + ((lon - b.lomin) / (b.lomax - b.lomin)) * span;
  const py = (lat: number) => y0 + ((b.lamax - lat) / (b.lamax - b.lamin)) * span;

  // The ground: range rings, compass points, airports and home.
  d.circle(cx, cy, R - 1, { fill: false, stroke: 2 });
  d.circle(cx, cy, Math.round(R / 2), { fill: false, stroke: 1 });
  d.line(cx, y0 + small, cx, y0 + span - small, { width: 1 });
  d.line(x0 + small, cy, x0 + span - small, cy, { width: 1 });
  const tag = (text: string, x: number, y: number, align: "left" | "center" | "right" = "center", weight: 400 | 700 = 700) => {
    const tw = d.measure(text, small, weight) + 6;
    const tx = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
    const th = d.lineHeight(small, weight);
    d.rect({ x: tx, y: y - th / 2, w: tw, h: th }, { white: true });
    d.text(text, { x: tx, y: y - th / 2, w: tw, h: th, size: small, weight, align: "center" });
  };
  tag("N", cx, y0 + 2);
  tag("S", cx, y0 + span - 2);
  tag("W", x0 + 8, cy);
  tag("E", x0 + span - 8, cy);
  // Each ring's distance where it crosses the line south, clear of the compass points.
  tag(`${Math.round(km / 2)} km`, cx + 4, cy + Math.round(R / 2), "left", 400);
  tag(`${km} km`, cx + 4, cy + R - Math.round(small * 1.8), "left", 400);
  if (s.airports !== false) {
    for (const a of airportsIn(b).slice(0, 6)) {
      const ax = Math.round(px(a.lon));
      const ay = Math.round(py(a.lat));
      const m = a.large ? 5 : 4;
      d.rect({ x: ax - m, y: ay - m, w: m * 2, h: m * 2 }, { white: true });
      d.rect({ x: ax - m, y: ay - m, w: m * 2, h: m * 2 }, { fill: false, stroke: 2 });
      tag(a.code, ax + m + 2, ay, "left", a.large ? 700 : 400);
    }
  }
  d.icon("house", { x: cx - 8, y: cy - 8, w: 16, h: 16 });

  // The aircraft, highest first so the lowest are drawn on top.
  const labelled = 4;
  const labelW = d.measure("WZZ1234 88.8k", small, 700) + 8;
  const th = d.lineHeight(small, 700);
  const half = Math.round(iconS / 2);
  for (let i = SLOTS - 1; i >= 0; i--) {
    d.place({ x: k("lon", i), y: k("lat", i), box: { x: x0, y: y0, w: span, h: span }, xs: [b.lomin, b.lomax], ys: [b.lamax, b.lamin] }, () => {
      d.when(emergency(i), () => d.circle(0, 0, half + 5, { fill: false, stroke: 3 }));
      craft(d, i, { x: -half, y: -half, w: iconS, h: iconS });
      if (i < labelled) {
        d.rect({ x: -labelW / 2, y: half + 1, w: labelW, h: th }, { white: true });
        d.text([d.value(k("cs", i), { fallback: "?" }), " ", d.value(k("alt", i), { ...shortAltitude(u), fallback: "" })],
          { x: -labelW / 2, y: half + 1, w: labelW, h: th, size: small, weight: 700, align: "center" });
      }
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
  if (!place) return null;
  const b = boxAround(place, radiusOf(s));
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(b).map(([key, v]) => [key, String(v)])), extended: "1" });
  const values: SourceSpec["values"] = { n: { path: "states", agg: "count" } };
  for (let i = 0; i < SLOTS; i++) for (const f of FIELDS) values[`${f}${i}`] = `states.${i}.${COLUMN[f]}`;
  const account = env.accounts?.opensky;
  return {
    url: `https://opensky-network.org/api/states/all?${q}`,
    // Anonymous callers get 400 requests a day; a linked client gets 4,000.
    every: account ? 2 : 5,
    ...(account ? {
      auth: {
        url: OPENSKY_TOKEN_URL,
        form: [["grant_type", "client_credentials"], ["client_id", account.clientId], ["client_secret", account.clientSecret]],
        token: "access_token",
        expires: "expires_in",
      },
    } : {}),
    values,
  };
}

/** Plausible traffic around the place: overflights, one on approach, one in trouble, one on the ground. */
function sampleFor(s: Settings, env: Env): Record<string, string | number | boolean | null> {
  const place = placeOf(s, env) ?? { name: "", latitude: 45.46, longitude: 9.19 };
  const b = boxAround(place, radiusOf(s));
  const at = (fy: number, fx: number) => ({ lat: b.lamin + (b.lamax - b.lamin) * fy, lon: b.lomin + (b.lomax - b.lomin) * fx });
  const planes = [
    { cs: "EJU12HZ ", ...at(0.62, 0.71), alt: 3802, vel: 184, trk: 244, vr: -4.6, cat: 4, sq: "5554" },
    { cs: "RYR4QK  ", ...at(0.2, 0.3), alt: 11278, vel: 231, trk: 58, vr: 0, cat: 0, sq: "2310" },
    { cs: "DLH9AC  ", ...at(0.85, 0.45), alt: 10972, vel: 240, trk: 172, vr: 0, cat: 4, sq: "1000" },
    { cs: "THY1TU  ", ...at(0.4, 0.58), alt: 1220, vel: 82, trk: 355, vr: 6.2, cat: 6, sq: "4611" },
    { cs: "SWR17M  ", ...at(0.75, 0.15), alt: 7620, vel: 205, trk: 120, vr: 8.1, cat: 4, sq: "7700" },
    { cs: "UAE91   ", ...at(0.1, 0.82), alt: 12192, vel: 252, trk: 300, vr: 0, cat: 6, sq: "3301" },
    { cs: "IHELI   ", ...at(0.3, 0.62), alt: 310, vel: 48, trk: 205, vr: 0, cat: 8, sq: "7000" },
    { cs: "IABCD   ", ...at(0.58, 0.33), alt: 900, vel: 55, trk: 80, vr: 1.5, cat: 0, sq: "7000" },
    { cs: "ITY1325 ", ...at(0.5, 0.5), alt: null, vel: 4, trk: 90, vr: null, cat: 4, sq: null },
  ];
  const out: Record<string, string | number | boolean | null> = { n: planes.length };
  planes.forEach((p, i) => { for (const f of FIELDS) out[`${f}${i}`] = p[f]; });
  return out;
}

export default defineExtension<Settings>({
  id: "aircraft",
  name: "Aircraft overhead",
  description: "The planes flying near you right now — where, what kind, whose, how high and which way. From OpenSky, no account needed.",
  icon: "plane",
  category: "data",
  size: { min: [3, 2], default: [8, 8] },
  fields: [
    { key: "place", label: "Place", kind: "place", help: "Leave empty to use the project's place." },
    { key: "radius", label: "Within", kind: "number", min: 5, max: 100, step: 5, unit: "km", help: "Planes in a square this far each way. The panel lists the lowest first, not the nearest — it cannot work out distances." },
    {
      key: "layout", label: "Show", kind: "select",
      options: [
        { value: "auto", label: "Whatever fits" },
        { value: "radar", label: "Radar: where they are" },
        { value: "list", label: "List, lowest first" },
        { value: "hero", label: "The lowest plane" },
        { value: "count", label: "Just how many" },
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
  defaults: () => ({ place: null, radius: 25, layout: "auto", units: "aviation", hideGround: true, airports: true }),
  title: (s, env) => `Aircraft · ${placeOf(s, env)?.name ?? "…"}`,
  refresh: () => 5,
  source: sourceFor,
  merges: (s) => ({
    // The lowest first; with no altitude (on the ground) last, or not at all.
    near: { from: [""], fields: [...FIELDS], count: SLOTS, sort: ["alt"], skip: s.hideGround ? ["alt"] : [] },
  }),
  sample: sampleFor,
  facts: (s) => [
    { key: "count", label: "Aircraft nearby", type: "number", value: "n" },
    { key: "lowest", label: "Lowest plane's altitude", type: "number", value: "near/alt0", unit: ` ${UNITS[s.units].altUnit}`, format: { scale: UNITS[s.units].alt } },
    { key: "low", label: s.units === "metric" ? "A plane below 1,500 m" : "A plane below 5,000 ft", type: "flag", test: { v: "near/alt0", op: "lt", x: LOW } },
    { key: "emergency", label: "A plane nearby squawks an emergency", type: "flag", test: { any: Array.from({ length: SLOTS }, (_, i) => emergency(i)) } },
  ],
  draw(d, s, env) {
    if (!placeOf(s, env)) return needsPlace(d);
    const layout = layoutFor(d, s);
    if (layout === "count") return count(d, s);
    const full = { x: 0, y: 0, w: d.width, h: d.height };
    empty(d, s, full);
    d.when(showing, () => {
      if (layout === "hero") return hero(d, s, full);
      if (layout === "list") return list(d, s, full);
      // A radar with room beside it lists the planes there too.
      const side = Math.min(d.width, d.height);
      if (d.width - side >= 200) {
        radar(d, s, env, { x: 0, y: 0, w: side, h: side });
        list(d, s, { x: side + 16, y: 0, w: d.width - side - 16, h: d.height });
      } else radar(d, s, env, full);
    });
  },
});
