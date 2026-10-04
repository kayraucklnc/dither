import { describe, expect, it } from "vitest";
import { readHeader } from "@/runtime/blob";
import { DeviceError } from "./errors";
import { BOARD, GZIP_PROJECT, makeBlob } from "./fixtures.test-util";
import { checkBlob, checkFirmware, isGzip, parseBlobHeader, planFlash, projectRange } from "./plan";

const kind = (fn: () => void) => {
  try {
    fn();
  } catch (err) {
    return err instanceof DeviceError ? err.kind : "other";
  }
  return null;
};

describe("parseBlobHeader", () => {
  it("accepts a real header", () => {
    const blob = makeBlob(GZIP_PROJECT);
    expect(parseBlobHeader(blob.subarray(0, 48), BOARD.dataPartition)).toEqual(readHeader(blob));
  });

  it("rejects erased flash and blobs bigger than the partition", () => {
    expect(parseBlobHeader(new Uint8Array(48).fill(0xff), BOARD.dataPartition)).toBeNull();
    const blob = makeBlob(GZIP_PROJECT);
    expect(parseBlobHeader(blob.subarray(0, 48), { offset: 0, size: blob.length - 1 })).toBeNull();
  });

  it("rejects a project section that runs past the blob", () => {
    const head = makeBlob(GZIP_PROJECT).slice(0, 48);
    new DataView(head.buffer).setUint32(28, 1_000_000, true);
    expect(parseBlobHeader(head, BOARD.dataPartition)).toBeNull();
  });
});

describe("projectRange", () => {
  it("is the project offset and length, or null when absent", () => {
    const withProject = readHeader(makeBlob(GZIP_PROJECT))!;
    expect(projectRange(withProject)).toEqual({ offset: withProject.project[0], length: GZIP_PROJECT.length });
    expect(projectRange(readHeader(makeBlob())!)).toBeNull();
  });
});

describe("checks", () => {
  it("accepts a blob that fits and refuses one that does not", () => {
    expect(kind(() => checkBlob(makeBlob(), BOARD))).toBeNull();
    const tiny = { ...BOARD, dataPartition: { offset: 0x300000, size: 32 } };
    expect(kind(() => checkBlob(makeBlob(), tiny))).toBe("too-big");
  });

  it("says how big in KB", () => {
    const huge = makeBlob(new Uint8Array(1_100_000));
    expect(() => checkBlob(huge, BOARD)).toThrow(/need 1,075 KB, but the XIAO 7.5" has room for 1,024 KB/);
  });

  it("refuses bytes that are not a blob", () => {
    expect(kind(() => checkBlob(new Uint8Array(100), BOARD))).toBe("io");
  });

  it("refuses firmware for the wrong chip, empty, or overlapping the data partition", () => {
    expect(kind(() => checkFirmware(new Uint8Array(1000), BOARD, "ESP32-C3"))).toBeNull();
    expect(kind(() => checkFirmware(new Uint8Array(1000), BOARD, "ESP32-S3"))).toBe("unsupported");
    expect(kind(() => checkFirmware(new Uint8Array(0), BOARD, "ESP32-C3"))).toBe("too-big");
    expect(kind(() => checkFirmware(new Uint8Array(0x300001), BOARD, "ESP32-C3"))).toBe("too-big");
  });

  it("recognises gzip", () => {
    expect(isGzip(GZIP_PROJECT)).toBe(true);
    expect(isGzip(new Uint8Array([0x1f]))).toBe(false);
  });
});

describe("planFlash", () => {
  it("writes the blob alone at the data partition", () => {
    const blob = makeBlob();
    expect(planFlash({ blob }, BOARD)).toEqual({ files: [{ data: blob, address: 0x300000 }], stages: ["settings"] });
  });

  it("writes firmware at 0x0 first when given", () => {
    const blob = makeBlob();
    const firmware = new Uint8Array(10);
    expect(planFlash({ firmware, blob }, BOARD)).toEqual({
      files: [
        { data: firmware, address: 0 },
        { data: blob, address: 0x300000 },
      ],
      stages: ["firmware", "settings"],
    });
  });
});
