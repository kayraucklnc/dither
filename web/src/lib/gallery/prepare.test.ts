import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LOOK, prepare, quarterTurn, turnFor, type Look } from "./prepare";
import type { Picture } from "./library";

/**
 * The two things about preparing a picture that are not a matter of taste.
 *
 * How a crop looks is checked by looking at it. Which way up it comes out, and
 * what the bars either side of it are made of, are answers a test can hold on
 * to - and both were wrong once.
 */

let folder: string;

async function put(name: string, draw: Sharp): Promise<Picture> {
  const file = path.join(folder, name);
  await writeFile(file, await draw.png().toBuffer());

  return {
    id: `test/${name}`,
    file,
    collection: "test",
    title: name,
    modifiedAt: 1,
    width: 0,
    height: 0,
    orientation: "portrait",
  };
}

/** A tall picture, ink at the top and paper at the foot. */
const banded = () =>
  sharp({ create: { width: 200, height: 400, channels: 3, background: "#ffffff" } }).composite([
    {
      input: {
        create: { width: 200, height: 200, channels: 3, background: "#000000" },
      },
      top: 0,
      left: 0,
    },
  ]);

const look = (over: Partial<Look>): Look => ({
  ...DEFAULT_LOOK,
  width: 80,
  height: 80,
  fit: "whole",
  ...over,
});

/** The tone at a point of a prepared picture, 0 ink and 255 paper. */
async function toneAt(source: string, x: number, y: number): Promise<number> {
  const bytes = Buffer.from(source.split(",")[1], "base64");
  const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });

  return data[y * info.width * info.channels + x * info.channels];
}

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "dither-prepare-"));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("quarterTurn", () => {
  it("only ever answers with a quarter turn clockwise", () => {
    expect(quarterTurn(0)).toBe(0);
    expect(quarterTurn(90)).toBe(90);
    expect(quarterTurn(450)).toBe(90);
    expect(quarterTurn(-90)).toBe(270);
    expect(quarterTurn("180")).toBe(180);
    expect(quarterTurn(undefined)).toBe(0);
    expect(quarterTurn("sideways")).toBe(0);
  });
});

describe("turnFor", () => {
  /** A wallpaper and a column: the two boxes worth arguing about. */
  const wide = { width: 800, height: 480 };
  const tall = { width: 240, height: 720 };

  it("obeys a number without looking at anything", () => {
    expect(turnFor(90, { width: 800, height: 480 }, wide)).toBe(90);
    expect(turnFor("270", { width: 736, height: 1308 }, wide)).toBe(270);
    expect(turnFor(0, { width: 736, height: 1308 }, wide)).toBe(0);
  });

  it("turns a picture that is long the other way from its box", () => {
    expect(turnFor("auto", { width: 736, height: 1308 }, wide)).toBe(90);
    expect(turnFor("auto", { width: 736, height: 414 }, tall)).toBe(90);
  });

  it("leaves a picture that already agrees with its box", () => {
    expect(turnFor("auto", { width: 1200, height: 800 }, wide)).toBe(0);
    expect(turnFor("auto", { width: 736, height: 1308 }, tall)).toBe(0);
  });

  it("leaves anything near square alone, whichever way the box lies", () => {
    // Off square by a tenth is enough to be filed as portrait and nowhere near
    // enough to be worth reading sideways.
    expect(turnFor("auto", { width: 900, height: 1000 }, wide)).toBe(0);
    expect(turnFor("auto", { width: 1080, height: 1080 }, wide)).toBe(0);
    expect(turnFor("auto", { width: 1000, height: 900 }, tall)).toBe(0);
  });

  it("leaves a picture nothing could measure alone", () => {
    expect(turnFor("auto", { width: 0, height: 0 }, wide)).toBe(0);
    expect(turnFor("auto", { width: 736, height: 1308 }, { width: 0, height: 0 })).toBe(0);
  });
});

describe("turning a picture", () => {
  it("moves the top of it to the side", async () => {
    const picture = await put("banded.png", banded());

    const upright = await prepare(picture, look({ turn: 0 }));
    const turned = await prepare(picture, look({ turn: 90 }));

    // Upright: ink at the top, paper at the foot.
    expect(await toneAt(upright.source, 40, 12)).toBeLessThan(64);
    expect(await toneAt(upright.source, 40, 68)).toBeGreaterThan(190);

    // A quarter turn clockwise puts what was the top on the right.
    expect(await toneAt(turned.source, 68, 40)).toBeLessThan(64);
    expect(await toneAt(turned.source, 12, 40)).toBeGreaterThan(190);
  });

  it("treats a full circle as no turn at all", async () => {
    const picture = await put("circle.png", banded());

    const none = await prepare(picture, look({ turn: 0 }));
    const round = await prepare(picture, look({ turn: 360 }));

    expect(round.source).toBe(none.source);
  });

  it("draws `auto` as the quarter turn it works out to", async () => {
    // The measurements are what `resolve` puts on a Picture; the helper above
    // leaves them at zero because nothing else here reads them.
    const measured = { ...(await put("auto.png", banded())), width: 200, height: 400 };
    const box = { width: 160, height: 80 };

    const auto = await prepare(measured, look({ turn: "auto", ...box }));
    const turned = await prepare(measured, look({ turn: 90, ...box }));
    expect(auto.source).toBe(turned.source);

    // The same picture in a box that is long the same way it is stays upright.
    const upright = { width: 80, height: 160 };
    expect((await prepare(measured, look({ turn: "auto", ...upright }))).source).toBe(
      (await prepare(measured, look({ turn: 0, ...upright }))).source,
    );
  });

  it("decides an enlargement by the shape it will be drawn at", async () => {
    // 200x400 turned is 400x200, which is wider than the box rather than much
    // narrower - so the nearest-neighbour path for pixel art must not fire on
    // the strength of the untuned dimensions.
    const picture = await put("wide-once-turned.png", banded());

    const turned = await prepare(picture, look({ turn: 90, width: 300, height: 160 }));
    expect(turned.width).toBe(300);
    expect(turned.height).toBe(160);
  });
});

describe("the bars either side of a whole picture", () => {
  it("are ink where the picture is dark", async () => {
    const picture = await put(
      "dark.png",
      sharp({ create: { width: 100, height: 400, channels: 3, background: "#101010" } }),
    );

    const whole = await prepare(picture, look({ fit: "whole", width: 200, height: 80 }));

    // The picture is a tall sliver in a wide box, so the far left is matte.
    expect(await toneAt(whole.source, 2, 40)).toBeLessThan(64);
  });

  it("are paper where it is light", async () => {
    const picture = await put(
      "light.png",
      sharp({ create: { width: 100, height: 400, channels: 3, background: "#f0f0f0" } }),
    );

    const whole = await prepare(picture, look({ fit: "whole", width: 200, height: 80 }));

    expect(await toneAt(whole.source, 2, 40)).toBeGreaterThan(190);
  });

  it("are not drawn at all when the picture fills the box", async () => {
    const picture = await put(
      "filling.png",
      sharp({ create: { width: 400, height: 400, channels: 3, background: "#101010" } }),
    );

    const filled = await prepare(picture, look({ fit: "fill", width: 200, height: 80 }));
    expect(await toneAt(filled.source, 2, 40)).toBeLessThan(64);
  });
});
