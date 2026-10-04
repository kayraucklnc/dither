// The values the simulator draws with: the clock, a pretend panel, and each
// source fetched from this browser where the server allows it — the sample
// data otherwise. What the panel shows after flashing differs only in where
// the numbers came from, never in how they are drawn.

import { useEffect, useMemo, useState } from "react";
import type { Compiled } from "@/compiler";
import type { FormatContext } from "@/runtime/format";
import { expand } from "@/runtime/placeholders";
import { formatContext } from "@/runtime/render";
import type { Source, SourceAuth, Value } from "@/runtime/types";
import { SIMULATED_DEVICE, builtins, extract, freshness, type DeviceState } from "@/runtime/values";

export type SourceStatus = { state: "loading" } | { state: "live"; at: number } | { state: "sample"; reason: string };

/** A server's raw answer. Kept raw so sources sharing a URL each pick their own values from it. */
type Fetched = { at: number; ok: true; body: unknown } | { at: number; ok: false; error: string };

const TIMEOUT_MS = 15_000;
const RETRY_FAILED_MS = 60_000;

const cache = new Map<string, Fetched>();
const inflight = new Map<string, Promise<Fetched>>();

const keyOf = (source: Source): string => JSON.stringify([source.url, source.headers ?? []]);

function isCurrent(f: Fetched, source: Source): boolean {
  const ttl = source.every * 1000;
  return Date.now() - f.at < (f.ok ? ttl : Math.min(ttl, RETRY_FAILED_MS));
}

const tokens = new Map<string, { token: string; until: number }>();

/** The same token trade the panel makes, so a linked account previews live. */
async function bearer(auth: SourceAuth): Promise<string> {
  const key = JSON.stringify(auth.form);
  const hit = tokens.get(key);
  if (hit && Date.now() < hit.until) return hit.token;
  const res = await fetch(auth.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(auth.form),
    credentials: "omit",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json()) as Record<string, unknown>;
  const token = body[auth.token];
  if (!res.ok || typeof token !== "string") throw new Error("The account refused the saved sign-in. Link it again.");
  const life = Number(body[auth.expires ?? "expires_in"]) || 3600;
  tokens.set(key, { token, until: Date.now() + (life - 60) * 1000 });
  return token;
}

async function request(source: Source, ctx: FormatContext): Promise<Fetched> {
  const fail = (error: string): Fetched => ({ at: Date.now(), ok: false, error });
  const timedOut = (e: unknown) => e instanceof DOMException && e.name === "TimeoutError";
  if (source.decode) return fail("Its answers are encrypted for the panel; the preview uses example data.");
  const headers = Object.fromEntries((source.headers ?? []).map(([k, v]) => [k, expand(v, ctx, false)]));
  if (source.auth) {
    try {
      headers.Authorization = `Bearer ${await bearer(source.auth)}`;
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Signing in failed.");
    }
  }
  let res: Response;
  try {
    res = await fetch(expand(source.url, ctx, true), {
      headers,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return fail(timedOut(e) ? "The server took too long to answer." : "This browser is not allowed to ask that server; the panel can.");
  }
  if (!res.ok) return fail(`The server answered ${res.status}`);
  try {
    return { at: Date.now(), ok: true, body: await res.json() };
  } catch (e) {
    return fail(timedOut(e) ? "The server took too long to answer." : "The server's answer is not JSON.");
  }
}

function fetchSource(source: Source, ctx: FormatContext): Promise<Fetched> {
  const key = keyOf(source);
  const hit = cache.get(key);
  if (hit && isCurrent(hit, source)) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    p = request(source, ctx).then((f) => {
      cache.set(key, f);
      inflight.delete(key);
      return f;
    });
    inflight.set(key, p);
  }
  return p;
}

/** Forget answers no current source asks for. */
function prune(keys: ReadonlySet<string>): void {
  for (const k of cache.keys()) if (!keys.has(k)) cache.delete(k);
}

export interface Overrides {
  /** A fixed moment instead of now. */
  time?: number;
  device?: Partial<DeviceState>;
  values?: Record<string, Value>;
}

export interface Simulation {
  now: number;
  values: Map<string, Value>;
  status: Map<string, SourceStatus>;
}

export function useSimulation(compiled: Compiled | null, overrides: Overrides = {}): Simulation {
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 1000));
  const [results, setResults] = useState<Map<string, Fetched>>(new Map());

  useEffect(() => {
    const t = setInterval(() => setClock(Math.floor(Date.now() / 1000)), 15000);
    return () => clearInterval(t);
  }, []);

  const sources = compiled?.sources;
  useEffect(() => {
    if (!sources) return;
    let cancelled = false;
    const keys = new Set(sources.map((s) => keyOf(s.source)));
    prune(keys);
    setResults((r) => ([...r.keys()].every((k) => keys.has(k)) ? r : new Map([...r].filter(([k]) => keys.has(k)))));
    const ctx = formatContext(compiled!.runtime, clock);
    for (const s of sources) {
      const key = keyOf(s.source);
      fetchSource(s.source, ctx).then((f) => {
        if (!cancelled) setResults((r) => (r.get(key) === f ? r : new Map(r).set(key, f)));
      });
    }
    return () => {
      cancelled = true;
    };
    // compiled is read for its runtime's zone; sources already change with it.
  }, [sources, clock]);

  return useMemo(() => {
    const now = overrides.time ?? clock;
    const tz = compiled?.runtime.tz ?? "STD0";
    const values = builtins(now, tz, { ...SIMULATED_DEVICE, ...overrides.device });
    const status = new Map<string, SourceStatus>();
    for (const s of compiled?.sources ?? []) {
      const f = results.get(keyOf(s.source));
      if (f?.ok) {
        for (const [k, v] of extract(s.source, f.body)) values.set(k, v);
        for (const [k, v] of freshness(s.source.id, true, Math.floor(f.at / 1000), now)) values.set(k, v);
        status.set(s.source.id, { state: "live", at: f.at });
      } else {
        for (const [k, v] of s.sample) values.set(k, v);
        for (const [k, v] of freshness(s.source.id, true, now, now)) values.set(k, v);
        status.set(s.source.id, f ? { state: "sample", reason: f.error } : { state: "loading" });
      }
    }
    for (const [k, v] of Object.entries(overrides.values ?? {})) values.set(k, v);
    return { now, values, status };
  }, [compiled, results, clock, overrides.time, overrides.device, overrides.values]);
}
