// Firmware images ship beside the app in public/firmware/, described by
// manifest.json. A merged image is written at 0x0 and checked by sha256.

import { z } from "zod";
import { getBoard, type Board } from "./boards";

export type FirmwareErrorKind = "missing" | "invalid" | "corrupt" | "network";

export class FirmwareError extends Error {
  readonly kind: FirmwareErrorKind;

  constructor(kind: FirmwareErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FirmwareError";
    this.kind = kind;
  }
}

const NOT_BUILT = "Firmware not built yet. Build it, then reload this page.";

const entrySchema = z.object({
  file: z.string().min(1),
  version: z.string().min(1),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  chip: z.string().min(1),
  dataPartition: z.object({ offset: z.number().int().nonnegative(), size: z.number().int().positive() }),
});

const manifestSchema = z.object({ boards: z.record(z.string(), entrySchema) });

export type FirmwareEntry = z.infer<typeof entrySchema>;
export type FirmwareManifest = z.infer<typeof manifestSchema>;

export interface Firmware {
  readonly version: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface LoadOptions {
  /** Defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  /** Defaults to document.baseURI, so the app works from any sub-path. */
  readonly baseUrl?: string;
}

/** Validate a parsed manifest and pick the entry for a board, checked against the registry. */
export function manifestEntry(manifest: unknown, board: Board): FirmwareEntry {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) throw new FirmwareError("invalid", "The firmware list is damaged. Rebuild the firmware.");
  const entry = parsed.data.boards[board.firmwareKey];
  if (!entry) throw new FirmwareError("missing", `${NOT_BUILT} (No firmware for the ${board.short} yet.)`);
  if (entry.chip !== board.chip) {
    throw new FirmwareError("invalid", `The ${board.short} firmware is built for ${entry.chip}, not ${board.chip}.`);
  }
  const { offset, size } = entry.dataPartition;
  if (offset !== board.dataPartition.offset || size !== board.dataPartition.size) {
    throw new FirmwareError("invalid", `The ${board.short} firmware expects a different flash layout than this app.`);
  }
  return entry;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

const isHtml = (res: Response) => (res.headers.get("content-type") ?? "").includes("text/html");

async function get(fetcher: typeof fetch, url: URL): Promise<Response> {
  let res: Response;
  try {
    res = await fetcher(url);
  } catch (err) {
    throw new FirmwareError("network", "Couldn't download the firmware. Check your connection and try again.", {
      cause: err,
    });
  }
  // A dev server answers a missing file with index.html, so HTML means "absent".
  if (res.status === 404 || (res.ok && isHtml(res))) throw new FirmwareError("missing", NOT_BUILT);
  if (!res.ok) throw new FirmwareError("network", `Couldn't download the firmware (HTTP ${res.status}).`);
  return res;
}

async function readManifest(fetcher: typeof fetch, url: URL): Promise<unknown> {
  const res = await get(fetcher, url);
  try {
    return await res.json();
  } catch (err) {
    throw new FirmwareError("invalid", "The firmware list is damaged. Rebuild the firmware.", { cause: err });
  }
}

export async function loadFirmware(boardId: string, options: LoadOptions = {}): Promise<Firmware> {
  const board = getBoard(boardId);
  if (!board) throw new FirmwareError("missing", `Dither doesn't know the board "${boardId}".`);
  const fetcher = options.fetch ?? fetch;
  const manifestUrl = new URL("firmware/manifest.json", options.baseUrl ?? document.baseURI);

  const entry = manifestEntry(await readManifest(fetcher, manifestUrl), board);
  const res = await get(fetcher, new URL(entry.file, manifestUrl));
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length !== entry.size) {
    throw new FirmwareError("corrupt", "The firmware download is incomplete. Reload the page and try again.");
  }
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== entry.sha256.toLowerCase()) {
    throw new FirmwareError("corrupt", "The firmware download is damaged. Reload the page and try again.");
  }
  return { version: entry.version, bytes, sha256 };
}
