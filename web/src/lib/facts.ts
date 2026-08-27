/**
 * Facts are how anything makes itself available to a check.
 *
 * There is exactly one kind of check in Dither: compare a value from a source.
 * Not "battery below", not "between two times", not "data is stale" - those
 * were separate check kinds once, and the list read as a grab bag because it
 * mixed device telemetry, the clock, and fetched data into one dropdown while
 * still being unable to express anything new.
 *
 * Now the device is a source, the clock is a source, and every trigger you add
 * is a source. A connection that reports whether your laptop is awake declares
 * `online: boolean` and you can branch on it immediately - no new check kind,
 * no change to the editor, no change to the engine.
 *
 * The declared type decides which comparisons are offered, so a rule that could
 * never be true is not constructible.
 */

export const FACT_TYPES = ["duration", "number", "text", "boolean", "time", "weekday"] as const;
export type FactType = (typeof FACT_TYPES)[number];

export interface Fact {
  key: string;
  label: string;
  type: FactType;
  /** Dotted path into the source's payload. A numeric step indexes an array. */
  path: string;
  unit: string;
  /**
   * For a countdown: the dotted path to the *instant* it counts down to.
   *
   * A fetched payload is a photograph. "Next meeting in 30 minutes" was true
   * when the provider was asked and is a lie a quarter of an hour later, so a
   * check that compares the stored number is comparing against whenever the
   * last fetch happened rather than against now - and it never stops being
   * true, because a number in a row does not tick. Given the instant instead,
   * the value is worked out at the moment the question is asked, and it reads
   * as nothing once that instant has gone by: a meeting that has started is
   * not the next meeting, it is this one.
   *
   * The path may hold epoch seconds, epoch milliseconds, or anything `Date`
   * can parse. `path` stays declared, and is what a design draws.
   */
  until?: string;
}

/** How many operands the editor should ask for. */
export type Arity = "none" | "one" | "range" | "set";

export interface Operator {
  id: string;
  label: string;
  arity: Arity;
}

export const OPERATORS: Record<string, Operator> = {
  lt: { id: "lt", label: "is less than", arity: "one" },
  lte: { id: "lte", label: "is at most", arity: "one" },
  gt: { id: "gt", label: "is more than", arity: "one" },
  gte: { id: "gte", label: "is at least", arity: "one" },
  eq: { id: "eq", label: "is", arity: "one" },
  neq: { id: "neq", label: "is not", arity: "one" },
  contains: { id: "contains", label: "contains", arity: "one" },
  present: { id: "present", label: "has any value", arity: "none" },
  absent: { id: "absent", label: "is empty", arity: "none" },
  is_true: { id: "is_true", label: "is yes", arity: "none" },
  is_false: { id: "is_false", label: "is no", arity: "none" },
  between: { id: "between", label: "is between", arity: "range" },
  before: { id: "before", label: "is before", arity: "one" },
  after: { id: "after", label: "is after", arity: "one" },
  is_one_of: { id: "is_one_of", label: "is one of", arity: "set" },
};

const OPERATORS_FOR: Record<FactType, string[]> = {
  duration: ["lt", "lte", "gt", "gte", "present", "absent"],
  number: ["lt", "lte", "gt", "gte", "eq", "neq", "present", "absent"],
  text: ["contains", "eq", "neq", "present", "absent"],
  boolean: ["is_true", "is_false"],
  time: ["between", "before", "after"],
  weekday: ["is_one_of"],
};

export function operatorsFor(type: FactType): Operator[] {
  return (OPERATORS_FOR[type] ?? []).map((id) => OPERATORS[id]);
}

export function defaultOperator(type: FactType): string {
  return OPERATORS_FOR[type]?.[0] ?? "present";
}

/** A sensible starting operand, so a new check is never in a broken state. */
export function defaultValue(type: FactType): unknown {
  switch (type) {
    case "time":
      return ["07:00", "09:00"];
    case "weekday":
      return [1, 2, 3, 4, 5];
    case "duration":
    case "number":
      return 0;
    default:
      return "";
  }
}

/**
 * Resolve a dotted path against a source's payload. A numeric step indexes an
 * array, so `transit.departures.0.minutes_until` reads the next train.
 */
export function valueAt(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, step) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) return /^\d+$/.test(step) ? current[Number(step)] : undefined;
    if (typeof current === "object") return (current as Record<string, unknown>)[step];
    return undefined;
  }, data);
}

/**
 * Write a value at a dotted path, creating objects on the way.
 *
 * Used to pretend: "what would the tree do if the rain chance were 80?". The
 * override goes into a copy of the payload rather than beside it, so nothing
 * downstream needs to know it is being lied to.
 */
export function setAt(data: unknown, path: string, value: unknown): unknown {
  const steps = path.split(".");
  const root: Record<string, unknown> =
    data && typeof data === "object" && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>) }
      : {};

  let current = root;

  for (const [index, step] of steps.entries()) {
    if (index === steps.length - 1) {
      current[step] = value;
      break;
    }

    const next = current[step];
    current[step] =
      next && typeof next === "object" && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};

    current = current[step] as Record<string, unknown>;
  }

  return root;
}

/**
 * An instant at a dotted path, in epoch milliseconds.
 *
 * Epoch *seconds* is what the payloads carry - `at_epoch` is a Unix timestamp
 * - so a bare number small enough to be seconds is read as seconds. The cutoff
 * is 1e11, which as milliseconds is 1973 and as seconds is the year 5138:
 * nothing a calendar or a timetable can hold falls on the wrong side of it.
 */
export function instantAt(data: unknown, path: string): number | undefined {
  const value = valueAt(data, path);

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Math.abs(value) < 1e11 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value.trim());
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

/**
 * What a check actually sees, asked at the moment it is asked.
 *
 * Everything except a countdown is read straight out of the payload. A
 * countdown is recomputed here rather than trusted, because the stored one
 * stopped at the last fetch - see `until`. The one place both the tree and the
 * dashboard read a fact, so the number on the canvas is the number the panel
 * decided on.
 */
export function readFact(fact: Fact, payload: unknown, now: Date): unknown {
  if (!fact.until) return valueAt(payload, fact.path);

  const at = instantAt(payload, fact.until);
  // Nothing to count down to, or it has already gone by. Either way there is
  // no answer, and every operator in `compare` reads that as false.
  if (at === undefined || at <= now.getTime()) return undefined;

  return Math.round((at - now.getTime()) / 60_000);
}

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A fact's current value, for a human. `—` when there is not one. */
export function showFact(fact: Fact, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (fact.type === "boolean") return value ? "yes" : "no";
  if (fact.type === "weekday") return DAYS_SHORT[Number(value)] ?? String(value);

  return String(value);
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

const asBoolean = (value: unknown): boolean =>
  typeof value === "boolean"
    ? value
    : typeof value === "string"
      ? value === "true" || value === "1" || value === "yes"
      : Boolean(value);

/** Minutes past midnight, from "HH:MM" or a number already in minutes. */
export function asMinutes(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

/**
 * Compare a fact's current value against what a check asks for.
 *
 * Missing data answers false rather than throwing. A display whose weather
 * provider is down should keep showing the previous screen, not go blank.
 */
export function compare(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "present":
      return !isBlank(actual);
    case "absent":
      return isBlank(actual);
    case "is_true":
      return asBoolean(actual);
    case "is_false":
      return !isBlank(actual) && !asBoolean(actual);
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
          : String(actual).toLowerCase() === String(expected).toLowerCase();
      return operator === "eq" ? same : !same;
    }

    case "contains":
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());

    case "between": {
      const now = asMinutes(actual);
      const range = Array.isArray(expected) ? expected : [];
      const from = asMinutes(range[0]);
      const to = asMinutes(range[1]);
      if (now === undefined || from === undefined || to === undefined) return false;

      // A window that ends before it starts has wrapped past midnight.
      return from <= to ? now >= from && now < to : now >= from || now < to;
    }

    case "before": {
      const now = asMinutes(actual);
      const mark = asMinutes(expected);
      return now !== undefined && mark !== undefined && now < mark;
    }

    case "after": {
      const now = asMinutes(actual);
      const mark = asMinutes(expected);
      return now !== undefined && mark !== undefined && now >= mark;
    }

    case "is_one_of": {
      const set = Array.isArray(expected) ? expected.map(String) : [String(expected)];
      return set.includes(String(actual));
    }

    default:
      return false;
  }
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** How an operand reads in a sentence. */
export function describeValue(type: FactType, operator: string, value: unknown): string {
  if (operator === "between" && Array.isArray(value)) return `${value[0]} and ${value[1]}`;

  if (type === "weekday") {
    const days = (Array.isArray(value) ? value : [value]).map((day) => DAYS[Number(day)] ?? day);
    return days.length > 2 ? `${days.slice(0, -1).join(", ")} or ${days.at(-1)}` : days.join(" or ");
  }

  return String(value);
}

/** How a whole check reads back, for the canvas and the trace. */
export function describe(fact: Fact, operator: string, expected: unknown): string {
  const op = OPERATORS[operator];
  if (!op) return fact.label;

  return op.arity === "none"
    ? `${fact.label} ${op.label}`
    : `${fact.label} ${op.label} ${describeValue(fact.type, operator, expected)}`;
}
