// A framebuffer as a 1-bit PNG, for looking at renders outside the browser.

import { deflateSync } from "node:zlib";
import type { Framebuffer } from "../src/runtime/framebuffer";

function crc(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

export function toPng(fb: Framebuffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(fb.width, 0);
  ihdr.writeUInt32BE(fb.height, 4);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // greyscale
  const rows = Buffer.alloc((fb.stride + 1) * fb.height);
  for (let y = 0; y < fb.height; y++) {
    rows[y * (fb.stride + 1)] = 0;
    for (let i = 0; i < fb.stride; i++) rows[y * (fb.stride + 1) + 1 + i] = ~fb.bits[y * fb.stride + i] & 0xff; // PNG: 1 = white
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
