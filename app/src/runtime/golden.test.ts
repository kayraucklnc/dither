// The shared fixtures, drawn by this runtime. The firmware's host tests draw
// the same blobs; both must match expected.pbm bit for bit.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeBlob } from "./blob";
import { fromPbm } from "./pbm";
import { render } from "./render";
import type { Value } from "./types";
import { builtins } from "./values";

const root = fileURLToPath(new URL("../../../spec/fixtures/", import.meta.url));
const names = existsSync(root) ? readdirSync(root).filter((n) => existsSync(`${root}${n}/expected.pbm`)) : [];

describe.skipIf(names.length === 0)("golden fixtures", () => {
  it.each(names)("%s", (name) => {
    const blob = decodeBlob(new Uint8Array(readFileSync(`${root}${name}/blob.bin`)));
    const { now, values } = JSON.parse(readFileSync(`${root}${name}/values.json`, "utf8")) as { now: number; values: Record<string, Value> };
    const all = builtins(now, blob.runtime.tz);
    for (const k of ["device.battery", "device.usb", "device.online", "device.rssi"]) all.set(k, null);
    for (const [k, v] of Object.entries(values)) all.set(k, v);
    const { fb } = render(blob.runtime, blob.bytes, all, now);
    const expected = fromPbm(new Uint8Array(readFileSync(`${root}${name}/expected.pbm`)));
    let diff = 0;
    for (let i = 0; i < fb.bits.length; i++) diff += popcount(fb.bits[i] ^ expected.bits[i]);
    expect(diff, `${diff} pixels differ`).toBe(0);
  });
});

function popcount(b: number): number {
  let n = 0;
  for (let x = b; x; x &= x - 1) n++;
  return n;
}
