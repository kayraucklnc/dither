import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

describe("sha256", () => {
  it.each(["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "şişli ığdır €", "x".repeat(1000)])("matches node for %j", (s) => {
    expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
  });
});
