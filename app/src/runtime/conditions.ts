// docs/format.md "Conditions" and "Rules".

import { applyValueSteps, type FormatContext } from "./format";
import type { Condition, Rule, Value, Values } from "./types";

function equal(a: Value, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  return false;
}

function compare(op: "lt" | "le" | "gt" | "ge", a: Value, b: unknown): boolean {
  if (typeof a !== "number" || typeof b !== "number") return false;
  switch (op) {
    case "lt": return a < b;
    case "le": return a <= b;
    case "gt": return a > b;
    default: return a >= b;
  }
}

function between(v: Value, x: unknown): boolean {
  if (typeof v !== "number" || !Array.isArray(x) || x.length !== 2) return false;
  const [a, b] = x;
  if (typeof a !== "number" || typeof b !== "number") return false;
  return a > b ? v >= a || v < b : v >= a && v < b;
}

export function evaluate(c: Condition, values: Values, ctx: FormatContext): boolean {
  if ("all" in c) return c.all.every((x) => evaluate(x, values, ctx));
  if ("any" in c) return c.any.some((x) => evaluate(x, values, ctx));
  if ("not" in c) return !evaluate(c.not, values, ctx);
  const raw = values.get(c.v) ?? null;
  const v = c.f ? applyValueSteps(raw, c.f, ctx) : raw;
  if (c.vs !== undefined) {
    // Against another value, put through the same format.
    const other = values.get(c.vs) ?? null;
    const x = c.f ? applyValueSteps(other, c.f, ctx) : other;
    switch (c.op) {
      case "eq": return equal(v, x);
      case "ne": return !equal(v, x);
      case "lt": case "le": case "gt": case "ge": return compare(c.op, v, x);
      default: return false;
    }
  }
  switch (c.op) {
    case "eq": return equal(v, c.x);
    case "ne": return !equal(v, c.x);
    case "lt": case "le": case "gt": case "ge": return compare(c.op, v, c.x);
    case "between": return between(v, c.x);
    case "in": return Array.isArray(c.x) && c.x.some((x) => equal(v, x));
    case "contains": return typeof v === "string" && typeof c.x === "string" && v.includes(c.x);
    case "present": return v !== null;
    case "absent": return v === null;
    case "true": return v === true;
    case "false": return v === false;
    default: return false;
  }
}

/** Index of the screen the rules choose: the first rule that holds, else 0. */
export function chooseScreen(rules: readonly Rule[], values: Values, ctx: FormatContext): { screen: number; rule: number | null } {
  const i = rules.findIndex((r) => r.when === null || evaluate(r.when, values, ctx));
  return i >= 0 ? { screen: rules[i].screen, rule: i } : { screen: 0, rule: null };
}
