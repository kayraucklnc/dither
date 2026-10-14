// Maps for the panel, drawn from OpenStreetMap's tiles when the project
// compiles. A photo of a map dithered to 1 bit is noise, so this reads the
// tiles by colour instead: motorways and trunk roads become lines, water a
// sparse dot pattern with its shore drawn. Everything else stays white, so
// whatever is drawn on top still reads.

import type { MapArea } from "@/extensions/api";
import { encodeBitmap } from "@/runtime/assets";

const TILE = 256;
const TILES = "https://tile.openstreetmap.org";
const MAX_ZOOM = 13;

/** OSM Carto's colours, and how far a pixel may stray from them. */
const MOTORWAY = [232, 146, 162];
const TRUNK = [249, 178, 156];
const WATER = [170, 211, 223];

const maps = new Map<string, Promise<Uint8Array | null>>();
const tiles = new Map<string, Promise<ImageBitmap>>();

function mercator(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = TILE * 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n };
}

function tile(z: number, x: number, y: number): Promise<ImageBitmap> {
  const url = `${TILES}/${z}/${x}/${y}.png`;
  let hit = tiles.get(url);
  if (!hit) {
    hit = fetch(url, { credentials: "omit" }).then((r) => {
      if (!r.ok) throw new Error(`OpenStreetMap answered ${r.status}`);
      return r.blob();
    }).then((b) => createImageBitmap(b));
    hit.catch(() => tiles.delete(url));
    tiles.set(url, hit);
  }
  return hit;
}

const near = (data: Uint8ClampedArray, i: number, c: number[], d: number) =>
  Math.abs(data[i] - c[0]) <= d && Math.abs(data[i + 1] - c[1]) <= d && Math.abs(data[i + 2] - c[2]) <= d;

async function draw(area: MapArea, w: number, h: number): Promise<Uint8Array | null> {
  // Enough detail that thin roads survive the shrink, without fetching a city's worth of tiles.
  let zoom = 1;
  while (zoom < MAX_ZOOM && mercator(area.south, area.east, zoom).x - mercator(area.north, area.west, zoom).x < w * 1.4) zoom++;
  const a = mercator(area.north, area.west, zoom);
  const b = mercator(area.south, area.east, zoom);
  const [tx0, ty0, tx1, ty1] = [Math.floor(a.x / TILE), Math.floor(a.y / TILE), Math.floor(b.x / TILE), Math.floor(b.y / TILE)];
  const sw = Math.max(1, Math.round(b.x - a.x));
  const sh = Math.max(1, Math.round(b.y - a.y));
  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const jobs: Promise<void>[] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      jobs.push(tile(zoom, tx, ty).then((img) => ctx.drawImage(img, tx * TILE - a.x, ty * TILE - a.y)));
    }
  }
  await Promise.all(jobs);
  return classify(ctx.getImageData(0, 0, sw, sh).data, sw, sh, w, h);
}

/** Tile pixels (RGBA, sw × sh) to a 1-bit map of w × h: roads as lines, water dotted inside its shore. */
export function classify(data: Uint8ClampedArray, sw: number, sh: number, w: number, h: number): Uint8Array {
  // What each panel pixel covers: the share of road and of water beneath it.
  const road = new Float32Array(w * h);
  const water = new Float32Array(w * h);
  const count = new Float32Array(w * h);
  for (let y = 0; y < sh; y++) {
    const py = Math.min(h - 1, Math.floor((y * h) / sh));
    for (let x = 0; x < sw; x++) {
      const p = py * w + Math.min(w - 1, Math.floor((x * w) / sw));
      const i = (y * sw + x) * 4;
      count[p]++;
      if (near(data, i, MOTORWAY, 20) || near(data, i, TRUNK, 16)) road[p]++;
      if (near(data, i, WATER, 10)) water[p]++;
    }
  }
  const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && water[y * w + x] > count[y * w + x] / 2;
  return encodeBitmap(w, h, false, (x, y) => {
    const p = y * w + x;
    if (count[p] && road[p] / count[p] > 0.2) return true;
    if (!wet(x, y)) return false;
    // The shore as a line, open water as a light dot pattern.
    if (!(wet(x - 1, y) && wet(x + 1, y) && wet(x, y - 1) && wet(x, y + 1))) return true;
    return x % 4 === 0 && y % 4 === 0;
  });
}

export function browserBasemap(area: MapArea, w: number, h: number): Promise<Uint8Array | null> {
  const key = `${area.north},${area.south},${area.west},${area.east}:${w}x${h}`;
  let hit = maps.get(key);
  if (!hit) {
    hit = draw(area, w, h).catch(() => null);
    // A failed fetch is tried again on the next compile.
    hit.then((m) => { if (!m) maps.delete(key); });
    maps.set(key, hit);
  }
  return hit;
}
