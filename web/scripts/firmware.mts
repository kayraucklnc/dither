/*
 * Bring built firmware images over from a trmnl-firmware checkout.
 *
 * The flasher on /devices/new writes whatever is in web/public/downloads at
 * offset zero, which means it needs *merged* images - bootloader, partition
 * table and application in one file, each already sitting at the offset the
 * chip expects inside it. PlatformIO leaves those in .pio/build/<env>/ next to
 * a bare firmware.bin that looks exactly as plausible and bricks the board.
 * Telling them apart by hand is a coin flip on a filename, so this does not:
 * every candidate is opened and checked before it is copied.
 *
 *   npx tsx scripts/firmware.mts                     # ~/Projects/trmnl-firmware
 *   npx tsx scripts/firmware.mts ../../trmnl-firmware
 *   TRMNL_FIRMWARE_DIR=/somewhere npx tsx scripts/firmware.mts
 *
 * It does not build anything. Building wants the firmware repo's own toolchain
 * and takes minutes; this takes a second and is the step you repeat.
 */

import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DOWNLOADS = path.join(process.cwd(), "public", "downloads");

const firmwareDir = path.resolve(
  process.argv[2] ??
    process.env.TRMNL_FIRMWARE_DIR ??
    path.join(os.homedir(), "Projects", "trmnl-firmware"),
);

/* -- what makes an image flashable at offset zero --------------------------- */

/** First byte of an ESP32 image header. */
const IMAGE_MAGIC = 0xe9;
/** First two bytes of a partition table entry. */
const PARTITION_MAGIC = [0xaa, 0x50];
/** Where the partition table lives on every ESP32 this firmware targets. */
const PARTITION_OFFSET = 0x8000;

/**
 * Whether this file can be written at address 0.
 *
 * The bootloader sits at 0x0 on an ESP32-S3, C3 or C6 and at 0x1000 on a
 * classic ESP32, so both are accepted; what is not negotiable is the partition
 * table at 0x8000. A bare firmware.bin has the image magic at byte zero and
 * nothing at 0x8000 - which is exactly why "starts with 0xE9" is not the test.
 */
function isMerged(bytes: Buffer): string | undefined {
  if (bytes.length < PARTITION_OFFSET + 2) return "too small to hold a partition table";

  const boot =
    bytes[0x0] === IMAGE_MAGIC ? 0x0 : bytes[0x1000] === IMAGE_MAGIC ? 0x1000 : undefined;

  if (boot === undefined) return "no bootloader at 0x0 or 0x1000";

  if (bytes[PARTITION_OFFSET] !== PARTITION_MAGIC[0] || bytes[PARTITION_OFFSET + 1] !== PARTITION_MAGIC[1]) {
    return "no partition table at 0x8000 — this looks like a bare firmware.bin";
  }

  return undefined;
}

/* -- finding the candidates -------------------------------------------------- */

const version = async (): Promise<string> => {
  try {
    const config = await readFile(path.join(firmwareDir, "include", "config.h"), "utf8");
    const part = (name: string) =>
      new RegExp(`#define\\s+FW_${name}_VERSION\\s+(\\d+)`).exec(config)?.[1];

    const parts = ["MAJOR", "MINOR", "PATCH"].map(part);
    return parts.every(Boolean) ? parts.join(".") : "";
  } catch {
    return "";
  }
};

const listing = async (directory: string) => {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
};

interface Candidate {
  board: string;
  file: string;
}

/**
 * Every image a build or a release left behind, by board.
 *
 * `prepare_release.sh` writes `.pio/release/<env>/flash/FW<version>.bin`, and a
 * plain `pio run` leaves `merged_firmware.bin` beside the build. Neither name is
 * a promise about the contents, so both are only candidates here.
 */
async function candidates(): Promise<Candidate[]> {
  const found: Candidate[] = [];

  for (const env of await listing(path.join(firmwareDir, ".pio", "build"))) {
    if (!env.isDirectory() || env.name === "native") continue;

    const directory = path.join(firmwareDir, ".pio", "build", env.name);
    for (const entry of await listing(directory)) {
      if (entry.isFile() && /^merged.*\.bin$/i.test(entry.name)) {
        found.push({ board: env.name, file: path.join(directory, entry.name) });
      }
    }
  }

  for (const env of await listing(path.join(firmwareDir, ".pio", "release"))) {
    if (!env.isDirectory()) continue;

    const directory = path.join(firmwareDir, ".pio", "release", env.name, "flash");
    for (const entry of await listing(directory)) {
      if (entry.isFile() && entry.name.endsWith(".bin")) {
        found.push({ board: env.name, file: path.join(directory, entry.name) });
      }
    }
  }

  return found;
}

/* -- do it ------------------------------------------------------------------- */

try {
  await stat(firmwareDir);
} catch {
  console.error(
    `No firmware checkout at ${firmwareDir}.\n` +
      `Pass one as an argument, or set TRMNL_FIRMWARE_DIR.`,
  );
  process.exit(1);
}

const release = await version();
const images = await candidates();

if (!images.length) {
  console.error(
    `Nothing built in ${firmwareDir}/.pio.\n` +
      `Build a board there first - e.g. \`.venv/bin/pio run -e waveshare-esp32-driver\`.`,
  );
  process.exit(1);
}

await mkdir(DOWNLOADS, { recursive: true });

let written = 0;

// Newest first, so a board built twice keeps the build you just made.
const dated = await Promise.all(
  images.map(async (one) => ({ ...one, at: (await stat(one.file)).mtimeMs })),
);

const seen = new Set<string>();

for (const image of dated.sort((a, b) => b.at - a.at)) {
  if (seen.has(image.board)) continue;
  seen.add(image.board);

  const bytes = await readFile(image.file);
  const wrong = isMerged(bytes);

  if (wrong) {
    console.log(`  skip  ${image.board}  ${path.basename(image.file)} — ${wrong}`);
    continue;
  }

  const name = `${image.board}${release ? `-${release}` : ""}.bin`;
  await copyFile(image.file, path.join(DOWNLOADS, name));

  console.log(`  ok    ${name}  ${(bytes.length / 1024).toFixed(0)} kB`);
  written += 1;
}

console.log(
  written
    ? `\n${written} image${written === 1 ? "" : "s"} in web/public/downloads. Reload /devices/new.`
    : `\nNothing usable found. A bare firmware.bin cannot be written at offset 0.`,
);

process.exit(written ? 0 : 1);
