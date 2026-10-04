// Values: docs/format.md "Values and references". Built-ins and extraction
// from a fetched JSON body, the same way the firmware picks them out.

import { parseZone, toLocal } from "./tz";
import type { Source, Value } from "./types";

export interface DeviceState {
  battery: number | null;
  usb: boolean;
  online: boolean;
  rssi: number | null;
}

// Like the XIAO panel: it cannot measure its own battery, so that reads as unknown.
export const SIMULATED_DEVICE: DeviceState = { battery: null, usb: false, online: true, rssi: -58 };

export function builtins(now: number, tz: string, device: DeviceState = SIMULATED_DEVICE): Map<string, Value> {
  const l = toLocal(parseZone(tz), now);
  return new Map<string, Value>([
    ["clock.epoch", now],
    ["clock.hour", l.hour],
    ["clock.minute", l.minute],
    ["clock.minutes", l.hour * 60 + l.minute],
    ["clock.weekday", l.weekday],
    ["clock.day", l.day],
    ["clock.month", l.month],
    ["clock.year", l.year],
    ["device.battery", device.battery],
    ["device.usb", device.usb],
    ["device.online", device.online],
    ["device.rssi", device.rssi],
  ]);
}

const MAX_SERIES = 64;
const MAX_STRING_BYTES = 256;

/** At most 256 bytes of UTF-8, never splitting a character — as the panel keeps it. */
export function clip(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= MAX_STRING_BYTES) return text;
  let end = MAX_STRING_BYTES;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

export function at(body: unknown, path: string): unknown {
  let node: unknown = body;
  for (const seg of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    if (Array.isArray(node)) {
      if (!/^\d+$/.test(seg)) return undefined;
      node = node[Number(seg)];
    } else node = (node as Record<string, unknown>)[seg];
  }
  return node;
}

export function extract(source: Source, body: unknown): Map<string, Value> {
  const out = new Map<string, Value>();
  for (const v of source.values) {
    const ref = `${source.id}.${v.key}`;
    const target = at(body, v.path);
    if (v.agg) {
      if (!Array.isArray(target)) out.set(ref, null);
      else if (v.agg === "count") out.set(ref, target.length);
      else if (v.agg !== "sum" || !v.field) out.set(ref, null);
      else {
        let sum = 0;
        for (const item of target) {
          const n = at(item, v.field);
          if (typeof n === "number" && Number.isFinite(n)) sum += n;
        }
        out.set(ref, sum);
      }
      continue;
    }
    if (v.count !== undefined) {
      if (!Array.isArray(target)) {
        out.set(ref, null);
        continue;
      }
      const series: number[] = [];
      for (const item of target.slice(0, Math.min(v.count, MAX_SERIES))) {
        if (typeof item !== "number" || !Number.isFinite(item)) break;
        series.push(item);
      }
      out.set(ref, series);
      continue;
    }
    if (typeof target === "string") out.set(ref, clip(target));
    else if (typeof target === "number" || typeof target === "boolean") out.set(ref, target);
    else out.set(ref, null);
  }
  return out;
}

/** `_ok` and `_age` for a source, given when it last answered. */
export function freshness(id: string, ok: boolean, lastSuccess: number | null, now: number): Map<string, Value> {
  return new Map<string, Value>([
    [`${id}._ok`, ok],
    [`${id}._age`, lastSuccess === null ? null : Math.floor((now - lastSuccess) / 60)],
  ]);
}
