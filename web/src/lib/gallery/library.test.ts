import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collections, pictures, resolve, titleOf } from "./library";

describe("titleOf", () => {
  it("reads a filename as a caption", () => {
    expect(titleOf("dunes.png")).toBe("Dunes");
    expect(titleOf("night_street.jpeg")).toBe("Night street");
    expect(titleOf("long-shadow.jpg")).toBe("Long shadow");
  });

  it("drops the digest the import script appends", () => {
    expect(titleOf("long-shadow-4f21ab.jpg")).toBe("Long shadow");
    expect(titleOf("gotham-8955ef.jpg")).toBe("Gotham");
  });

  it("captions nothing at all when the name is nothing but a digest", () => {
    // What you get saving straight out of a browser. "B8c8f0a9d3603be4"
    // under a photograph is worse than white space.
    expect(titleOf("b8c8f0a9d3603be4f02bbc330c571b8b.jpg")).toBe("");
    expect(titleOf("0f653b.png")).toBe("");
  });
});

describe("the folder as a library", () => {
  let root: string;

  const pretendPicture = (file: string) => writeFile(file, "not really a jpeg");

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dither-gallery-"));
    process.env.DITHER_GALLERY_DIR = root;

    await mkdir(path.join(root, "pins"), { recursive: true });
    await pretendPicture(path.join(root, "pins", "gotham-8955ef.jpg"));
    await pretendPicture(path.join(root, "pins", "halftone-123501.jpg"));
    await pretendPicture(path.join(root, "pins", "notes.txt"));
    await pretendPicture(path.join(root, "loose-one.png"));

    // Empty folders are not collections; an album you have not filled yet
    // should not be offered as somewhere to point a widget.
    await mkdir(path.join(root, "empty"), { recursive: true });
  });

  afterEach(async () => {
    delete process.env.DITHER_GALLERY_DIR;
    await rm(root, { recursive: true, force: true });
  });

  /** The listing is cached for a few seconds, so every case needs its own now. */
  let clock = Date.now();
  const later = () => (clock += 60_000);

  it("finds a folder as a collection, and the loose files as one too", async () => {
    const found = await collections(later());

    expect(found.map((one) => one.id).sort()).toEqual(["loose", "pins"]);
    expect(found.find((one) => one.id === "pins")?.count).toBe(2);
    expect(found.find((one) => one.id === "loose")?.count).toBe(1);
  });

  it("ignores anything that is not a picture", async () => {
    await collections(later());
    const held = await pictures("pins");

    expect(held.map((one) => one.title)).toEqual(["Gotham", "Halftone"]);
  });

  it("hands back everything when no collection is named", async () => {
    await collections(later());
    expect((await pictures()).length).toBe(3);
  });

  it("resolves an id to the file behind it", async () => {
    await collections(later());
    const one = await resolve("pins/gotham-8955ef.jpg");

    expect(one?.file).toBe(path.join(root, "pins", "gotham-8955ef.jpg"));
    expect(one?.collection).toBe("pins");
  });

  it("refuses an id that points anywhere but inside the gallery", async () => {
    await collections(later());

    // Every id in practice comes from our own settings, which is exactly the
    // assumption that makes a traversal bug worth a test rather than a shrug.
    expect(await resolve("../secrets/id_rsa.png")).toBeUndefined();
    expect(await resolve("pins/../../etc/hosts.png")).toBeUndefined();
    expect(await resolve("pins/deeper/one.png")).toBeUndefined();
    expect(await resolve("pins/gone.jpg")).toBeUndefined();
  });
});

describe("the shape of a picture", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dither-shapes-"));
    process.env.DITHER_GALLERY_DIR = root;

    await mkdir(path.join(root, "mixed"), { recursive: true });

    const draw = async (name: string, width: number, height: number) =>
      writeFile(
        path.join(root, "mixed", name),
        await sharp({ create: { width, height, channels: 3, background: "#444" } })
          .png()
          .toBuffer(),
      );

    await draw("wide.png", 800, 480);
    await draw("tall.png", 480, 800);
    await draw("boxy.png", 500, 500);
    // Just inside the twentieth either way that still counts as square.
    await draw("nearly.png", 512, 500);
  });

  afterEach(async () => {
    delete process.env.DITHER_GALLERY_DIR;
    await rm(root, { recursive: true, force: true });
  });

  it("reads it from the file, not from the name", async () => {
    await collections(Date.now() + 3_600_000);
    const held = await pictures("mixed");
    const shape = (title: string) => held.find((one) => one.title === title)?.orientation;

    expect(shape("Wide")).toBe("landscape");
    expect(shape("Tall")).toBe("portrait");
    expect(shape("Boxy")).toBe("square");
    expect(shape("Nearly")).toBe("square");
  });

  it("carries the pixels too, for a hint in the picker", async () => {
    await collections(Date.now() + 3_600_000);
    const one = (await pictures("mixed")).find((candidate) => candidate.title === "Wide");

    expect(one?.width).toBe(800);
    expect(one?.height).toBe(480);
  });

  it("measures a resolved id the same way", async () => {
    await collections(Date.now() + 3_600_000);
    const one = await resolve("mixed/tall.png");

    expect(one?.orientation).toBe("portrait");
    expect(one?.height).toBe(800);
  });
});
