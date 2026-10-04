// The runtime JSON of docs/format.md §2 — what the firmware runs, and what the
// simulator runs with it. Field names are short because this travels to a
// microcontroller; the editor never builds these by hand, the compiler does.

export type Value = null | number | string | boolean | number[];
export type Values = ReadonlyMap<string, Value>;

export type Op =
  | "eq" | "ne" | "lt" | "le" | "gt" | "ge"
  | "between" | "in" | "contains" | "present" | "absent" | "true" | "false";

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { v: string; op: Op; x?: unknown; f?: Format };

export interface Format {
  shift?: { v: string; scale?: number };
  until?: boolean;
  scale?: number;
  add?: number;
  steps?: { t: number[]; o: string[] };
  map?: { k: (number | string)[]; o: string[]; d?: string };
  num?: { d: number; sep?: string };
  time?: string;
  upper?: boolean;
  tr?: boolean;
  fallback?: string;
}

export type Part = string | { v: string; f?: Format } | { k: Value; f?: Format };

interface Base {
  c?: 0 | 1;
  when?: Condition;
}

export type Element =
  | (Base & { t: "rect"; x: number; y: number; w: number; h: number; fill?: boolean; stroke?: number; r?: number })
  | (Base & { t: "circle"; x: number; y: number; r: number; fill?: boolean; stroke?: number })
  | (Base & { t: "line"; x1: number; y1: number; x2: number; y2: number; w?: number })
  | (Base & { t: "hand"; x: number; y: number; len: number; w?: number; v: string; max: number })
  | (Base & {
      t: "text"; x: number; y: number; w: number; h: number; font: number;
      a?: "l" | "c" | "r"; va?: "t" | "m" | "b"; parts: Part[]; wrap?: boolean; lines?: number;
    })
  | (Base & { t: "bitmap"; x: number; y: number; a: number })
  | (Base & { t: "icon"; x: number; y: number; w: number; h: number; v: string; f?: Format; set: Record<string, number> })
  | (Base & { t: "bar"; x: number; y: number; w: number; h: number; v: string; min: number; max: number; dir?: "r" | "u" })
  | (Base & {
      t: "chart"; x: number; y: number; w: number; h: number; v: string;
      kind: "bars" | "line"; min?: number; max?: number; gap?: number; lw?: number;
    });

export type ElementOf<T extends Element["t"]> = Extract<Element, { t: T }>;

export interface SourceValue {
  key: string;
  path: string;
  count?: number;
  agg?: "sum" | "count";
  /** For `agg: "sum"`: the path inside each element to add up. */
  field?: string;
}

export interface SourceAuth {
  url: string;
  form: [string, string][];
  token: string;
  expires?: string;
}

export interface Source {
  id: string;
  url: string;
  headers?: [string, string][];
  auth?: SourceAuth;
  decode?: { aes256ecb: string };
  every: number;
  values: SourceValue[];
}

export interface Screen {
  name: string;
  refresh?: number;
  elements: Element[];
}

export interface Rule {
  screen: number;
  when: Condition | null;
}

export interface Locale {
  days: string[];
  daysShort: string[];
  months: string[];
  monthsShort: string[];
}

export interface Runtime {
  v: 1;
  board: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  wifi: { ssid: string; pass: string }[];
  tz: string;
  ntp: string;
  locale: Locale;
  refresh: number;
  quiet?: { from: number; to: number };
  sources: Source[];
  screens: Screen[];
  rules: Rule[];
  assets: [number, number][];
}
