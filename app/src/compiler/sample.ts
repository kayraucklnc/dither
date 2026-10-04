// The values a preview draws with before anything is fetched: the clock, each
// source's sample, and the merges built from them — the same order a wake uses.

import { applyMerges } from "@/runtime/merge";
import { formatContext } from "@/runtime/render";
import type { Value } from "@/runtime/types";
import { builtins, type DeviceState } from "@/runtime/values";
import type { Compiled } from "./index";

export function sampleValues(compiled: Compiled, now: number, device?: DeviceState): Map<string, Value> {
  const values = builtins(now, compiled.runtime.tz, device);
  for (const s of compiled.sources) for (const [k, v] of s.sample) values.set(k, v);
  applyMerges(compiled.runtime.merges, values, formatContext(compiled.runtime, now, values));
  return values;
}
