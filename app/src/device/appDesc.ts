// The firmware's esp_app_desc_t (docs/format.md §8), read straight off flash
// to tell whether Dither is installed and which version.

/** App partition at 0x10000; the descriptor follows the 0x20-byte image header. */
export const APP_DESC_ADDRESS = 0x10000 + 0x20;
export const APP_DESC_SIZE = 256;
export const APP_DESC_MAGIC = 0xabcd5432;
export const DITHER_PROJECT = "dither";

const VERSION_AT = 16;
const PROJECT_AT = 48;
const STRING_SIZE = 32;

export interface FirmwareIdentity {
  readonly project: string;
  readonly version: string;
}

function cString(bytes: Uint8Array, at: number, size: number): string {
  const field = bytes.subarray(at, at + size);
  const end = field.indexOf(0);
  return new TextDecoder().decode(end === -1 ? field : field.subarray(0, end));
}

/** Parse an esp_app_desc_t, or null when the bytes are not one (e.g. erased flash). */
export function parseAppDescriptor(bytes: Uint8Array): FirmwareIdentity | null {
  if (bytes.length < PROJECT_AT + STRING_SIZE) return null;
  const magic = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
  if (magic !== APP_DESC_MAGIC) return null;
  return {
    project: cString(bytes, PROJECT_AT, STRING_SIZE),
    version: cString(bytes, VERSION_AT, STRING_SIZE),
  };
}

export function isDitherFirmware(firmware: FirmwareIdentity | null): boolean {
  return firmware?.project === DITHER_PROJECT;
}
