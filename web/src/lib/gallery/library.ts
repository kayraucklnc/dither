import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * The pictures this installation can put on a wall.
 *
 * One directory, named by `DITHER_GALLERY_DIR`, and everything under it. Each
 * folder in it is a collection; anything sitting loose is a collection too,
 * called `loose`, because "drop a jpeg in and it appears" has to work before
 * anyone has thought about how to file it.
 *
 * There is no database row for a collection, no "new album" button and no
 * upload endpoint - the same bargain the extension format makes everywhere
 * else. It is also outside the repository, deliberately: photographs are not
 * source, and nothing here ships pictures of its own. An installation with an
 * empty folder has an empty gallery, and the extension says so rather than
 * inventing something to show.
 */

export interface Collection {
  /** A folder name, or `loose`. The first step of every picture's id. */
  id: string;
  label: string;
  count: number;
}

export const ORIENTATIONS = ["any", "landscape", "portrait", "square"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export interface Picture {
  /** `<collection>/<file>`. Never a path; see `resolve`. */
  id: string;
  file: string;
  collection: string;
  /** What a caption would say. Empty when the filename says nothing. */
  title: string;
  modifiedAt: number;
  width: number;
  height: number;
  /** Never `any`; that is only ever a question, not an answer. */
  orientation: Exclude<Orientation, "any">;
}

const READABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".tif", ".tiff"]);

/** Files a directory picks up on its own and nobody meant to hang. */
const IGNORED = /^(\.|__MACOSX)/;

/** The one collection that is not a folder: whatever is loose at the top. */
const LOOSE = "loose";

export function root(): string {
  return process.env.DITHER_GALLERY_DIR ?? path.join(process.cwd(), ".gallery");
}

/**
 * Whether a word is a hash rather than a name.
 *
 * Hex and at least six of it, *and* with a digit somewhere in it. The digit is
 * the whole discrimination: "decade" and "effaced" are hex from end to end and
 * are perfectly good names for a picture, while a digest that happened to draw
 * six letters out of sixteen is a one-in-three-hundred event.
 */
export function looksLikeDigest(word: string): boolean {
  return /^[0-9a-f]{6,}$/i.test(word) && /\d/.test(word);
}

/**
 * A filename as a caption.
 *
 * `dunes.png` is "Dunes" and `long-shadow-4f21ab.jpg` is "Long shadow": the
 * import script appends a short digest of the source to keep two files of the
 * same name apart, and that digest is a filing detail rather than something to
 * print under a picture. A name that is *nothing but* a digest - which is what
 * you get saving straight out of a browser - captions nothing at all, because
 * "B8c8f0a9d3603be4" under a photograph is worse than white space.
 */
export function titleOf(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const named = stem.replace(/[-_][0-9a-f]{6,}$/i, "");

  if (!named || looksLikeDigest(named)) return "";

  const words = named.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "noir" as "Noir", "city-nights" as "City nights". */
function label(directory: string): string {
  const words = directory.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const isPicture = (name: string) =>
  !IGNORED.test(name) && READABLE.has(path.extname(name).toLowerCase());

/**
 * How big a picture is, remembered for as long as the file has not moved.
 *
 * Shape is worth knowing about every picture in the folder, because a
 * widescreen panel showing a rotation of phone wallpapers is a widescreen panel
 * showing crops - and the fix is to be able to say "only the landscape ones",
 * which means every listing has to know. Reading it is a header read rather
 * than a decode, and the answer cannot change without the file changing, so it
 * is kept against the modification time and never asked twice.
 */
const measured = new Map<string, { width: number; height: number }>();

async function measure(file: string, modifiedAt: number) {
  const key = `${file}|${modifiedAt}`;
  const held = measured.get(key);
  if (held) return held;

  let size = { width: 0, height: 0 };
  try {
    const meta = await sharp(file).metadata();
    // EXIF orientations 5 to 8 are quarter turns, and sharp reports the stored
    // pixels rather than the upright ones - so a phone photograph taken
    // sideways would be filed as landscape and cropped as one.
    const turned = (meta.orientation ?? 1) >= 5;
    size = {
      width: turned ? (meta.height ?? 0) : (meta.width ?? 0),
      height: turned ? (meta.width ?? 0) : (meta.height ?? 0),
    };
  } catch {
    // Something unreadable is still listed - the renderer says so far better
    // than a listing that silently drops it.
  }

  measured.set(key, size);
  return size;
}

/** Within a twentieth either way of square counts as square. */
function orientationOf(width: number, height: number): Exclude<Orientation, "any"> {
  if (!width || !height) return "landscape";

  const ratio = width / height;
  if (ratio > 1.05) return "landscape";
  if (ratio < 0.95) return "portrait";
  return "square";
}

async function listDirectory(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isPicture(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    // A root that does not exist is the normal state of `yours` until somebody
    // puts something in it, not a fault worth reporting.
    return [];
  }
}

/**
 * Every collection, in every root.
 *
 * Cached for a few seconds rather than for the life of the process: a settings
 * form that will not show the folder you just made is indistinguishable from a
 * broken one, and re-reading two directories is nothing.
 */
const FRESH_FOR = 5_000;
let listing: { at: number; collections: Collection[] } | undefined;

export async function collections(now = Date.now()): Promise<Collection[]> {
  if (listing && now - listing.at < FRESH_FOR) return listing.collections;

  const base = root();
  const found: Collection[] = [];

  const loose = await listDirectory(base);
  if (loose.length) found.push({ id: LOOSE, label: "Loose", count: loose.length });

  let entries: string[] = [];
  try {
    entries = (await readdir(base, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !IGNORED.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    // A gallery folder that does not exist yet is the state every new
    // installation is in, not a fault worth reporting from here.
    entries = [];
  }

  for (const entry of entries) {
    const count = (await listDirectory(path.join(base, entry))).length;
    if (!count) continue;

    found.push({ id: entry, label: label(entry), count });
  }

  listing = { at: now, collections: found };
  return found;
}

/** Where a collection id points on disk, or nowhere if it points outside the root. */
function directoryOf(collectionId: string): string | undefined {
  if (collectionId === LOOSE) return root();

  // One step, and a real name: a collection is a folder in the gallery, not a
  // tree and not a way to name somewhere else on the disk.
  if (!/^[^/\\]+$/.test(collectionId) || collectionId === "." || collectionId === "..") {
    return undefined;
  }

  return path.join(root(), collectionId);
}

/** The pictures in one collection, or in all of them when none is named. */
export async function pictures(collectionId?: string): Promise<Picture[]> {
  const wanted = collectionId
    ? (await collections()).filter((one) => one.id === collectionId)
    : await collections();

  const found: Picture[] = [];

  for (const collection of wanted) {
    const directory = directoryOf(collection.id);
    if (!directory) continue;

    for (const name of await listDirectory(directory)) {
      const file = path.join(directory, name);
      let modifiedAt = 0;

      try {
        modifiedAt = (await stat(file)).mtimeMs;
      } catch {
        continue;
      }

      const { width, height } = await measure(file, modifiedAt);

      found.push({
        id: `${collection.id}/${name}`,
        file,
        collection: collection.id,
        title: titleOf(name),
        modifiedAt,
        width,
        height,
        orientation: orientationOf(width, height),
      });
    }
  }

  return found;
}

/**
 * The file behind a picture id.
 *
 * Every id that reaches this comes out of a widget's stored settings or a
 * template, both of which are ours - but "ours" is exactly the assumption that
 * makes a traversal bug, so the resolved path is checked to be inside the root
 * it claims rather than trusted to be.
 */
export async function resolve(id: string): Promise<Picture | undefined> {
  const steps = id.split("/");
  if (steps.length !== 2) return undefined;

  const [collectionId, name] = steps;
  if (!isPicture(name)) return undefined;

  const directory = directoryOf(collectionId);
  if (!directory) return undefined;

  const file = path.join(directory, name);
  if (path.dirname(path.resolve(file)) !== path.resolve(directory)) return undefined;

  try {
    const info = await stat(file);
    if (!info.isFile()) return undefined;

    const { width, height } = await measure(file, info.mtimeMs);

    return {
      id,
      file,
      collection: collectionId,
      title: titleOf(name),
      modifiedAt: info.mtimeMs,
      width,
      height,
      orientation: orientationOf(width, height),
    };
  } catch {
    return undefined;
  }
}
