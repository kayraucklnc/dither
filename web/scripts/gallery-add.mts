import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { looksLikeDigest } from "../src/lib/gallery/library";

/**
 * Put pictures in the gallery.
 *
 *   npx tsx --env-file=.env.local scripts/gallery-add.mts <collection> <url|file>...
 *   npx tsx --env-file=.env.local scripts/gallery-add.mts pins ~/Pictures/*.jpg
 *   npx tsx --env-file=.env.local scripts/gallery-add.mts pins --title "Long shadow" <url>
 *
 * Strictly a convenience. A collection is a directory and the gallery reads
 * whatever is in it, so `cp` does the same job - what this adds is the two
 * things `cp` gets wrong. It fetches over http, which is where most of these
 * come from; and it names the file after the picture rather than after
 * whatever hex string a CDN filed it under, because the filename is the
 * caption and "B8c8f0a9d3603be4" is not one.
 *
 * It does not convert anything. Cropping, tone and the dither all happen at
 * render time, at the size of the box being drawn - so the original is the
 * right thing to keep, and a copy re-encoded on the way in is detail thrown
 * away before anyone knew which detail mattered.
 */

const EXTENSIONS: Record<string, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
  avif: ".avif",
  tiff: ".tif",
};

const root = process.env.DITHER_GALLERY_DIR ?? path.join(process.cwd(), ".gallery");

const argv = process.argv.slice(2);
const collection = argv.shift();

/** `--title` names the source that follows it, and nothing else. */
const jobs: { source: string; title?: string }[] = [];
let pending: string | undefined;

for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--title") {
    pending = argv[index + 1];
    index += 1;
    continue;
  }

  jobs.push({ source: argv[index], title: pending });
  pending = undefined;
}

if (!collection || !jobs.length) {
  console.error('Usage: gallery-add.mts <collection> [--title "Name"] <url|file>...');
  console.error(`Pictures land in ${root}/<collection>/`);
  process.exit(1);
}

const slug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .slice(0, 48);

/**
 * A name for a file that arrived without one.
 *
 * The stem of the URL where that is a word, and nothing at all where it is a
 * digest - a caption of "Fa550bec51e6623c" under a photograph is worse than no
 * caption, and the library reads a bare hex stem as "untitled" for exactly
 * this reason.
 */
function nameFor(source: string, given: string | undefined): string {
  if (given) return slug(given);

  const stem = path.basename(source.split("?")[0]).replace(/\.[^.]+$/, "");
  return !stem || looksLikeDigest(stem) ? "" : slug(stem);
}

async function bytesOf(source: string): Promise<Buffer> {
  if (!/^https?:\/\//i.test(source)) return readFile(source);

  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  return Buffer.from(await response.arrayBuffer());
}

const directory = path.join(root, collection);
await mkdir(directory, { recursive: true });

let added = 0;

for (const { source, title } of jobs) {
  try {
    const bytes = await bytesOf(source);
    const meta = await sharp(bytes).metadata();
    const suffix = EXTENSIONS[meta.format ?? ""] ?? "";

    if (!suffix) throw new Error(`not a picture this can read (${meta.format ?? "unknown"})`);

    // A short digest of the *content*, so re-running this on the same list
    // overwrites rather than accumulating copies, and two pictures that happen
    // to share a name stay two pictures.
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 6);
    const stem = nameFor(source, title);
    const file = path.join(directory, `${stem ? `${stem}-` : ""}${digest}${suffix}`);

    await writeFile(file, bytes);
    added += 1;

    const shape = (meta.width ?? 0) >= (meta.height ?? 0) ? "landscape" : "portrait";
    console.log(
      `${path.relative(root, file).padEnd(34)} ${meta.width}x${meta.height} ${shape}  ` +
        `${(bytes.length / 1024).toFixed(0)}k`,
    );
  } catch (error) {
    console.error(`skipped ${source}: ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`\n${added} in ${collection}. They are in the inspector's list already - nothing to restart.`);
