// Rasterize Lucide icons into Dither 1-bit mask bitmaps (DBMP kind 0,
// docs/format.md §3), one pack per pixel size.
//
//   cd tools && npm install && npm run icons
//
// Writes app/src/assets/icons/icons-<size>.pack, icons.json and
// LICENSE-Lucide.txt. Each pack is DBMP assets concatenated, each starting on
// a 4-byte boundary; icons.json gives each one's [offset, length] in its pack.

import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "app/src/assets/icons");
const require = createRequire(import.meta.url);
const lucideDir = path.dirname(require.resolve("lucide-static/package.json"));

const SIZES = [16, 24, 32, 48, 64, 96, 128];

// Stroke width in Lucide's 24-unit space, chosen by eye on thresholded output.
// Stock Lucide is 2, which is 1.33 px at 16 and breaks up once thresholded.
// At 16, 2.5 lands strokes on 1 or 2 px at random; 2.75 gives an even 2 px.
// 24 and 32 take 2.25 (2 px and 3 px); 48 and up keep the stock weight.
const STROKE = { 16: 2.75, 24: 2.25, 32: 2.25, 48: 2, 64: 2, 96: 2, 128: 2 };

// Alpha at or above this is ink (50%).
const THRESHOLD = 128;

// Requested name -> Lucide name, for anything Lucide spells differently. Every
// requested icon currently exists under its own name, so this is empty; it is
// written into icons.json so a consumer can see what was substituted.
const ALIASES = {};

const NAMES = [
  "sun", "moon", "cloud", "cloud-sun", "cloud-moon", "cloud-rain", "cloud-drizzle",
  "cloud-snow", "cloud-lightning", "cloud-fog", "snowflake", "wind", "droplets",
  "umbrella", "thermometer", "sunrise", "sunset", "calendar", "clock", "alarm-clock",
  "train-front", "bus", "tram-front", "bike", "car", "plane", "house", "briefcase",
  "mail", "bell", "battery", "battery-low", "battery-medium", "battery-full",
  "battery-charging", "wifi", "wifi-off", "trending-up", "trending-down", "arrow-up",
  "arrow-down", "bitcoin", "dollar-sign", "euro", "chart-line", "heart", "star",
  "check", "x", "circle-alert", "info", "music", "coffee", "book-open", "quote",
  "gift", "cake", "map-pin", "sparkles",
];

async function loadSvg(name) {
  const lucideName = ALIASES[name] ?? name;
  const file = path.join(lucideDir, "icons", `${lucideName}.svg`);
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`Lucide has no icon "${lucideName}" (for "${name}"): ${error.message}`);
  }
}

// Set the rendered size and pen on the root <svg>; the 24-unit viewBox stays,
// so the drawing scales to exactly size x size at 72 dpi.
function prepareSvg(svg, size) {
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open) throw new Error("not an SVG");
  const tag = open[0]
    .replace(/\swidth="[^"]*"/, ` width="${size}"`)
    .replace(/\sheight="[^"]*"/, ` height="${size}"`)
    .replace(/\sstroke-width="[^"]*"/, ` stroke-width="${STROKE[size]}"`)
    .replace(/\sstroke="currentColor"/, ' stroke="#000"');
  return svg.replace(open[0], tag);
}

async function rasterize(svg, size) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size) {
    throw new Error(`rendered ${info.width}x${info.height}, wanted ${size}x${size}`);
  }
  const stride = Math.ceil(size / 8);
  const rows = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const alpha = data[(y * size + x) * info.channels + info.channels - 1];
      if (alpha >= THRESHOLD) rows[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return rows;
}

function encodeMask(width, height, rows) {
  const header = Buffer.alloc(12);
  header.write("DBMP", 0, "ascii");
  header.writeUInt16LE(width, 4);
  header.writeUInt16LE(height, 6);
  header.writeUInt8(0, 8); // kind 0: mask
  return Buffer.concat([header, rows]);
}

const align4 = (n) => (n + 3) & ~3;

async function buildPack(size) {
  const parts = [];
  const icons = {};
  let offset = 0;
  for (const name of NAMES) {
    const svg = prepareSvg(await loadSvg(name), size);
    const asset = encodeMask(size, size, await rasterize(svg, size));
    icons[name] = [offset, asset.length];
    const padded = align4(asset.length);
    parts.push(asset, Buffer.alloc(padded - asset.length));
    offset += padded;
  }
  const file = `icons-${size}.pack`;
  const pack = Buffer.concat(parts);
  await writeFile(path.join(out, file), pack);
  return { file, icons, bytes: pack.length };
}

async function main() {
  await mkdir(out, { recursive: true });
  for (const entry of await readdir(out)) {
    if (entry.endsWith(".pack")) await rm(path.join(out, entry));
  }
  const lucide = JSON.parse(await readFile(path.join(lucideDir, "package.json"), "utf8"));
  const packs = {};
  for (const size of SIZES) {
    const { bytes, ...pack } = await buildPack(size);
    packs[String(size)] = pack;
    console.log(`icons-${size}.pack  ${NAMES.length} icons  ${bytes} B  stroke ${STROKE[size]}`);
  }
  const manifest = {
    source: `lucide-static@${lucide.version}`,
    sizes: SIZES,
    names: NAMES,
    aliases: ALIASES,
    packs,
  };
  await writeFile(path.join(out, "icons.json"), JSON.stringify(manifest, null, 2) + "\n");
  await copyFile(path.join(lucideDir, "LICENSE"), path.join(out, "LICENSE-Lucide.txt"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
