// The decisions behind reading and flashing a panel, kept free of I/O.

import { readHeader, type Header } from "@/runtime/blob";
import type { Board, FlashRegion } from "./boards";
import { DeviceError } from "./errors";
import type { FlashFile } from "./session";

export type FlashStage = "firmware" | "settings" | "restarting";

export interface FlashPlan {
  readonly files: readonly FlashFile[];
  /** stages[i] names files[i] in progress reports. */
  readonly stages: readonly FlashStage[];
}

const GZIP_MAGIC = [0x1f, 0x8b] as const;

const kb = (bytes: number) => Math.ceil(bytes / 1024).toLocaleString("en-US");

/** A blob header read off a partition, or null when there is no usable blob there. */
export function parseBlobHeader(bytes: Uint8Array, partition: FlashRegion): Header | null {
  const header = readHeader(bytes);
  if (!header || header.total > partition.size) return null;
  const [offset, length] = header.project;
  if (offset + length > header.total) return null;
  return header;
}

/** Where the project section sits inside the blob, or null when it has none. */
export function projectRange(header: Header): { offset: number; length: number } | null {
  const [offset, length] = header.project;
  return length > 0 ? { offset, length } : null;
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

export function checkBlob(blob: Uint8Array, board: Board): void {
  const header = readHeader(blob);
  if (!header || header.total !== blob.length) {
    throw new DeviceError("io", "These screens didn't compile correctly. Reload the page and try again.");
  }
  if (blob.length > board.dataPartition.size) {
    throw new DeviceError(
      "too-big",
      `These screens need ${kb(blob.length)} KB, but the ${board.short} has room for ${kb(board.dataPartition.size)} KB. Remove a picture or a font and try again.`,
    );
  }
}

export function checkFirmware(firmware: Uint8Array, board: Board, chip: string): void {
  if (chip !== board.chip) {
    throw new DeviceError(
      "unsupported",
      `This board has an ${chip}, but the ${board.short} firmware needs an ${board.chip}. Check that you picked the right panel.`,
    );
  }
  if (firmware.length === 0 || firmware.length > board.dataPartition.offset) {
    throw new DeviceError("too-big", "This firmware doesn't fit on the panel. Rebuild the firmware.");
  }
}

export function planFlash(input: { firmware?: Uint8Array; blob: Uint8Array }, board: Board): FlashPlan {
  const blob: FlashFile = { data: input.blob, address: board.dataPartition.offset };
  if (!input.firmware) return { files: [blob], stages: ["settings"] };
  return { files: [{ data: input.firmware, address: 0 }, blob], stages: ["firmware", "settings"] };
}
