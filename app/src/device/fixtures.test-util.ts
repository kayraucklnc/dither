// Shared fakes for the device tests: blobs, app descriptors and a flash-backed session.

import { encodeBlob } from "@/runtime/blob";
import type { Runtime } from "@/runtime/types";
import { APP_DESC_ADDRESS, APP_DESC_MAGIC, APP_DESC_SIZE } from "./appDesc";
import { BOARDS } from "./boards";
import type { DeviceSession, FlashFile, ReadProgress, WriteProgress } from "./session";

export const BOARD = BOARDS["xiao-epaper-75"];

export function makeBlob(project?: Uint8Array): Uint8Array {
  const runtime = { v: 1, board: BOARD.id } as unknown as Omit<Runtime, "assets">;
  return encodeBlob({ runtime, assets: [new Uint8Array([1, 2, 3])], project, builtAt: 1_700_000_000 }).bytes;
}

export const GZIP_PROJECT = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 9, 9, 9, 9, 9, 9, 9]);

export function makeAppDesc(project: string, version: string, magic = APP_DESC_MAGIC): Uint8Array {
  const bytes = new Uint8Array(APP_DESC_SIZE);
  new DataView(bytes.buffer).setUint32(0, magic, true);
  bytes.set(new TextEncoder().encode(version), 16);
  bytes.set(new TextEncoder().encode(project), 48);
  return bytes;
}

export interface FakeSession extends DeviceSession {
  readonly reads: [number, number][];
  readonly writes: FlashFile[][];
  resets: number;
  closes: number;
  failNextRead: Error | null;
}

/** A 4 MB erased flash with optional contents placed at addresses. */
export function fakeSession(contents: FlashFile[] = [], chip = "ESP32-C3"): FakeSession {
  const flash = new Uint8Array(4 * 1024 * 1024).fill(0xff);
  for (const f of contents) flash.set(f.data, f.address);
  const session: FakeSession = {
    port: null,
    chip,
    mac: "aa:bb:cc:dd:ee:ff",
    flashSize: "4MB",
    log: [],
    reads: [],
    writes: [],
    resets: 0,
    closes: 0,
    failNextRead: null,
    async readFlash(address: number, size: number, onProgress?: ReadProgress) {
      if (session.failNextRead) {
        const err = session.failNextRead;
        session.failNextRead = null;
        throw err;
      }
      session.reads.push([address, size]);
      onProgress?.(Math.floor(size / 2), size);
      onProgress?.(size, size);
      return flash.slice(address, address + size);
    },
    async writeFlash(files: readonly FlashFile[], onProgress: WriteProgress) {
      session.writes.push([...files]);
      files.forEach((f, i) => {
        onProgress(i, 0, f.data.length);
        flash.set(f.data, f.address);
        onProgress(i, f.data.length, f.data.length);
      });
    },
    async hardReset() {
      session.resets++;
    },
    async close() {
      session.closes++;
    },
  };
  return session;
}

export const DITHER_DESC: FlashFile = { address: APP_DESC_ADDRESS, data: makeAppDesc("dither", "0.3.1") };
