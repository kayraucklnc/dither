import { describe, expect, it } from "vitest";
import { APP_DESC_ADDRESS, isDitherFirmware, parseAppDescriptor } from "./appDesc";
import { makeAppDesc } from "./fixtures.test-util";

describe("parseAppDescriptor", () => {
  it("reads at 0x10000 + 0x20", () => {
    expect(APP_DESC_ADDRESS).toBe(0x10020);
  });

  it("reads project name and version as C strings", () => {
    expect(parseAppDescriptor(makeAppDesc("dither", "0.3.1"))).toEqual({ project: "dither", version: "0.3.1" });
  });

  it("stops a 32-byte field without a terminator at its end", () => {
    const long = "v".repeat(40);
    expect(parseAppDescriptor(makeAppDesc("dither", long.slice(0, 32)))?.version).toBe("v".repeat(32));
  });

  it("works on a view into a larger buffer", () => {
    const backing = new Uint8Array(300);
    backing.set(makeAppDesc("dither", "1.0.0"), 10);
    expect(parseAppDescriptor(backing.subarray(10, 266))?.version).toBe("1.0.0");
  });

  it("returns null for erased flash, a wrong magic or too few bytes", () => {
    expect(parseAppDescriptor(new Uint8Array(256).fill(0xff))).toBeNull();
    expect(parseAppDescriptor(makeAppDesc("dither", "1", 0x12345678))).toBeNull();
    expect(parseAppDescriptor(makeAppDesc("dither", "1").subarray(0, 40))).toBeNull();
  });

  it("knows Dither from other firmware", () => {
    expect(isDitherFirmware({ project: "dither", version: "1" })).toBe(true);
    expect(isDitherFirmware({ project: "trmnl", version: "1" })).toBe(false);
    expect(isDitherFirmware(null)).toBe(false);
  });
});
