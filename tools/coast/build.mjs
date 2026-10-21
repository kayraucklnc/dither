// The coastline of each sea region a ship tracker can watch, as vector rings
// clipped to a box around it, for a chart drawn when a project compiles. From
// GSHHG, the Global Self-consistent Hierarchical High-resolution Geography
// (Wessel and Smith; LGPL v3, LICENSE-GSHHG.txt beside this file), at its full
// resolution: the Bosphorus is a strait here, not a notch. Run by hand; the
// output is committed: cd tools && npm run coast
//
// The archive is 118 MB and is kept in .cache/ after the first run. Each ring
// is quantised to a 4096 × 4096 grid of the region's padded box (its own box
// grown by COAST_PAD of its span each way, so a chart can show around it; x
// east from the west edge, y south from the north edge), simplified, and
// written as deltas, each a zigzag varint, the rings one after another with
// their length first, the whole region as base64.

import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://github.com/GenericMappingTools/gshhg-gmt/releases/download/2.3.7/gshhg-bin-2.3.7.zip";
const GRID = 4096;
/** How far beyond its box a region's coast is kept, as a share of its span each way. */
const PAD = 0.35;
/** Douglas–Peucker tolerance, in grid units: about a pixel on an 800 px chart of the box. */
const TOLERANCE = 3;
/** Islands (and lakes) smaller than this, in grid units squared, are left out: a few pixels on an 800 px chart. The archipelagos hold tens of thousands of skerries. */
const MIN_AREA = 64;
/** The whole table must stay small: it is bundled with the app. */
const MAX_BYTES = 384 * 1024;

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, ".cache");
const regionsFile = path.resolve(here, "../../app/src/extensions/ships/regions.json");
const out = path.resolve(here, "../../app/src/extensions/ships/coast.ts");

const regions = JSON.parse(await readFile(regionsFile, "utf8"));

// The archive, fetched once.
await mkdir(cache, { recursive: true });
const zip = path.join(cache, path.basename(SOURCE));
if (!(await stat(zip).catch(() => null))) {
  console.log(`fetching ${SOURCE}`);
  await writeFile(zip, Buffer.from(await (await fetch(SOURCE)).arrayBuffer()));
}
const bin = execFileSync("unzip", ["-p", zip, "gshhs_f.b"], { maxBuffer: 256 * 1024 * 1024 });
await writeFile(path.join(here, "LICENSE-GSHHG.txt"), execFileSync("unzip", ["-p", zip, "LICENSE.TXT"]));

// Every polygon's header, and where its points are: land (1), lake (2), island
// in a lake (3), pond on it (4); even-odd through them all leaves lakes water.
// Antarctica's two outlines (5, 6) are skipped.
const polygons = [];
for (let pos = 0; pos + 44 <= bin.length; ) {
  const n = bin.readInt32BE(pos + 4);
  const level = bin.readInt32BE(pos + 8) & 255;
  const box = { west: bin.readInt32BE(pos + 12) / 1e6, east: bin.readInt32BE(pos + 16) / 1e6, south: bin.readInt32BE(pos + 20) / 1e6, north: bin.readInt32BE(pos + 24) / 1e6 };
  if (level >= 1 && level <= 4) polygons.push({ n, box, at: pos + 44 });
  pos += 44 + 8 * n;
}
console.log(`${polygons.length} polygons`);

/** Longitudes come 0–360 for polygons that cross Greenwich; every region here sits west of 180°. */
const lon = (micro) => (micro > 180e6 ? micro - 360e6 : micro) / 1e6;
const pointsOf = ({ n, at }) => {
  const ring = new Array(n);
  for (let i = 0; i < n; i++) ring[i] = [lon(bin.readInt32BE(at + 8 * i)), bin.readInt32BE(at + 8 * i + 4) / 1e6];
  return ring;
};
const touches = (p, b) => {
  const west = p.box.west > 180 ? p.box.west - 360 : p.box.west;
  const east = p.box.east > 180 ? p.box.east - 360 : p.box.east;
  // A box given 0–360 that spans Greenwich covers both sides; be generous.
  const crosses = p.box.west <= 180 && p.box.east > 180;
  return (crosses || (east >= b.west && west <= b.east)) && p.box.north >= b.south && p.box.south <= b.north;
};

/** Where the segment p→q crosses the line `axis = v`. */
function cross(p, q, axis, v) {
  const t = (v - p[axis]) / (q[axis] - p[axis]);
  return axis === 0 ? [v, p[1] + t * (q[1] - p[1])] : [p[0] + t * (q[0] - p[0]), v];
}

/** Sutherland–Hodgman: the ring clipped to the box, closed; [] when nothing is inside. */
function clip(ring, b) {
  const planes = [
    [(p) => p[0] >= b.west, (p, q) => cross(p, q, 0, b.west)],
    [(p) => p[0] <= b.east, (p, q) => cross(p, q, 0, b.east)],
    [(p) => p[1] >= b.south, (p, q) => cross(p, q, 1, b.south)],
    [(p) => p[1] <= b.north, (p, q) => cross(p, q, 1, b.north)],
  ];
  let outRing = ring;
  for (const [inside, at] of planes) {
    const input = outRing;
    outRing = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) outRing.push(at(prev, cur));
        outRing.push(cur);
      } else if (inside(prev)) outRing.push(at(prev, cur));
    }
    if (outRing.length < 3) return [];
  }
  return outRing;
}

function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas–Peucker over an open polyline. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let far = tol;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > far) {
        far = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function encodeRegion(region) {
  const [s, w, n, e] = region.box;
  const dLat = (n - s) * PAD;
  const dLon = (e - w) * PAD;
  const b = { south: s - dLat, west: w - dLon, north: n + dLat, east: e + dLon };
  const q = (v) => Math.max(0, Math.min(GRID - 1, Math.round(v)));
  const encoded = [];
  let vertices = 0;
  for (const polygon of polygons) {
    if (!touches(polygon, b)) continue;
    const clipped = clip(pointsOf(polygon), b);
    if (!clipped.length) continue;
    // To the grid; then away with repeats, and with anything a chart could not show.
    const grid = clipped.map(([x, y]) => [q(((x - b.west) / (b.east - b.west)) * (GRID - 1)), q(((b.north - y) / (b.north - b.south)) * (GRID - 1))]);
    const distinct = grid.filter((p, i) => i === 0 || p[0] !== grid[i - 1][0] || p[1] !== grid[i - 1][1]);
    // Closed for simplifying, so the join is held to the same tolerance; then open again.
    const closed = simplify([...distinct, distinct[0]], TOLERANCE);
    closed.pop();
    const area = closed.reduce((sum, [x, y], i) => sum + x * closed[(i + 1) % closed.length][1] - closed[(i + 1) % closed.length][0] * y, 0) / 2;
    if (closed.length < 3 || Math.abs(area) < MIN_AREA) continue;
    const deltas = [closed.length, closed[0][0], closed[0][1]];
    for (let i = 1; i < closed.length; i++) deltas.push(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]);
    encoded.push(...deltas);
    vertices += closed.length;
  }
  return { encoded, vertices };
}

/** Zigzag varints: small deltas of either sign in a byte or two. */
function pack(numbers) {
  const bytes = [];
  for (const n of numbers) {
    let v = n >= 0 ? n * 2 : -n * 2 - 1;
    while (v >= 128) {
      bytes.push((v & 127) | 128);
      v = Math.floor(v / 128);
    }
    bytes.push(v);
  }
  return Buffer.from(bytes).toString("base64");
}

const lines = [];
let total = 0;
for (const region of regions) {
  const { encoded, vertices } = encodeRegion(region);
  const text = `  "${region.id}": "${pack(encoded)}",`;
  lines.push(text);
  total += text.length;
  console.log(`${region.id.padEnd(18)} ${String(vertices).padStart(6)} vertices ${String(text.length).padStart(7)} B`);
}
if (total > MAX_BYTES) throw new Error(`coast.ts would be ${total} B; raise TOLERANCE or shrink a box (limit ${MAX_BYTES})`);

await writeFile(out, `// Generated by tools/coast/build.mjs from GSHHG 2.3.7 (Wessel and Smith, LGPL v3). Do not edit.
// Each region's land as rings on a ${GRID} × ${GRID} grid of its box grown by COAST_PAD of its span
// each way, x east from the west edge and y south from the north edge. Base64 of zigzag varints:
// each ring its length, then x0, y0 and the deltas after. Even-odd: lakes are holes, islands in them land again.

export const COAST_GRID = ${GRID};
export const COAST_PAD = ${PAD};

export const COAST: Record<string, string> = {
${lines.join("\n")}
};
`);
console.log(`coast.ts  ${total} B`);
