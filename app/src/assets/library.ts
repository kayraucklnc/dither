// The fonts and icons a project can use. Bytes come from a loader so the same
// code runs in the browser (fetch) and in Node (tests, goldens).

import fontsIndex from "./fonts/fonts.json";
import iconsIndex from "./icons/icons.json";

export type Weight = 400 | 700;

export interface FontInfo {
  id: string;
  weight: Weight;
  size: number;
  file: string;
  lineHeight: number;
  ascent: number;
  descent: number;
}

export const FONTS: readonly FontInfo[] = (fontsIndex as FontInfo[]).map((f) => ({ ...f, weight: f.weight as Weight }));
export const FONT_SIZES: readonly number[] = [...new Set(FONTS.map((f) => f.size))].sort((a, b) => a - b);
export const ICON_SIZES: readonly number[] = iconsIndex.sizes;
export const ICON_NAMES: readonly string[] = iconsIndex.names;

export type Loader = (path: string) => Promise<Uint8Array>;

export function fontInfo(size: number, weight: Weight): FontInfo {
  const exact = FONTS.find((f) => f.size === size && f.weight === weight);
  if (exact) return exact;
  // The largest size that is not larger than asked for, else the smallest.
  const candidates = FONTS.filter((f) => f.weight === weight).sort((a, b) => a.size - b.size);
  return [...candidates].reverse().find((f) => f.size <= size) ?? candidates[0];
}

/** The largest icon size that fits in `box` pixels. */
export function iconSizeFor(box: number): number {
  return [...ICON_SIZES].reverse().find((s) => s <= box) ?? ICON_SIZES[0];
}

export class AssetLibrary {
  private files = new Map<string, Promise<Uint8Array>>();

  constructor(private load: Loader) {}

  private file(path: string): Promise<Uint8Array> {
    let hit = this.files.get(path);
    if (!hit) {
      hit = this.load(path);
      this.files.set(path, hit);
    }
    return hit;
  }

  font(info: FontInfo): Promise<Uint8Array> {
    return this.file(`fonts/${info.file}`);
  }

  async icon(name: string, size: number): Promise<Uint8Array | null> {
    const packs = iconsIndex.packs as unknown as Record<string, { file: string; icons: Record<string, number[]> }>;
    const pack = packs[String(size)];
    const entry = pack?.icons[name];
    if (!pack || !entry) return null;
    const bytes = await this.file(`icons/${pack.file}`);
    return bytes.slice(entry[0], entry[0] + entry[1]);
  }

  /** Everything this library will ever be asked for is known up front; warm it. */
  async preload(): Promise<void> {
    await Promise.all(FONTS.map((f) => this.font(f)));
  }
}
