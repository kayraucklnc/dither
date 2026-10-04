// Alerts: drawn on top of every screen, each only while its checks hold and
// no earlier alert's do — so one alert at a time, the first one winning.

import type { AlertDef } from "@/project/schema";
import { evaluate } from "@/runtime/conditions";
import type { FormatContext } from "@/runtime/format";
import type { Condition, Part, Values } from "@/runtime/types";
import type { Draw } from "@/extensions/api";
import { checkToCondition, type CatalogFact } from "./facts";

function alertCondition(a: AlertDef, catalog: readonly CatalogFact[]): Condition | null {
  if (!a.enabled || a.checks.length === 0) return null;
  const conds = a.checks.map((c) => checkToCondition(c, catalog));
  if (conds.some((c) => c === null)) return null;
  const ok = conds as Condition[];
  return ok.length === 1 ? ok[0] : a.match === "all" ? { all: ok } : { any: ok };
}

/** The fact's value as text for the alert line, or null if it has none worth printing. */
export function valuePart(fact: CatalogFact | undefined): (string | Part)[] | null {
  if (!fact) return null;
  switch (fact.type) {
    case "number":
      return [{ v: fact.ref, f: { ...fact.format, num: { d: 0 } } }, fact.unit ?? ""];
    case "text":
      return [{ v: fact.ref }];
    case "choice": {
      const k: (string | number)[] = [];
      const o: string[] = [];
      for (const c of fact.choices) for (const m of c.match) if (!k.includes(m)) { k.push(m); o.push(c.label); }
      return [{ v: fact.ref, f: { map: { k, o } } }];
    }
    default:
      return null;
  }
}

function banner(d: Draw, a: AlertDef, value: (string | Part)[] | null): void {
  const h = Math.max(56, Math.round(d.height * 0.13));
  const y = d.height - h;
  const pad = Math.round(h * 0.2);
  d.rect({ x: 0, y, w: d.width, h });
  d.icon(a.icon, { x: pad, y: y + pad, w: h - 2 * pad, h: h - 2 * pad }, { white: true });
  const size = d.fit(["Ag"], d.width, h - 2 * pad, { max: 40 });
  const textX = h;
  const valueW = value ? Math.round(d.width * 0.3) : 0;
  d.text(a.text, { x: textX, y, w: d.width - textX - valueW - pad, h, size, weight: 700, valign: "middle", white: true });
  if (value) d.text(value, { x: d.width - valueW - pad, y, w: valueW, h, size, weight: 700, align: "right", valign: "middle", white: true });
}

function takeover(d: Draw, a: AlertDef, value: (string | Part)[] | null): void {
  d.rect({ x: 0, y: 0, w: d.width, h: d.height }, { white: true });
  d.rect({ x: 8, y: 8, w: d.width - 16, h: d.height - 16 }, { fill: false, stroke: 6, radius: 18 });
  const iconH = Math.round(d.height * 0.34);
  d.icon(a.icon, { x: 0, y: Math.round(d.height * 0.08), w: d.width, h: iconH });
  const textY = Math.round(d.height * 0.46);
  const textH = Math.round(d.height * (value ? 0.2 : 0.4));
  d.text(a.text, { x: 40, y: textY, w: d.width - 80, h: textH, size: d.fit([a.text], d.width - 80, textH, { weight: 700, max: 80 }), weight: 700, align: "center", valign: "middle" });
  if (value) {
    const vy = textY + textH;
    const vh = Math.round(d.height * 0.22);
    d.text(value, { x: 40, y: vy, w: d.width - 80, h: vh, size: d.fit(["888 min"], d.width - 80, vh, { weight: 700, max: 96 }), weight: 700, align: "center", valign: "middle" });
  }
}

export function drawAlerts(d: Draw, alerts: readonly AlertDef[], catalog: readonly CatalogFact[]): void {
  const earlier: Condition[] = [];
  for (const a of alerts) {
    const cond = alertCondition(a, catalog);
    if (!cond) continue;
    const when: Condition = earlier.length ? { all: [cond, ...earlier.map((e) => ({ not: e }))] } : cond;
    earlier.push(cond);
    const value = a.value ? valuePart(catalog.find((f) => f.id === a.value)) : null;
    d.when(when, () => (a.style === "takeover" ? takeover(d, a, value) : banner(d, a, value)));
  }
}

/** The alert the panel would draw now, if any — for the editor. */
export function activeAlert(alerts: readonly AlertDef[], catalog: readonly CatalogFact[], values: Values, ctx: FormatContext): string | null {
  for (const a of alerts) {
    const cond = alertCondition(a, catalog);
    if (cond && evaluate(cond, values, ctx)) return a.id;
  }
  return null;
}
