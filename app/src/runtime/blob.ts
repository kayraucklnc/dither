// The blob of docs/format.md §1: header, assets, runtime JSON, project.

import type { Runtime } from "./types";

export const MAGIC = "DTHR";
export const VERSION = 1;
export const HEADER_SIZE = 48;

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const align4 = (n: number) => (n + 3) & ~3;

export interface BlobParts {
  /** Runtime JSON with `assets` left empty; offsets are filled in here. */
  runtime: Omit<Runtime, "assets">;
  assets: Uint8Array[];
  project?: Uint8Array;
  builtAt?: number;
}

export interface Blob {
  bytes: Uint8Array;
  runtime: Runtime;
}

export function encodeBlob(parts: BlobParts): Blob {
  const table: [number, number][] = [];
  let at = HEADER_SIZE;
  const assetsOffset = at;
  for (const a of parts.assets) {
    table.push([at, a.length]);
    at = align4(at + a.length);
  }
  const assetsLength = at - assetsOffset;

  const runtime: Runtime = { ...parts.runtime, assets: table };
  const runtimeBytes = new TextEncoder().encode(JSON.stringify(runtime));
  const runtimeOffset = at;
  at = align4(at + runtimeBytes.length);

  const project = parts.project ?? new Uint8Array(0);
  const projectOffset = at;
  at = align4(at + project.length);

  const bytes = new Uint8Array(at);
  parts.assets.forEach((a, i) => bytes.set(a, table[i][0]));
  bytes.set(runtimeBytes, runtimeOffset);
  bytes.set(project, projectOffset);

  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(MAGIC), 0);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, HEADER_SIZE, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(16, runtimeOffset, true);
  view.setUint32(20, runtimeBytes.length, true);
  view.setUint32(24, projectOffset, true);
  view.setUint32(28, project.length, true);
  view.setUint32(32, assetsOffset, true);
  view.setUint32(36, assetsLength, true);
  view.setUint32(40, parts.builtAt ?? Math.floor(Date.now() / 1000), true);
  view.setUint32(12, crc32(bytes.subarray(HEADER_SIZE)), true);
  return { bytes, runtime };
}

export interface Header {
  total: number;
  runtime: [number, number];
  project: [number, number];
  assets: [number, number];
  builtAt: number;
}

/** Read the header alone — enough to know how much more to read off a device. */
export function readHeader(bytes: Uint8Array): Header | null {
  if (bytes.length < HEADER_SIZE) return null;
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_SIZE);
  if (view.getUint16(4, true) !== VERSION || view.getUint16(6, true) !== HEADER_SIZE) return null;
  return {
    total: view.getUint32(8, true),
    runtime: [view.getUint32(16, true), view.getUint32(20, true)],
    project: [view.getUint32(24, true), view.getUint32(28, true)],
    assets: [view.getUint32(32, true), view.getUint32(36, true)],
    builtAt: view.getUint32(40, true),
  };
}

export function decodeBlob(bytes: Uint8Array): Blob & { header: Header; project: Uint8Array } {
  const header = readHeader(bytes);
  if (!header) throw new Error("Not a Dither blob");
  if (header.total > bytes.length) throw new Error("Blob is truncated");
  const body = bytes.subarray(HEADER_SIZE, header.total);
  const crc = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true);
  if (crc32(body) !== crc) throw new Error("Blob checksum does not match");
  const [ro, rl] = header.runtime;
  const runtime = JSON.parse(new TextDecoder().decode(bytes.subarray(ro, ro + rl))) as Runtime;
  const [po, pl] = header.project;
  return { bytes: bytes.subarray(0, header.total), runtime, header, project: bytes.subarray(po, po + pl) };
}
