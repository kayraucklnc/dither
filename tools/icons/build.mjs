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
import { obliqueSvg, KINDS_3D } from "./aircraft3d.mjs";

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
  // An airliner: a slim fuselage, swept wings with an engine under each, a swept tailplane.
  jet: `<path d="M12 1c.8 0 1.2 1 1.2 2.4v6.2l9.2 4.7v1.2l-9.2-1.9-.1 5.2 4.3 2.6v1L12.9 21.5 12 22.8l-.9-1.3-4.5.9v-1l4.3-2.6-.1-5.2-9.2 1.9v-1.2l9.2-4.7V3.4C10.8 2 11.2 1 12 1z"/><rect x="6.3" y="10.6" width="1.8" height="3" rx=".9"/><rect x="15.9" y="10.6" width="1.8" height="3" rx=".9"/>`,
  // A wide-body: a longer, wider fuselage, a longer span, four engines.
  heavy: `<path d="M12 .5c1 0 1.5 1.3 1.5 3.1v5.2l9.9 5.8v1.4l-9.9-2.8-.1 5.6 4.8 2.8v1l-5-1.1L12 23.3l-1.2-1.8-5 1.1v-1l4.8-2.8-.1-5.6-9.9 2.8v-1.4l9.9-5.8V3.6C10.5 1.8 11 .5 12 .5z"/><rect x="7.9" y="9.9" width="1.7" height="2.9" rx=".85"/><rect x="4.9" y="11.6" width="1.7" height="2.7" rx=".85"/><rect x="14.4" y="9.9" width="1.7" height="2.9" rx=".85"/><rect x="17.4" y="11.6" width="1.7" height="2.7" rx=".85"/>`,
  // A light propeller plane: straight wings with rounded tips, a propeller and spinner.
  prop: `<path d="M11 4.4c0-1 .4-1.6 1-1.6s1 .6 1 1.6l-.2 13.2-.3 3.9h-1l-.3-3.9z"/><rect x="1" y="7.2" width="22" height="3.2" rx="1.6"/><rect x="7.4" y="18.4" width="9.2" height="2.2" rx="1.1"/><rect x="7.8" y="1.2" width="8.4" height="1.4" rx=".7"/>`,
  // A helicopter: four rotor blades crossing over the cabin, the tail boom and its rotor.
  heli: `<rect x="11.3" y=".6" width="1.4" height="19.4" rx=".7" transform="rotate(45 12 10.3)"/><rect x="11.3" y=".6" width="1.4" height="19.4" rx=".7" transform="rotate(-45 12 10.3)"/><ellipse cx="12" cy="10.3" rx="3" ry="4.4"/><rect x="11.3" y="13.5" width="1.4" height="8.4" rx=".7"/><rect x="9.4" y="20.6" width="5.2" height="1.4" rx=".7"/>`,
  // A glider: long tapered wings, a slender fuselage, a T tail.
  glider: `<path d="M12 3c.6 0 .9.6.9 1.6l-.1 3.6 10.9.8v1.1l-10.9.9-.3 9.6h-1l-.3-9.6L.3 10.1V9l10.9-.8-.1-3.6C11.1 3.6 11.4 3 12 3z"/><rect x="8.6" y="19.6" width="6.8" height="1.4" rx=".7"/>`,
  // Fast and military: a pointed nose, sharply swept wings, tailplanes.
  fast: `<path d="M12 .8l1 3.4.4 4.3 8.1 7v1.5l-7.9-1.4.6 3 2.8 2.6v1.2l-4.2-1-.8 1.4-.8-1.4-4.2 1v-1.2l2.8-2.6.6-3-7.9 1.4v-1.5l8.1-7 .4-4.3z"/>`,
};
const HEADINGS = Array.from({ length: 16 }, (_, i) => i * 22.5);
const ROTATED = {};
for (const kind of Object.keys(AIRCRAFT)) for (const deg of HEADINGS) ROTATED[`${kind}-${Math.floor(deg)}`] = [kind, deg];
NAMES.push(...Object.keys(ROTATED));
// The same kinds as solid models for the 3D view: "jet-3d-90" is seen side-on.
const MODELLED = {};
for (const kind of KINDS_3D) for (const deg of HEADINGS) MODELLED[`${kind}-3d-${Math.floor(deg)}`] = [kind, deg];
NAMES.push(...Object.keys(MODELLED));

async function loadSvg(name, size) {
  if (name in MODELLED) return obliqueSvg(...MODELLED[name], size);
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
      // Ink is opaque and dark: the 3D aircraft cut white gaps between their parts.
      const i = (y * size + x) * info.channels;
      if (data[i + info.channels - 1] >= THRESHOLD && data[i] < THRESHOLD) rows[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
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
    const svg = prepareSvg(await loadSvg(name, size), size);
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
