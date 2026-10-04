// Asset bytes from disk, for tests and scripts.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AssetLibrary, FONTS } from "./library";
import { decodeFont, type Font } from "@/runtime/assets";

const root = fileURLToPath(new URL(".", import.meta.url));

export const nodeLibrary = new AssetLibrary(async (path) => new Uint8Array(await readFile(`${root}${path}`)));

export async function loadFonts(library: AssetLibrary = nodeLibrary): Promise<Map<string, Font>> {
  const entries = await Promise.all(FONTS.map(async (f) => [f.id, decodeFont(await library.font(f))] as const));
  return new Map(entries);
}
