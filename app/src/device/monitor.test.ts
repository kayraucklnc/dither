import { describe, expect, it } from "vitest";
import { createLineSplitter, DITHER_PREFIX, keepLine } from "./monitor";
import { DeviceError, toDeviceError } from "./errors";

describe("createLineSplitter", () => {
  it("joins lines split across chunks and strips CR and colour codes", () => {
    const split = createLineSplitter();
    expect(split("[dither] bo")).toEqual([]);
    expect(split("ot\r\n\x1b[0;32mI (12) wifi: up\x1b[0m\n[dith")).toEqual(["[dither] boot", "I (12) wifi: up"]);
    expect(split("er] drew screen 2\n")).toEqual(["[dither] drew screen 2"]);
  });
});

describe("keepLine", () => {
  it("keeps only [dither] lines by default and everything with no prefix", () => {
    expect(keepLine("[dither] wake", DITHER_PREFIX)).toBe(true);
    expect(keepLine("I (12) wifi: up", DITHER_PREFIX)).toBe(false);
    expect(keepLine("I (12) wifi: up", null)).toBe(true);
  });
});

describe("toDeviceError", () => {
  it("maps Web Serial and esptool-js failures to kinds", () => {
    expect(toDeviceError(new DOMException("No port selected by the user.", "NotFoundError")).kind).toBe("cancelled");
    expect(toDeviceError(new DOMException("Failed to open serial port.", "NetworkError")).kind).toBe("busy");
    expect(toDeviceError(new DOMException("blocked", "SecurityError")).kind).toBe("unsupported");
    expect(toDeviceError(new DOMException("The device has been lost.", "NetworkError")).message).toMatch(/unplugged/);
    expect(toDeviceError(new Error("Failed to connect with the device")).message).toMatch(/BOOT/);
    expect(toDeviceError("weird").kind).toBe("io");
  });

  it("passes DeviceErrors through and keeps the cause", () => {
    const own = new DeviceError("too-big", "x");
    expect(toDeviceError(own)).toBe(own);
    const cause = new Error("Timeout");
    expect(toDeviceError(cause).cause).toBe(cause);
  });
});
