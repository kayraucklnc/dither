// Merges: one sorted, de-duplicated list from several sources' records —
// every linked calendar as one agenda. docs/format.md "Merges".

import { readTime, type FormatContext } from "./format";
import type { Merge, Value } from "./types";

interface Record_ {
  from: number;
  values: Map<string, Value>;
  at: number | null;
}

function same(a: Value, b: Value): boolean {
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) return false;
  return typeof a === typeof b && a === b;
}

export function applyMerges(merges: readonly Merge[] | undefined, values: Map<string, Value>, ctx: FormatContext): void {
  for (const merge of merges ?? []) {
    const m = { ...merge, count: Math.max(0, Math.min(64, Math.trunc(merge.count || 0))) };
    const records: Record_[] = [];
    m.from.forEach((src, from) => {
      for (let n = 0; n < m.count; n++) {
        const r = new Map(m.fields.map((f) => [f, values.get(`${src}.${f}${n}`) ?? null] as const));
        if ([...r.values()].every((v) => v === null)) continue; // not a record: the list ended
        if ((m.skip ?? []).some((f) => r.get(f) === null)) continue;
        let at: number | null = null;
        for (const f of m.sort ?? []) {
          const t = readTime(r.get(f) ?? null, ctx.zone, ctx.now);
          if (t) {
            at = t.epoch;
            break;
          }
        }
        records.push({ from, values: r, at });
      }
    });
    // Stable: equal instants keep source order, then record order.
    const sorted = records
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (a.r.at === null ? (b.r.at === null ? a.i - b.i : 1) : b.r.at === null ? -1 : a.r.at - b.r.at || a.i - b.i))
      .map((x) => x.r);
    const kept: Record_[] = [];
    for (const r of sorted) {
      const unique = m.unique ?? [];
      if (unique.length && kept.some((k) => unique.every((f) => same(k.values.get(f) ?? null, r.values.get(f) ?? null)))) continue;
      kept.push(r);
      if (kept.length === m.count) break;
    }
    for (let n = 0; n < m.count; n++) {
      const r = kept[n];
      for (const f of m.fields) values.set(`${m.id}.${f}${n}`, r ? (r.values.get(f) ?? null) : null);
      values.set(`${m.id}.from${n}`, r ? r.from : null);
    }
  }
}
