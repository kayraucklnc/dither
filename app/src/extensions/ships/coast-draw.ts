// A region's coastline as a picture drawn when the project compiles: the land
// is filled with an even stipple and edged with a solid line, the sea left
// white so ships read on it. The rings come from coast.ts, clipped to each
// region's box by tools/coast/build.mjs.

import type { Box } from "../api";
import { shade } from "../stipple";
import { COAST, COAST_GRID, COAST_PAD } from "./coast";
import { type Bounds, REGIONS, areaOf, boundsOf, contains } from "./regions";

/** A closed ring of [longitude, latitude] points. */
export type Ring = [number, number][];

const DEG = Math.PI / 180;
/** How dark the land is inland: light enough for a black hull and its name to read on it. */
export const LAND_SHADE = 0.12;
/** The shore band just inside the coastline, darker, as a chart shades it. */
export const SHORE_SHADE = 0.45;
/** How wide that band is, in pixels. */
const SHORE_PX = 3;

/** The box a region's coast is kept for: its own, grown by COAST_PAD of its span each way, so a chart can show around it. */
export function paddedBounds(b: Bounds): Bounds {
  const dLat = (b.north - b.south) * COAST_PAD;
  const dLon = (b.east - b.west) * COAST_PAD;
  return { south: b.south - dLat, west: b.west - dLon, north: b.north + dLat, east: b.east + dLon };
}

/** The bounds grown by a share of their span each way, within `limit`: room around the waters, so nothing at their edge sits under the chart's furniture. */
export function grown(b: Bounds, share: number, limit: Bounds): Bounds {
  const dLat = (b.north - b.south) * share;
  const dLon = (b.east - b.west) * share;
  return { south: Math.max(limit.south, b.south - dLat), west: Math.max(limit.west, b.west - dLon), north: Math.min(limit.north, b.north + dLat), east: Math.min(limit.east, b.east + dLon) };
}

/** The bounds grown about their centre to the chart's shape on the ground, as far as `limit` allows; what is left over is letterboxed. */
export function expandTo(b: Bounds, aspect: number, limit: Bounds): Bounds {
  const mid = ((b.south + b.north) / 2) * DEG;
  const cosMid = Math.cos(mid);
  const own = ((b.east - b.west) * cosMid) / (b.north - b.south);
  let { south, west, north, east } = b;
  if (aspect > own) {
    // Wider than the box: more longitude, up to the limit.
    const want = ((north - south) * aspect) / cosMid;
    const half = Math.min(want, limit.east - limit.west) / 2;
    const centre = (west + east) / 2;
    west = Math.max(limit.west, centre - half);
    east = Math.min(limit.east, centre + half);
  } else if (aspect < own) {
    const want = ((east - west) * cosMid) / aspect;
    const half = Math.min(want, limit.north - limit.south) / 2;
    const centre = (south + north) / 2;
    south = Math.max(limit.south, centre - half);
    north = Math.min(limit.north, centre + half);
  }
  return { south, west, north, east };
}

const decoded = new Map<string, Ring[]>();

/** A region's coast, back in degrees; [] for a region the table lacks. */
export function ringsOf(id: string): Ring[] {
  const cached = decoded.get(id);
  if (cached) return cached;
  const region = REGIONS.find((r) => r.id === id);
  const table = COAST[id];
  if (!region || !table) return [];
  const b = paddedBounds(boundsOf(region));
  const numbers = unpack(table);
  const rings: Ring[] = [];
  for (let at = 0; at < numbers.length; ) {
    const n = numbers[at++];
    const ring: Ring = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      x += numbers[at++];
      y += numbers[at++];
      ring.push([b.west + (x / (COAST_GRID - 1)) * (b.east - b.west), b.north - (y / (COAST_GRID - 1)) * (b.north - b.south)]);
    }
    rings.push(ring);
  }
  decoded.set(id, rings);
  return rings;
}

/** Base64 of zigzag varints back to numbers. */
export function unpack(text: string): number[] {
  const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  const out: number[] = [];
  let v = 0;
  let shift = 0;
  for (const byte of bytes) {
    v += (byte & 127) * 2 ** shift;
    if (byte & 128) shift += 7;
    else {
      out.push(v % 2 === 0 ? v / 2 : -(v + 1) / 2);
      v = 0;
      shift = 0;
    }
  }
  return out;
}

const overlaps = (a: Bounds, b: Bounds): boolean => a.south < b.north && b.south < a.north && a.west < b.east && b.west < a.east;

/**
 * The coasts to draw within these bounds, one set of rings per region: the
 * region's own; for a box of one's own, the smallest preset that holds it
 * whole, or failing that every preset it overlaps. Each set is clipped to its
 * own region, so they are filled separately and laid over one another, never
 * through one another. Empty when no preset comes near.
 */
export function ringsFor(b: Bounds, regionId?: string): Ring[][] {
  const region = regionId ? REGIONS.find((r) => r.id === regionId) : undefined;
  if (region && COAST[region.id] && contains(paddedBounds(boundsOf(region)), b)) return [ringsOf(region.id)];
  const holders = REGIONS.filter((r) => contains(paddedBounds(boundsOf(r)), b)).sort((p, q) => areaOf(boundsOf(p)) - areaOf(boundsOf(q)));
  if (holders.length) return [ringsOf(holders[0].id)];
  return REGIONS.filter((r) => overlaps(paddedBounds(boundsOf(r)), b)).map((r) => ringsOf(r.id)).filter((rings) => rings.length);
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
export function landMask(ringSets: Ring[][], b: Bounds, w: number, h: number): Uint8Array {
  const land = new Uint8Array(w * h);
  for (const rings of ringSets) fillLand(rings, b, w, h, land);
  return land;
}

function fillLand(rings: Ring[], b: Bounds, w: number, h: number, land: Uint8Array): void {
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
}

/** Land with its outermost pixels taken off: what is left is at least a pixel farther from the water. The picture's edge is not a coast. */
function eroded(land: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const at = (x: number, y: number) => land[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (land[y * w + x] && at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)) out[y * w + x] = 1;
  return out;
}

/**
 * The ink for a coast picture, as a chart shades it: a solid line where land
 * meets water, a darker band along the shore, a light stipple inland.
 */
export function coastInk(ringSets: Ring[][], b: Bounds, w: number, h: number): (x: number, y: number) => boolean {
  const land = landMask(ringSets, b, w, h);
  const inland = eroded(land, w, h);
  let interior = inland;
  for (let i = 1; i < SHORE_PX; i++) interior = eroded(interior, w, h);
  return (x, y) => {
    const i = y * w + x;
    if (!land[i]) return false;
    if (!inland[i]) return true;
    return shade(x, y, interior[i] ? LAND_SHADE : SHORE_SHADE);
  };
}
