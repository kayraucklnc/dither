import type { FactType } from "@/lib/extensions/manifest";

/**
 * Facts are how an extension makes itself available to triggers.
 *
 * The flow engine knows nothing about trains, weather or calendars. It knows
 * that a widget publishes named, typed values, and that you can compare them.
 * A calendar connector that declares `next_meeting_in` gets "show the commute
 * when a meeting starts within thirty minutes" for free, without the engine
 * learning what a meeting is.
 *
 * The declared type decides which comparisons are offered, so the editor
 * cannot build a rule that asks whether a duration "contains" something - a
 * condition that could never be true is not constructible.
 */

export interface Operator {
  id: string;
  label: string;
  /** Whether the editor should ask for a value to compare against. */
  needsValue: boolean;
}

export const OPERATORS: Record<string, Operator> = {
  lt: { id: "lt", label: "is less than", needsValue: true },
  lte: { id: "lte", label: "is at most", needsValue: true },
  gt: { id: "gt", label: "is more than", needsValue: true },
  gte: { id: "gte", label: "is at least", needsValue: true },
  eq: { id: "eq", label: "is", needsValue: true },
  neq: { id: "neq", label: "is not", needsValue: true },
  contains: { id: "contains", label: "contains", needsValue: true },
  present: { id: "present", label: "has any value", needsValue: false },
  absent: { id: "absent", label: "is empty", needsValue: false },
};

const OPERATORS_FOR: Record<FactType, string[]> = {
  duration: ["lt", "lte", "gt", "gte", "present", "absent"],
  number: ["lt", "lte", "gt", "gte", "eq", "neq", "present", "absent"],
  text: ["eq", "neq", "contains", "present", "absent"],
  boolean: ["eq", "present", "absent"],
};

export function operatorsFor(type: FactType): Operator[] {
  return (OPERATORS_FOR[type] ?? []).map((id) => OPERATORS[id]);
}

/**
 * Resolve a dotted path against fetched data. A numeric step indexes an array,
 * so `source_1.departures.0.minutes_until` reads the next train.
 */
export function valueAt(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, step) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) return /^\d+$/.test(step) ? current[Number(step)] : undefined;
    if (typeof current === "object") return (current as Record<string, unknown>)[step];
    return undefined;
  }, data);
}

const isBlank = (value: unknown) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length);

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1" || value === "yes";
  return Boolean(value);
}

/**
 * Compare a fact's current value against what a condition asks for.
 *
 * Missing data answers false rather than throwing. A display whose weather
 * provider is down should keep showing the previous screen, not stop.
 */
export function compare(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "present":
      return !isBlank(actual);
    case "absent":
      return isBlank(actual);
    default:
      break;
  }

  if (isBlank(actual)) return false;

  switch (operator) {
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const left = asNumber(actual);
      const right = asNumber(expected);
      if (left === undefined || right === undefined) return false;
      if (operator === "lt") return left < right;
      if (operator === "lte") return left <= right;
      if (operator === "gt") return left > right;
      return left >= right;
    }
    case "eq":
    case "neq": {
      const left = asNumber(actual);
      const right = asNumber(expected);
      const same =
        left !== undefined && right !== undefined
          ? left === right
          : typeof actual === "boolean" || typeof expected === "boolean"
            ? asBoolean(actual) === asBoolean(expected)
            : String(actual).toLowerCase() === String(expected).toLowerCase();
      return operator === "eq" ? same : !same;
    }
    case "contains":
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    default:
      return false;
  }
}

/** How a condition reads back as a sentence, for the flow canvas and the trace. */
export function describe(factLabel: string, operator: string, expected: unknown): string {
  const op = OPERATORS[operator];
  if (!op) return factLabel;
  return op.needsValue ? `${factLabel} ${op.label} ${expected}` : `${factLabel} ${op.label}`;
}
