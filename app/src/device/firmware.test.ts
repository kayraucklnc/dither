import { describe, expect, it } from "vitest";
import { BOARD } from "./fixtures.test-util";
import { FirmwareError, loadFirmware, manifestEntry, sha256Hex } from "./firmware";

const BASE = "https://example.test/app/";
const IMAGE = new Uint8Array([0xe9, 1, 2, 3, 4, 5]);

async function manifestFor(bytes: Uint8Array, overrides: Record<string, unknown> = {}) {
  return {
    boards: {
      "xiao-epaper-75": {
        file: "xiao-epaper-75.bin",
        version: "0.3.1",
        size: bytes.length,
        sha256: await sha256Hex(new Uint8Array(bytes)),
        chip: "ESP32-C3",
        dataPartition: { offset: 3145728, size: 1048576 },
        ...overrides,
      },
    },
  };
}

function fakeFetch(files: Record<string, Response | (() => Response)>): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const file = files[url];
    if (!file) return new Response("not found", { status: 404 });
    return typeof file === "function" ? file() : file;
  }) as typeof fetch;
  return { fetch: fetcher, urls };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const binary = (bytes: Uint8Array) => new Response(new Uint8Array(bytes));

async function failure(promise: Promise<unknown>): Promise<FirmwareError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof FirmwareError)) throw new Error(`expected a FirmwareError, got ${String(err)}`);
  return err;
}

describe("loadFirmware", () => {
  it("fetches manifest and image relative to the page and checks sha256", async () => {
    const { fetch, urls } = fakeFetch({
      [`${BASE}firmware/manifest.json`]: json(await manifestFor(IMAGE)),
      [`${BASE}firmware/xiao-epaper-75.bin`]: binary(IMAGE),
    });
    const fw = await loadFirmware("xiao-epaper-75", { fetch, baseUrl: BASE });
    expect(fw.version).toBe("0.3.1");
    expect(fw.bytes).toEqual(IMAGE);
    expect(fw.sha256).toBe(await sha256Hex(new Uint8Array(IMAGE)));
    expect(urls).toEqual([`${BASE}firmware/manifest.json`, `${BASE}firmware/xiao-epaper-75.bin`]);
  });

  it("says 'Firmware not built yet' when the manifest is absent", async () => {
    const { fetch } = fakeFetch({});
    const err = await failure(loadFirmware("xiao-epaper-75", { fetch, baseUrl: BASE }));
    expect(err.kind).toBe("missing");
    expect(err.message).toMatch(/^Firmware not built yet/);
  });

  it("treats a dev server's index.html fallback as absent", async () => {
    const html = () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
    const { fetch } = fakeFetch({ [`${BASE}firmware/manifest.json`]: html });
    expect((await failure(loadFirmware("xiao-epaper-75", { fetch, baseUrl: BASE }))).kind).toBe("missing");
  });

  it("treats a missing image as not built", async () => {
    const { fetch } = fakeFetch({ [`${BASE}firmware/manifest.json`]: json(await manifestFor(IMAGE)) });
    expect((await failure(loadFirmware("xiao-epaper-75", { fetch, baseUrl: BASE }))).kind).toBe("missing");
  });

  it("rejects an image whose hash or size does not match", async () => {
    const tampered = IMAGE.map((b, i) => (i === 3 ? 0 : b));
    const { fetch } = fakeFetch({
      [`${BASE}firmware/manifest.json`]: json(await manifestFor(IMAGE)),
      [`${BASE}firmware/xiao-epaper-75.bin`]: binary(tampered),
    });
    expect((await failure(loadFirmware("xiao-epaper-75", { fetch, baseUrl: BASE }))).kind).toBe("corrupt");
    const short = fakeFetch({
      [`${BASE}firmware/manifest.json`]: json(await manifestFor(IMAGE)),
      [`${BASE}firmware/xiao-epaper-75.bin`]: binary(IMAGE.subarray(0, 3)),
    });
    expect((await failure(loadFirmware("xiao-epaper-75", { fetch: short.fetch, baseUrl: BASE }))).kind).toBe(
      "corrupt",
    );
  });

  it("reports a network failure", async () => {
    const fetcher = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect((await failure(loadFirmware("xiao-epaper-75", { fetch: fetcher, baseUrl: BASE }))).kind).toBe("network");
  });

  it("refuses an unknown board", async () => {
    expect((await failure(loadFirmware("nope", { fetch: fakeFetch({}).fetch, baseUrl: BASE }))).kind).toBe("missing");
  });
});

describe("manifestEntry", () => {
  it("rejects a malformed manifest", () => {
    expect(() => manifestEntry({ boards: { "xiao-epaper-75": { file: "x" } } }, BOARD)).toThrow(FirmwareError);
    expect(() => manifestEntry("nope", BOARD)).toThrow(/damaged/);
  });

  it("reports a board missing from the manifest as not built", () => {
    expect(() => manifestEntry({ boards: {} }, BOARD)).toThrow(/^Firmware not built yet/);
  });

  it("rejects a chip or partition layout that disagrees with the board", async () => {
    expect(() => manifestEntry(manifestForSync({ chip: "ESP32-S3" }), BOARD)).toThrow(/ESP32-S3/);
    expect(() => manifestEntry(manifestForSync({ dataPartition: { offset: 0x200000, size: 0x100000 } }), BOARD)).toThrow(
      /flash layout/,
    );
  });
});

function manifestForSync(overrides: Record<string, unknown>) {
  const entry = {
    file: "xiao-epaper-75.bin",
    version: "1",
    size: 1,
    sha256: "0".repeat(64),
    chip: "ESP32-C3",
    dataPartition: { offset: 3145728, size: 1048576 },
  };
  return { boards: { "xiao-epaper-75": { ...entry, ...overrides } } };
}
