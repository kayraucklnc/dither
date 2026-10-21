import type { Condition, Format } from "@/runtime/types";
import type { Place } from "@/project/schema";
import { defineExtension, type Box, type Draw, type Env, type SourceSpec } from "../api";
import { LAND, LAND_HEIGHT, LAND_WIDTH } from "./land";
import { REGIONS } from "./regions";
import { shade } from "../stipple";

// The International Space Station, from wheretheiss.at: where it is now and
// where it was and will be over one whole orbit, drawn on a globe seen from
// space. The panel cannot turn a globe, so it carries eight, one every 45° of
// longitude, and shows the one beneath the station. The orbit's far half goes
// behind the Earth.

const API = "https://api.wheretheiss.at/v1/satellites/25544";
/** Points on the orbit, and seconds between them: 40 × 140 s is one 93-minute orbit. */
const POINTS = 40;
const STEP = 140;
/** Each answer holds up to ten positions. */
const PER_SOURCE = 10;
const SOURCES = ["a", "b", "c", "d"] as const;
/** The point at "now" is the first of the third source: twenty behind it, nineteen ahead. */
const NOW = { source: "c", index: 0 } as const;
/** Globes: one centred on every 45° of longitude, on the equator. Each is a large bitmap, so few. */
const GLOBES = Array.from({ length: 8 }, (_, i) => -157.5 + i * 45);
const HALF = 22.5;
/** The largest globe's radius: a bitmap twice this square, once per globe. */
const MAX_R = 170;
/** The orbit drawn above the ground: the real 420 km would be 6.6% of the radius; this reads as "in orbit". */
const LIFT = 1.13;
/** Minutes after which the last answer is too old to say where the station is: it circles the Earth in 93. */
const STALE = 30;

interface Settings extends Record<string, unknown> {
  every: number;
  home: boolean;
}

/** The point at orbit position `i` (0 is 47 minutes ago, 20 now). */
const pointKeys = (i: number) => {
  const source = SOURCES[Math.floor(i / PER_SOURCE)];
  const n = i % PER_SOURCE;
  return { lat: `${source}/la${n}`, lon: `${source}/lo${n}` };
};
const NOW_INDEX = SOURCES.indexOf(NOW.source) * PER_SOURCE + NOW.index;
const here = pointKeys(NOW_INDEX);
const ALT = `${NOW.source}/alt`;
const VEL = `${NOW.source}/vel`;
const VIS = `${NOW.source}/vis`;

const known: Condition = { v: here.lat, op: "present" };
const fresh: Condition = { v: `${NOW.source}/_age`, op: "le", x: STALE };
const showing: Condition = { all: [known, fresh] };
const sunlit: Condition = { v: VIS, op: "eq", x: "daylight" };

type Point = { lat: string; lon: string };
const lonIn = (from: number, to: number, last = false, p: Point = here): Condition => ({
  all: [{ v: p.lon, op: "ge", x: from }, { v: p.lon, op: last ? "le" : "lt", x: to }],
});
const latIn = (from: number, to: number, p: Point = here): Condition => ({ all: [{ v: p.lat, op: "ge", x: from }, { v: p.lat, op: "lt", x: to }] });
/** Where it will be in about twenty minutes: nine points ahead. */
const AHEAD = 9;
const ahead = pointKeys(NOW_INDEX + AHEAD);
const AHEAD_MINUTES = Math.round((AHEAD * STEP) / 300) * 5;

const METRIC = { scale: 1, alt: "km", vel: "km/h" };
const IMPERIAL = { scale: 0.621371, alt: "mi", vel: "mph" };
const unitsOf = (env: Env) => (env.units === "imperial" ? IMPERIAL : METRIC);
const number = (scale: number): Format => ({ scale, num: { d: 0, sep: "," } });

// --------------------------------------------------------------- the globe

const landBits = (() => {
  const raw = atob(LAND);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
})();

function isLand(lat: number, lon: number): boolean {
  const x = Math.min(LAND_WIDTH - 1, Math.max(0, Math.floor(((((lon + 180) % 360) + 360) % 360) * (LAND_WIDTH / 360))));
  const y = Math.min(LAND_HEIGHT - 1, Math.max(0, Math.floor((90 - lat) * (LAND_HEIGHT / 180))));
  return (landBits[y * (LAND_WIDTH / 8) + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
}

const DEG = Math.PI / 180;


/** Sunlight from the upper left and a little in front, as a unit vector (x right, y up, z towards you). */
const LIGHT = (() => {
  const v = [-0.55, 0.5, 0.67];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();
/** Room around the globe's bitmap for its atmosphere. */
export const HALO = 5;

/**
 * One globe as a mask, `2(R + HALO) + 1` pixels square, centred on the equator
 * at `lon0`, lit like a ball: the sea darkens into stipple away from the light,
 * the land is a shade darker than the sea, the coasts are drawn, and a dotted
 * atmosphere rings it. Worked out here, when the project compiles.
 */
export function globeInk(R: number, lon0: number): (x: number, y: number) => boolean {
  const size = 2 * R + 1;
  const land = new Uint8Array(size * size);
  const light = new Float32Array(size * size);
  const inside = new Uint8Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px - R) / R;
      const y = (R - py) / R;
      const rho2 = x * x + y * y;
      if (rho2 > 1) continue;
      const i = py * size + px;
      const z = Math.sqrt(1 - rho2);
      inside[i] = 1;
      light[i] = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
      land[i] = isLand(Math.asin(y) / DEG, lon0 + Math.atan2(x, z) / DEG) ? 1 : 0;
    }
  }
  const at = (px: number, py: number, a: Uint8Array) => (px >= 0 && py >= 0 && px < size && py < size ? a[py * size + px] : 0);
  return (bx, by) => {
    const px = bx - HALO;
    const py = by - HALO;
    const rho = Math.hypot(px - R, py - R);
    // The atmosphere: a sparse ring just off the edge, thinning outwards.
    if (rho > R + 0.5) return rho < R + HALO - 0.5 && shade(bx, by, 0.32 - (rho - R) * 0.06);
    const i = py * size + px;
    if (px < 0 || py < 0 || px >= size || py >= size || !inside[i]) return false;
    if (rho > R - 1.5) return true; // the rim
    const dark = 1 - light[i];
    if (land[i]) {
      const coast = !at(px - 1, py, land) || !at(px + 1, py, land) || !at(px, py - 1, land) || !at(px, py + 1, land);
      return coast || shade(px, py, 0.16 + dark * 0.6);
    }
    // The sea is white where the sun is high, and goes grey towards the shadowed limb.
    return shade(px, py, Math.max(0, dark - 0.45) * 0.9);
  };
}

/** Stars scattered over the dark, the same every time: a few bright ones, most faint. */
function stars(d: Draw, box: Box, clear: { x: number; y: number; r: number }) {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const count = Math.round((box.w * box.h) / 2600);
  for (let n = 0; n < count; n++) {
    const x = Math.round(box.x + 4 + random() * (box.w - 8));
    const y = Math.round(box.y + 4 + random() * (box.h - 8));
    const bright = random() < 0.12;
    if (Math.hypot(x - clear.x, y - clear.y) < clear.r + 6) continue;
    if (bright) {
      d.line(x - 2, y, x + 2, y);
      d.line(x, y - 2, x, y + 2);
    } else d.rect({ x, y, w: 1, h: 1 });
  }
}

/**
 * The station over its globe: the orbit behind the Earth, the Earth, the orbit
 * in front, the point beneath the station, and the station on top. One copy
 * per globe; the one beneath the station shows.
 */
function globe(d: Draw, s: Settings, env: Env, box: Box) {
  const R = Math.min(MAX_R, Math.floor((Math.min(box.w, box.h) / 2) / LIFT) - 6);
  const cx = box.x + Math.round(box.w / 2);
  const cy = box.y + Math.round(box.h / 2);
  const orbitR = Math.round(R * LIFT);
  const iconS = R >= 110 ? 48 : R >= 70 ? 32 : 24;
  const half = iconS / 2;
  const home = s.home !== false ? env.place : null;
  stars(d, box, { x: cx, y: cy, r: orbitR });
  GLOBES.forEach((lon0, g) => {
    const last = g === GLOBES.length - 1;
    d.when(lonIn(lon0 - HALF, lon0 + HALF, last), () => {
      const on = (keys: { lat: string; lon: string }, r: number, side: "front" | "back" | "any", fn: () => void) =>
        d.place({ lat: keys.lat, lon: keys.lon, globe: [0, lon0], centre: { x: cx, y: cy }, r, side }, fn);
      // Behind: only what shows past the Earth's edge survives the disc drawn over it.
      for (let i = 0; i < POINTS; i++) on(pointKeys(i), orbitR, "back", () => d.rect({ x: -1, y: -1, w: 2, h: 2 }));
      d.circle(cx, cy, R, { white: true });
      d.bitmap({ x: cx - R - HALO, y: cy - R - HALO, w: 2 * (R + HALO) + 1, h: 2 * (R + HALO) + 1 }, `globe:${lon0}`, globeInk(R, lon0));
      if (home && Math.cos(home.latitude * DEG) * Math.cos((home.longitude - lon0) * DEG) > 0.1) {
        const hx = cx + Math.round(R * Math.cos(home.latitude * DEG) * Math.sin((home.longitude - lon0) * DEG));
        const hy = cy - Math.round(R * Math.sin(home.latitude * DEG));
        d.circle(hx, hy, 5, { white: true });
        d.circle(hx, hy, 4, { fill: false, stroke: 2 });
        d.circle(hx, hy, 1);
      }
      // In front: where it has been solid, where it is going lighter.
      for (let i = 0; i < POINTS; i++) {
        if (i === NOW_INDEX) continue;
        on(pointKeys(i), orbitR, "front", () => (i < NOW_INDEX ? d.rect({ x: -2, y: -2, w: 4, h: 4 }) : d.circle(0, 0, 2, { fill: false, stroke: 1 })));
      }
      // The point beneath it, then the station itself.
      on(here, R, "front", () => {
        d.line(-4, 0, 4, 0, { width: 2 });
        d.line(0, -4, 0, 4, { width: 2 });
      });
      on(here, orbitR, "any", () => {
        d.circle(0, 0, Math.round(half * 0.9), { white: true });
        d.icon("iss", { x: -half, y: -half, w: iconS, h: iconS });
      });
    });
  });
}

// --------------------------------------------------------------- the words

function onBaseline(d: Draw, content: Parameters<Draw["text"]>[0], x: number, baseline: number, w: number, size: number, weight: 400 | 700 = 400) {
  const m = d.metrics(size, weight);
  d.text(content, { x, y: baseline - m.ascent, w, h: m.lineHeight, size, weight });
}

/** The names that take the most room, to size text by. */
const LONGEST = ["Over the Mediterranean", "Over the United States", "Over the North Atlantic"];

/** "Over the North Atlantic": the first region that holds for that point. */
function region(d: Draw, draw: (text: string) => void, p: Point = here, prefix = "Over ") {
  const holds = REGIONS.map(([, south, north, west, east]): Condition => ({ all: [latIn(south, north, p), lonIn(west, east, east === 180, p)] }));
  // Each region gives way only to the earlier ones its box overlaps: the rest cannot hold at the same time.
  const overlaps = (a: number, b: number) => {
    const [, s1, n1, w1, e1] = REGIONS[a];
    const [, s2, n2, w2, e2] = REGIONS[b];
    return s1 < n2 && s2 < n1 && w1 < e2 && w2 < e1;
  };
  REGIONS.forEach(([name], i) => {
    const earlier = holds.filter((_, j) => j < i && overlaps(i, j)).map((c) => ({ not: c }));
    d.when(earlier.length ? { all: [holds[i], ...earlier] } : holds[i], () => draw(`${prefix}${name}`));
  });
  d.when({ not: { any: holds } }, () => draw(`${prefix}the ocean`));
}

/** "51.4° N  40.2° W". */
function position(d: Draw, x: number, baseline: number, w: number, size: number) {
  const deg: Format = { num: { d: 1 } };
  const south: Format = { scale: -1, num: { d: 1 } };
  const ns = (north: boolean) => [d.value(here.lat, north ? deg : south), north ? "° N" : "° S"];
  const ew = (east: boolean) => [d.value(here.lon, east ? deg : south), east ? "° E" : "° W"];
  for (const north of [true, false]) {
    for (const east of [true, false]) {
      const holds: Condition = { all: [{ v: here.lat, op: north ? "ge" : "lt", x: 0 }, { v: here.lon, op: east ? "ge" : "lt", x: 0 }] };
      d.when(holds, () => onBaseline(d, [...ns(north), "   ", ...ew(east)], x, baseline, w, size));
    }
  }
}

/**
 * The words beside the globe: whose station, over where, then a row each for
 * how high, how fast, in the sun or not, and where it is going next.
 */
function info(d: Draw, env: Env, box: Box) {
  const u = unitsOf(env);
  const { x, y, w, h } = box;
  const head = Math.max(20, Math.min(36, d.fit(LONGEST.map((t) => t.split(" ").slice(0, 3).join(" ")), w, h * 0.16, { weight: 700, max: 36 })));
  const small = Math.max(13, Math.min(18, Math.round(head * 0.5)));
  const row = Math.max(small + 10, Math.round(small * 1.9));
  const iconS = small + 4;
  const lh = (size: number, weight: 400 | 700 = 400) => d.metrics(size, weight).lineHeight;
  const total = lh(small, 700) + 6 + 2 * lh(head, 700) + lh(small) + 14 + 5 * row;
  let top = y + Math.max(0, Math.round((h - total) / 2));
  d.text("INTERNATIONAL SPACE STATION", { x, y: top, w, h: lh(small, 700), size: small, weight: 700 });
  top += lh(small, 700) + 6;
  const regionTop = top;
  region(d, (text) => d.text(text, { x, y: regionTop, w, h: 2 * lh(head, 700), size: head, weight: 700, wrap: true, lines: 2 }));
  top += 2 * lh(head, 700);
  position(d, x, top + d.metrics(small).ascent, w, small);
  top += lh(small) + 8;
  d.line(x, top, x + w, top, { width: 1 });
  top += 6;
  // A row: an icon, then its words centred beside it.
  const rowAt = (n: number) => top + n * row;
  const icon = (name: string, n: number) => d.icon(name, { x, y: rowAt(n) + Math.round((row - iconS) / 2), w: iconS, h: iconS });
  const words = (content: Parameters<Draw["text"]>[0], n: number) =>
    d.text(content, { x: x + iconS + 10, y: rowAt(n), w: w - iconS - 10, h: row, size: small, valign: "middle" });
  icon("arrow-up", 0);
  words([d.value(ALT, number(u.scale)), ` ${u.alt} above the Earth`], 0);
  icon("gauge", 1);
  words([d.value(VEL, number(u.scale)), ` ${u.vel}`], 1);
  d.when(sunlit, () => { icon("sun", 2); words("In sunlight", 2); });
  d.when({ not: sunlit }, () => { icon("moon", 2); words("In the Earth's shadow", 2); });
  icon("navigation", 3);
  region(d, (text) => words(text, 3), ahead, `In ${AHEAD_MINUTES} min: over `);
  icon("orbit", 4);
  words("Round the Earth every 93 minutes", 4);
}

/** One line: "ISS over the North Atlantic · 431 km". */
function strip(d: Draw, env: Env) {
  const u = unitsOf(env);
  const { width: w, height: h } = d;
  const iconS = Math.min(Math.round(h * 0.8), 48);
  d.icon("iss", { x: 0, y: Math.round((h - iconS) / 2), w: iconS, h: iconS });
  const tx = iconS + 10;
  const size = Math.max(13, Math.min(24, d.fit(LONGEST, w - tx, h * 0.45, { weight: 700, max: 24 })));
  const small = Math.max(13, Math.round(size * 0.75));
  const block = d.metrics(size, 700).lineHeight + d.metrics(small).lineHeight;
  const top = Math.round((h - block) / 2);
  region(d, (text) => onBaseline(d, text, tx, top + d.metrics(size, 700).ascent, w - tx, size, 700));
  onBaseline(d, [d.value(ALT, number(u.scale)), ` ${u.alt} up  ·  `, d.value(VEL, number(u.scale)), ` ${u.vel}`], tx, top + block - d.metrics(small).descent, w - tx, small);
}

function silent(d: Draw) {
  const size = Math.max(14, Math.min(24, d.fit(["The space station isn't answering"], d.width, d.height, { weight: 700, max: 24 })));
  d.when({ not: showing }, () =>
    d.text("The space station isn't answering — it will show when it does", { x: 0, y: 0, w: d.width, h: d.height, size, weight: 700, align: "center", valign: "middle", wrap: true, lines: 3 }));
}

// --------------------------------------------------------------- the widget

function sourcesFor(s: Settings): Record<string, SourceSpec> {
  const every = Math.max(5, Math.min(30, Number(s.every) || 10));
  const out: Record<string, SourceSpec> = {};
  SOURCES.forEach((name, k) => {
    const offsets = Array.from({ length: PER_SOURCE }, (_, n) => (k * PER_SOURCE + n - NOW_INDEX) * STEP);
    const stamps = offsets.map((o) => (o === 0 ? "{{now}}" : o > 0 ? `{{now+${o}}}` : `{{now${o}}}`)).join(",");
    const values: SourceSpec["values"] = {};
    for (let n = 0; n < PER_SOURCE; n++) {
      values[`la${n}`] = `${n}.latitude`;
      values[`lo${n}`] = `${n}.longitude`;
    }
    if (name === NOW.source) {
      values.alt = `${NOW.index}.altitude`;
      values.vel = `${NOW.index}.velocity`;
      values.vis = `${NOW.index}.visibility`;
    }
    out[name] = { url: `${API}/positions?timestamps=${stamps}&units=kilometers`, every, values };
  });
  return out;
}

/** A plausible orbit: inclined 51.64°, over Italy now and climbing north-east. */
function sampleFor(): Record<string, string | number | null> {
  const incl = 51.64 * DEG;
  const n = (2 * Math.PI) / (POINTS * STEP);
  const earth = (2 * Math.PI) / 86164;
  const lat0 = 41 * DEG;
  const u0 = Math.asin(Math.sin(lat0) / Math.sin(incl));
  const node = 12 * DEG - Math.atan2(Math.cos(incl) * Math.sin(u0), Math.cos(u0));
  const out: Record<string, string | number | null> = {};
  for (let i = 0; i < POINTS; i++) {
    const t = (i - NOW_INDEX) * STEP;
    const u = u0 + n * t;
    const lat = Math.asin(Math.sin(incl) * Math.sin(u)) / DEG;
    let lon = (node + Math.atan2(Math.cos(incl) * Math.sin(u), Math.cos(u)) - earth * t) / DEG;
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    const k = pointKeys(i);
    out[k.lat] = Math.round(lat * 1e4) / 1e4;
    out[k.lon] = Math.round(lon * 1e4) / 1e4;
  }
  out[ALT] = 418.7;
  out[VEL] = 27583;
  out[VIS] = "daylight";
  return out;
}

export default defineExtension<Settings>({
  id: "iss",
  name: "Space station",
  description: "Where the International Space Station is right now, on a globe with its whole orbit around it. From wheretheiss.at, no account needed.",
  icon: "satellite",
  category: "data",
  size: { min: [4, 2], default: [12, 8] },
  fields: [
    { key: "every", label: "Look again every", kind: "number", min: 5, max: 30, step: 5, unit: "min", help: "It goes round the Earth in 93 minutes: the orbit on the globe is always the whole of one." },
    { key: "home", label: "Mark your place on the globe", kind: "toggle" },
  ],
  defaults: () => ({ every: 10, home: true }),
  title: () => "Space station",
  refresh: (s) => Math.max(5, Math.min(30, Number(s.every) || 10)),
  source: (s) => sourcesFor(s),
  sample: () => sampleFor(),
  facts: (_s, env) => {
    const place: Place | null = env.place;
    return [
      { key: "lat", label: "Space station's latitude", type: "number", value: here.lat, unit: "°" },
      { key: "lon", label: "Space station's longitude", type: "number", value: here.lon, unit: "°" },
      { key: "sunlit", label: "The space station is in sunlight", type: "flag", test: sunlit },
      ...(place ? [{
        key: "near", label: "The space station is over your part of the world", type: "flag" as const,
        test: { all: [
          { v: here.lat, op: "ge", x: place.latitude - 10 }, { v: here.lat, op: "le", x: place.latitude + 10 },
          { v: here.lon, op: "ge", x: place.longitude - 15 }, { v: here.lon, op: "le", x: place.longitude + 15 },
        ] } as Condition,
      }] : []),
    ];
  },
  draw(d, s, env) {
    const { width: w, height: h } = d;
    silent(d);
    d.when(showing, () => {
      if (h < 140 || w < 160) return strip(d, env);
      // A globe as tall as the box; the words beside it when they fit.
      const side = Math.min(h, w);
      if (w - side >= 220) {
        globe(d, s, env, { x: 0, y: 0, w: side, h: side });
        return info(d, env, { x: side + 12, y: 0, w: w - side - 12, h });
      }
      globe(d, s, env, { x: 0, y: 0, w, h });
    });
  },
});
