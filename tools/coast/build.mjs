// The coastline of each sea region a ship tracker can watch, as vector rings
// clipped to its box, for a chart drawn when a project compiles. From Natural
// Earth's 1:10m land, which is in the public domain. Run by hand; the output
// is committed: cd tools && npm run coast
//
// Each ring is quantised to a 4096 × 4096 grid of its box (x east from the
// west edge, y south from the north edge), simplified, and written as deltas:
// [x0, y0, dx1, dy1, …]. A grid unit is a fifth of a pixel on the widest chart
// a panel can show, so nothing is lost that could be drawn.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_land.geojson";
const GRID = 4096;
/** Douglas–Peucker tolerance, in grid units: half a pixel on an 800 px chart. */
const TOLERANCE = 2.5;
/** The whole table must stay small: it is bundled with the app. */
const MAX_BYTES = 150 * 1024;

const here = path.dirname(fileURLToPath(import.meta.url));
const regionsFile = path.resolve(here, "../../app/src/extensions/ships/regions.json");
const out = path.resolve(here, "../../app/src/extensions/ships/coast.ts");

const regions = JSON.parse(await readFile(regionsFile, "utf8"));
const geo = await (await fetch(SOURCE)).json();
const rings = [];
for (const f of geo.features) {
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  for (const poly of polys) for (const ring of poly) rings.push(ring);
}

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
  const [south, west, north, east] = region.box;
  const b = { south, west, north, east };
  const q = (n) => Math.max(0, Math.min(GRID - 1, Math.round(n)));
  const encoded = [];
  let vertices = 0;
  for (const ring of rings) {
    const clipped = clip(ring, b);
    if (!clipped.length) continue;
    // To the grid; then away with repeats, and with anything a chart could not show.
    const grid = clipped.map(([lon, lat]) => [q(((lon - west) / (east - west)) * (GRID - 1)), q(((north - lat) / (north - south)) * (GRID - 1))]);
    const distinct = grid.filter((p, i) => i === 0 || p[0] !== grid[i - 1][0] || p[1] !== grid[i - 1][1]);
    // Closed for simplifying, so the join is held to the same tolerance; then open again.
    const closed = simplify([...distinct, distinct[0]], TOLERANCE);
    closed.pop();
    const area = closed.reduce((sum, [x, y], i) => sum + x * closed[(i + 1) % closed.length][1] - closed[(i + 1) % closed.length][0] * y, 0) / 2;
    if (closed.length < 3 || Math.abs(area) < TOLERANCE * TOLERANCE) continue;
    const deltas = [closed[0][0], closed[0][1]];
    for (let i = 1; i < closed.length; i++) deltas.push(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]);
    encoded.push(deltas);
    vertices += closed.length;
  }
  return { encoded, vertices };
}

const lines = [];
let total = 0;
for (const region of regions) {
  const { encoded, vertices } = encodeRegion(region);
  const text = `  "${region.id}": [${encoded.map((r) => `[${r.join(",")}]`).join(",")}],`;
  lines.push(text);
  total += text.length;
  console.log(`${region.id.padEnd(18)} ${String(encoded.length).padStart(4)} rings ${String(vertices).padStart(6)} vertices ${String(text.length).padStart(7)} B`);
}
if (total > MAX_BYTES) throw new Error(`coast.ts would be ${total} B; raise TOLERANCE or shrink a box (limit ${MAX_BYTES})`);

await writeFile(out, `// Generated by tools/coast/build.mjs from Natural Earth 1:10m land (public domain). Do not edit.
// Each region's land as rings on a ${GRID} × ${GRID} grid of its box, x east from its west edge
// and y south from its north edge: [x0, y0, dx1, dy1, …]. Even-odd: holes are lakes.

export const COAST_GRID = ${GRID};

export const COAST: Record<string, number[][]> = {
${lines.join("\n")}
};
`);
console.log(`coast.ts  ${total} B`);
