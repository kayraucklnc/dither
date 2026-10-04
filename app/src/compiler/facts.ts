// Everything a rule can ask about, in words, and how each check becomes a
// runtime condition. Built-ins come first; every widget with data adds its own.

import type { Fact } from "@/extensions/api";
import type { Check, Project } from "@/project/schema";
import type { Condition } from "@/runtime/types";
import { envOf, extensionFor, widgetTitle } from "./widgets";
import { namedSpecs, resolveKey, type SourceMap } from "./sources";

export type CatalogFact =
  | (Fact & { id: string; group: string; ref: string; sources: SourceMap; extension?: string })
  | { id: string; group: string; key: string; label: string; type: "time"; ref: string };

export type FactType = CatalogFact["type"];

export const OPS: Record<FactType, { op: string; label: string }[]> = {
  time: [{ op: "between", label: "is between" }],
  number: [
    { op: "gt", label: "is above" },
    { op: "lt", label: "is below" },
    { op: "ge", label: "is at least" },
    { op: "le", label: "is at most" },
    { op: "eq", label: "is exactly" },
    { op: "between", label: "is between" },
  ],
  boolean: [{ op: "is", label: "is" }],
  flag: [{ op: "is", label: "is" }],
  choice: [
    { op: "in", label: "is" },
    { op: "notin", label: "is not" },
  ],
  text: [
    { op: "contains", label: "contains" },
    { op: "eq", label: "is exactly" },
  ],
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const BUILT_IN: CatalogFact[] = [
  { id: "time", group: "Time", key: "time", label: "Time of day", type: "time", ref: "clock.minutes" },
  {
    id: "weekday", group: "Time", key: "weekday", label: "Day of the week", type: "choice", value: "weekday", ref: "clock.weekday", sources: {},
    choices: [
      ...WEEKDAYS.map((label, i) => ({ id: String(i), label, match: [i] })),
      { id: "weekdays", label: "a weekday", match: [1, 2, 3, 4, 5] },
      { id: "weekend", label: "the weekend", match: [0, 6] },
    ],
  },
  { id: "battery", group: "Panel", key: "battery", label: "Battery", type: "number", value: "battery", unit: "%", ref: "device.battery", sources: {} },
  { id: "online", group: "Panel", key: "online", label: "Connected to Wi-Fi", type: "boolean", value: "online", ref: "device.online", sources: {} },
  { id: "usb", group: "Panel", key: "usb", label: "Plugged in", type: "boolean", value: "usb", ref: "device.usb", sources: {} },
];

/**
 * The catalog for a project. `sourceIds` maps widget id → runtime source id;
 * pass it from a compile, or leave it out to list facts for the editor.
 */
export function factCatalog(project: Project, sourceIds?: ReadonlyMap<string, SourceMap>): CatalogFact[] {
  const env = envOf(project);
  const out = [...BUILT_IN];
  for (const screen of project.screens) {
    for (const w of screen.widgets) {
      const ext = extensionFor(w.type);
      if (!ext?.facts || !ext.source) continue;
      const settings = { ...ext.defaults(env), ...w.settings };
      const names = Object.keys(namedSpecs(ext.source(settings, env)));
      if (names.length === 0) continue;
      const group = widgetTitle(w, env);
      // Before a compile there are no runtime ids; the widget's own id stands in.
      const sources = sourceIds?.get(w.id) ?? Object.fromEntries(names.map((n) => [n, n ? `${w.id}~${n}` : w.id]));
      for (const f of ext.facts(settings, env)) {
        const ref = f.type === "flag" ? "" : (resolveKey(f.value, sources) ?? "");
        out.push({ ...f, id: `${w.id}:${f.key}`, group, ref, sources, extension: w.type });
      }
    }
  }
  return out;
}

export function minutesOf(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** A widget's own condition, its references pointed at that widget's sources. */
export function scoped(c: Condition, sources: SourceMap): Condition {
  if ("all" in c) return { all: c.all.map((x) => scoped(x, sources)) };
  if ("any" in c) return { any: c.any.map((x) => scoped(x, sources)) };
  if ("not" in c) return { not: scoped(c.not, sources) };
  const v = resolveKey(c.v, sources) ?? c.v;
  const f = c.f?.shift ? { ...c.f, shift: { ...c.f.shift, v: resolveKey(c.f.shift.v, sources) ?? c.f.shift.v } } : c.f;
  const vs = c.vs === undefined ? undefined : (resolveKey(c.vs, sources) ?? c.vs);
  return { ...c, v, ...(f ? { f } : {}), ...(vs !== undefined ? { vs } : {}) };
}

/** One check as a condition, or null when it is not filled in yet. */
export function checkToCondition(check: Check, catalog: readonly CatalogFact[]): Condition | null {
  const fact = catalog.find((f) => f.id === check.fact);
  if (!fact) return null;
  const v = fact.ref;
  const x = check.value;
  switch (fact.type) {
    case "time": {
      const r = x as { from?: unknown; to?: unknown } | undefined;
      const from = minutesOf(r?.from);
      const to = minutesOf(r?.to);
      return from === null || to === null ? null : { v, op: "between", x: [from, to] };
    }
    case "number": {
      if (check.op === "between") {
        const [a, b] = Array.isArray(x) ? x : [];
        if (typeof a !== "number" || typeof b !== "number") return null;
        const cond: Condition = { v, op: "between", x: [a, b], ...(fact.format ? { f: fact.format } : {}) };
        return "sources" in fact ? scoped(cond, fact.sources) : cond;
      }
      if (typeof x !== "number" || !["gt", "lt", "ge", "le", "eq"].includes(check.op)) return null;
      const cond: Condition = { v, op: check.op as "gt", x, ...(fact.format ? { f: fact.format } : {}) };
      return "sources" in fact ? scoped(cond, fact.sources) : cond;
    }
    case "boolean":
      return { v, op: x === false ? "false" : "true" };
    case "flag": {
      const test = scoped(fact.test, fact.sources);
      return x === false ? { not: test } : test;
    }
    case "choice": {
      const ids = Array.isArray(x) ? x : [];
      const match = fact.choices.filter((c) => ids.includes(c.id)).flatMap((c) => c.match);
      if (match.length === 0) return null;
      const cond: Condition = { v, op: "in", x: match };
      return check.op === "notin" ? { not: cond } : cond;
    }
    case "text":
      return typeof x === "string" && x !== "" ? { v, op: check.op === "eq" ? "eq" : "contains", x } : null;
  }
}

/** A sentence for a check, for the rules list: "Time of day is between 23:00 and 07:00". */
export function describeCheck(check: Check, catalog: readonly CatalogFact[]): string {
  const fact = catalog.find((f) => f.id === check.fact);
  if (!fact) return "Something that no longer exists";
  const opLabel = OPS[fact.type].find((o) => o.op === check.op)?.label ?? "";
  const x = check.value;
  switch (fact.type) {
    case "time": {
      const r = (x ?? {}) as { from?: string; to?: string };
      return `${fact.label} is between ${r.from ?? "…"} and ${r.to ?? "…"}`;
    }
    case "boolean":
    case "flag":
      return `${fact.label} is ${x === false ? "no" : "yes"}`;
    case "choice": {
      const ids = Array.isArray(x) ? x : [];
      const labels = fact.choices.filter((c) => ids.includes(c.id)).map((c) => c.label);
      return `${fact.label} ${opLabel} ${labels.join(" or ") || "…"}`;
    }
    case "number": {
      const unit = fact.unit ?? "";
      if (check.op === "between" && Array.isArray(x)) return `${fact.label} is between ${x[0]}${unit} and ${x[1]}${unit}`;
      return `${fact.label} ${opLabel} ${typeof x === "number" ? `${x}${unit}` : "…"}`;
    }
    case "text":
      return `${fact.label} ${opLabel} “${typeof x === "string" ? x : ""}”`;
  }
}
