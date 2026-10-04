// DFNT fonts and DBMP bitmaps: docs/format.md §3. Read-only views over bytes.

export interface Glyph {
  codepoint: number;
  offset: number;
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  advance: number;
}

export interface Font {
  kind: "font";
  bytes: Uint8Array;
  lineHeight: number;
  ascent: number;
  descent: number;
  glyphs: Map<number, Glyph>;
}

export interface Bitmap {
  kind: "bitmap";
  bytes: Uint8Array;
  width: number;
  height: number;
  opaque: boolean;
  stride: number;
  /** Offset of the first row inside `bytes`. */
  data: number;
}

export type Asset = Font | Bitmap;

function magic(bytes: Uint8Array): string {
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
}

export function decodeFont(bytes: Uint8Array): Font {
  if (magic(bytes) !== "DFNT") throw new Error("Not a DFNT font");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(12, true);
  const glyphs = new Map<number, Glyph>();
  for (let i = 0; i < count; i++) {
    const at = 16 + i * 20;
    const g: Glyph = {
      codepoint: view.getUint32(at, true),
      offset: view.getUint32(at + 4, true),
      width: view.getUint16(at + 8, true),
      height: view.getUint16(at + 10, true),
      xOffset: view.getInt16(at + 12, true),
      yOffset: view.getInt16(at + 14, true),
      advance: view.getUint16(at + 16, true),
    };
    glyphs.set(g.codepoint, g);
  }
  return {
    kind: "font",
    bytes,
    lineHeight: view.getUint16(6, true),
    ascent: view.getInt16(8, true),
    descent: view.getInt16(10, true),
    glyphs,
  };
}

export function decodeBitmap(bytes: Uint8Array): Bitmap {
  if (magic(bytes) !== "DBMP") throw new Error("Not a DBMP bitmap");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(4, true);
  return {
    kind: "bitmap",
    bytes,
    width,
    height: view.getUint16(6, true),
    opaque: bytes[8] === 1,
    stride: Math.ceil(width / 8),
    data: 12,
  };
}

export function decodeAsset(bytes: Uint8Array): Asset {
  const m = magic(bytes);
  if (m === "DFNT") return decodeFont(bytes);
  if (m === "DBMP") return decodeBitmap(bytes);
  throw new Error(`Unknown asset magic ${JSON.stringify(m)}`);
}

export function encodeBitmap(width: number, height: number, opaque: boolean, isInk: (x: number, y: number) => boolean): Uint8Array {
  const stride = Math.ceil(width / 8);
  const out = new Uint8Array(12 + stride * height);
  out.set([0x44, 0x42, 0x4d, 0x50]); // "DBMP"
  const view = new DataView(out.buffer);
  view.setUint16(4, width, true);
  view.setUint16(6, height, true);
  out[8] = opaque ? 1 : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isInk(x, y)) out[12 + y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}
