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

// Aircraft seen from above, nose up, one per kind, each turned to 16
// headings: "jet-0" flies north, "heli-90" east. Names are the heading
// rounded down to a whole degree. Drawn here rather than taken from Lucide,
// whose aircraft are side views or a single airliner.
const AIRCRAFT = {
  // An airliner: swept wings, a tailplane.
  jet: `<path d="M12 1.5c.9 0 1.4 1 1.4 2.4V9l8.6 4.6v2l-8.6-2.4v4.6l2.8 2.2v1.6L12 20.6l-4.2 1v-1.6l2.8-2.2v-4.6L2 15.6v-2L10.6 9V3.9c0-1.4.5-2.4 1.4-2.4z"/>`,
  // A wide-body: a fatter fuselage, longer wings, four engines.
  heavy: `<path d="M12 .8c1.3 0 1.9 1.2 1.9 2.8v4.9l9.6 5.4v2.3l-9.6-2.7v5l3.3 2.4v1.6L12 21.2l-5.2 1.3v-1.6l3.3-2.4v-5L.5 16.2v-2.3l9.6-5.4V3.6C10.1 2 10.7.8 12 .8z"/><rect x="16.2" y="11.6" width="1.6" height="3" rx=".8"/><rect x="19.4" y="13.4" width="1.6" height="2.6" rx=".8"/><rect x="6.2" y="11.6" width="1.6" height="3" rx=".8"/><rect x="3" y="13.4" width="1.6" height="2.6" rx=".8"/>`,
  // A light propeller plane: straight wings, a propeller across the nose.
  prop: `<rect x="11" y="3.5" width="2" height="17" rx="1"/><rect x="2" y="7.5" width="20" height="3.2" rx="1"/><rect x="7.5" y="18" width="9" height="2.4" rx="1"/><rect x="8" y="1.6" width="8" height="1.6" rx=".8"/>`,
  // A helicopter: the rotor as a ring, the cabin, the tail boom and its rotor.
  heli: `<circle cx="12" cy="9.5" r="8" fill="none" stroke="#000" stroke-width="1.6"/><ellipse cx="12" cy="9.5" rx="3.2" ry="4.6"/><rect x="11.2" y="13" width="1.6" height="9" rx=".8"/><rect x="9" y="20.4" width="6" height="1.6" rx=".8"/>`,
  // A glider: long thin wings, a T tail.
  glider: `<rect x="11.2" y="3" width="1.6" height="18" rx=".8"/><rect x=".5" y="8.2" width="23" height="1.8" rx=".9"/><rect x="9" y="19.2" width="6" height="1.5" rx=".75"/>`,
  // Fast and military: a delta.
  fast: `<path d="M12 1l2 6 8 12.5-7.4-1.4L12 22l-2.6-3.9L2 19.5 10 7z"/>`,
};
const HEADINGS = Array.from({ length: 16 }, (_, i) => i * 22.5);
const ROTATED = {};
for (const kind of Object.keys(AIRCRAFT)) for (const deg of HEADINGS) ROTATED[`${kind}-${Math.floor(deg)}`] = [kind, deg];
NAMES.push(...Object.keys(ROTATED));

async function loadSvg(name) {
  if (name in ROTATED) {
    const [kind, deg] = ROTATED[name];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#000" stroke="none" stroke-width="0"><g transform="rotate(${deg} 12 12)">${AIRCRAFT[kind]}</g></svg>`;
  }
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
