// A region's coastline as a picture drawn when the project compiles: the land
// is filled with an even stipple and edged with a solid line, the sea left
// white so ships read on it. The rings come from coast.ts, clipped to each
// region's box by tools/coast/build.mjs.

import type { Box } from "../api";
import { shade } from "../stipple";
import { COAST, COAST_GRID } from "./coast";
import { type Bounds, REGIONS, areaOf, boundsOf, contains } from "./regions";

/** A closed ring of [longitude, latitude] points. */
export type Ring = [number, number][];

const DEG = Math.PI / 180;
/** How dark the land is: light enough for a black hull and its name to read on it. */
export const LAND_SHADE = 0.14;

const decoded = new Map<string, Ring[]>();

/** A region's coast, back in degrees; [] for a region the table lacks. */
export function ringsOf(id: string): Ring[] {
  const cached = decoded.get(id);
  if (cached) return cached;
  const region = REGIONS.find((r) => r.id === id);
  const table = COAST[id];
  if (!region || !table) return [];
  const b = boundsOf(region);
  const rings: Ring[] = table.map((deltas) => {
    const ring: Ring = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < deltas.length; i += 2) {
      x += deltas[i];
      y += deltas[i + 1];
      ring.push([b.west + (x / (COAST_GRID - 1)) * (b.east - b.west), b.north - (y / (COAST_GRID - 1)) * (b.north - b.south)]);
    }
    return ring;
  });
  decoded.set(id, rings);
  return rings;
}

/**
 * Rings to draw a coast within these bounds: the region's own, or for a box of
 * one's own the smallest preset that holds it whole. Null when none does.
 */
export function ringsFor(b: Bounds, regionId?: string): Ring[] | null {
  if (regionId && COAST[regionId]) return ringsOf(regionId);
  const holders = REGIONS.filter((r) => contains(boundsOf(r), b)).sort((p, q) => areaOf(boundsOf(p)) - areaOf(boundsOf(q)));
  return holders.length ? ringsOf(holders[0].id) : null;
}

/** The largest box of the bounds' shape on the ground that fits `area`, centred in it. */
export function letterbox(b: Bounds, area: Box): Box {
  const mid = ((b.south + b.north) / 2) * DEG;
  const aspect = ((b.east - b.west) * Math.cos(mid)) / (b.north - b.south);
  let w = area.w;
  let h = Math.round(w / aspect);
  if (h > area.h) {
    h = area.h;
    w = Math.round(h * aspect);
  }
  return { x: area.x + Math.floor((area.w - w) / 2), y: area.y + Math.floor((area.h - h) / 2), w: Math.max(1, w), h: Math.max(1, h) };
}

/** Which pixels of a w × h picture of the bounds are land: even-odd through every ring at each row's centre, so lakes stay water. */
export function landMask(rings: Ring[], b: Bounds, w: number, h: number): Uint8Array {
  const land = new Uint8Array(w * h);
  const sx = w / (b.east - b.west);
  for (let py = 0; py < h; py++) {
    const lat = b.north - ((py + 0.5) / h) * (b.north - b.south);
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - b.west) * sx - 0.5));
      const to = Math.min(w - 1, Math.floor((xs[k + 1] - b.west) * sx - 0.5));
      for (let x = from; x <= to; x++) land[py * w + x] = 1;
    }
  }
  return land;
}

/** The ink for a coast picture: a solid line where land meets water, a light stipple inland. The picture's edge is not a coast. */
export function coastInk(rings: Ring[], b: Bounds, w: number, h: number): (x: number, y: number) => boolean {
  const land = landMask(rings, b, w, h);
  const at = (x: number, y: number) => land[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  return (x, y) => !!land[y * w + x] && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1) || shade(x, y, LAND_SHADE));
}
