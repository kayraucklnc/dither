// A 1-bit framebuffer and the drawing primitives of docs/format.md §4.
// Row-major, most significant bit first, 1 = black — the panel's own layout.

import type { Bitmap } from "./assets";

export interface Clip {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number;
}

export class Framebuffer {
  readonly stride: number;
  readonly bits: Uint8Array;

  constructor(readonly width: number, readonly height: number) {
    this.stride = Math.ceil(width / 8);
    this.bits = new Uint8Array(this.stride * height);
  }

  get(x: number, y: number): boolean {
    return (this.bits[y * this.stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
  }

  set(x: number, y: number, ink: boolean, clip?: Clip): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (clip && (x < clip.x0 || y < clip.y0 || x >= clip.x1 || y >= clip.y1)) return;
    const i = y * this.stride + (x >> 3);
    const bit = 0x80 >> (x & 7);
    this.bits[i] = ink ? this.bits[i] | bit : this.bits[i] & ~bit;
  }
}

// ---------------------------------------------------------------- shapes

function inRoundedRect(px: number, py: number, x: number, y: number, w: number, h: number, r: number): boolean {
  if (px < x || py < y || px >= x + w || py >= y + h) return false;
  if (r <= 0) return true;
  const u = Math.min(px - x, x + w - 1 - px);
  const v = Math.min(py - y, y + h - 1 - py);
  if (u >= r || v >= r) return true;
  const dx = 2 * (r - u) - 1;
  const dy = 2 * (r - v) - 1;
  return dx * dx + dy * dy <= 4 * r * r;
}

const clampRadius = (r: number, w: number, h: number) => Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));

export function fillRect(fb: Framebuffer, x: number, y: number, w: number, h: number, r: number, ink: boolean): void {
  if (w <= 0 || h <= 0) return;
  const rr = clampRadius(r, w, h);
  for (let py = Math.max(0, y); py < Math.min(fb.height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(fb.width, x + w); px++) {
      if (inRoundedRect(px, py, x, y, w, h, rr)) fb.set(px, py, ink);
    }
  }
}

export function strokeRect(fb: Framebuffer, x: number, y: number, w: number, h: number, r: number, s: number, ink: boolean): void {
  if (w <= 0 || h <= 0) return;
  const rr = clampRadius(r, w, h);
  const iw = w - 2 * s;
  const ih = h - 2 * s;
  const ir = clampRadius(Math.max(0, rr - s), iw, ih);
  for (let py = Math.max(0, y); py < Math.min(fb.height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(fb.width, x + w); px++) {
      if (!inRoundedRect(px, py, x, y, w, h, rr)) continue;
      const inner = iw > 0 && ih > 0 && inRoundedRect(px, py, x + s, y + s, iw, ih, ir);
      if (!inner) fb.set(px, py, ink);
    }
  }
}

const inCircle = (dx: number, dy: number, r: number) => r >= 0 && dx * dx + dy * dy <= r * r + r;

export function circle(fb: Framebuffer, cx: number, cy: number, r: number, fill: boolean, s: number, ink: boolean): void {
  if (r < 0) return;
  for (let py = cy - r; py <= cy + r; py++) {
    for (let px = cx - r; px <= cx + r; px++) {
      const dx = px - cx;
      const dy = py - cy;
      if (!inCircle(dx, dy, r)) continue;
      if (!fill && inCircle(dx, dy, r - s)) continue;
      fb.set(px, py, ink);
    }
  }
}

export function line(fb: Framebuffer, x1: number, y1: number, x2: number, y2: number, w: number, ink: boolean): void {
  const k = Math.floor((w - 1) / 2);
  const dx = Math.abs(x2 - x1);
  const sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1);
  const sy = y1 < y2 ? 1 : -1;
  let err = dx + dy;
  let x = x1;
  let y = y1;
  for (;;) {
    for (let yy = y - k; yy < y - k + w; yy++) {
      for (let xx = x - k; xx < x - k + w; xx++) fb.set(xx, yy, ink);
    }
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

export function drawBitmap(fb: Framebuffer, bmp: Bitmap, x: number, y: number, ink: boolean, clip?: Clip): void {
  for (let row = 0; row < bmp.height; row++) {
    const base = bmp.data + row * bmp.stride;
    for (let col = 0; col < bmp.width; col++) {
      const set = (bmp.bytes[base + (col >> 3)] & (0x80 >> (col & 7))) !== 0;
      if (bmp.opaque) fb.set(x + col, y + row, set, clip);
      else if (set) fb.set(x + col, y + row, ink, clip);
    }
  }
}

/** Round half away from zero. */
export function roundAway(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v);
}
