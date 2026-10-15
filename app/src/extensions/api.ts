// What an extension is. Read this file before writing one — it is the whole API.
//
// An extension runs in the browser, at compile time. It is handed a box and its
// settings and *draws* with the `Draw` helpers; anything that should change on
// the panel between flashes (the time, a temperature) is drawn as a binding to
// a value, and the panel fills it in when it wakes. So an extension can do any
// arithmetic it likes about layout, and the firmware never needs to know it
// exists.

import type { Condition, Format, Geo, Part, Value } from "@/runtime/types";
import type { AccountKind, Accounts, Place } from "@/project/schema";
import type { Weight } from "@/assets/library";

// ---------------------------------------------------------------- settings

interface FieldBase {
  key: string;
  label: string;
  help?: string;
  /** Hide the field unless this holds for the current settings. */
  visible?: (settings: Record<string, unknown>) => boolean;
}

export type Field =
  | (FieldBase & { kind: "text"; placeholder?: string; multiline?: boolean })
  | (FieldBase & { kind: "number"; min?: number; max?: number; step?: number; unit?: string })
  | (FieldBase & { kind: "select"; options: { value: string; label: string }[] })
  | (FieldBase & { kind: "toggle" })
  | (FieldBase & { kind: "place" })
  | (FieldBase & { kind: "date" })
  | (FieldBase & { kind: "secret"; placeholder?: string })
  | (FieldBase & { kind: "image" })
  /** Several pictures, in order: the user's own and prints from the collection. */
  | (FieldBase & { kind: "images" })
  | (FieldBase & { kind: "icon" })
  | (FieldBase & { kind: "list"; placeholder?: string })
  /** Type to find one of many options — stations, stops, symbols. */
  | (FieldBase & { kind: "search"; placeholder?: string; options: () => readonly { value: string; label: string; hint?: string }[] })
  /**
   * A choice whose options come from somewhere else — an account's calendars, say.
   * The chosen option's label is kept too, as `<key>Name`.
   */
  /** Which linked Google accounts to show, and which calendar of each. */
  | (FieldBase & { kind: "calendars" })
  | (FieldBase & { kind: "remote-select"; load: (env: Env, settings: Record<string, unknown>) => Promise<{ value: string; label: string }[]> });

// ---------------------------------------------------------------- data

/**
 * One HTTP GET the panel makes, and the values it keeps from the answer.
 * `url` and header values may use `{{now|PATTERN}}` placeholders (docs/format.md).
 */
export interface SourceSpec {
  url: string;
  headers?: [string, string][];
  /** OAuth 2 refresh: the panel trades this form for a bearer token. */
  auth?: { url: string; form: [string, string][]; token: string; expires?: string };
  /** The reply is AES-256-ECB; the key as 64 hex digits. */
  decode?: { aes256ecb: string };
  /** The answer is a web page: its values' paths are `text` (the page as plain text) or `title`. */
  html?: boolean;
  /**
   * The server refuses browsers (no CORS). The preview then never asks: a
   * refused request still reaches the server and spends the panel's share of
   * its limit. The panel is not affected; it is not written into the blob.
   */
  panelOnly?: string;
  /** Minutes between fetches. */
  every: number;
  /**
   * Value key → JSON path; `{ path, count }` for a series of numbers;
   * `{ path, agg: "sum", field }` or `{ path, agg: "count" }` for a total over a list.
   */
  values: Record<string,
    | string
    | { path: string; count: number }
    | { path: string; agg: "sum" | "count"; field?: string }
    | { path: string; agg: "buckets"; field: string; time: string; by: "day" | "hour"; count: number }>;
}

export interface MergeSpec {
  from: string[];
  fields: string[];
  count: number;
  skip?: string[];
  sort?: string[];
  unique?: string[];
  /** Adds `dist` (km) and `brg` (degrees from north) to each record. */
  geo?: Geo;
}

/** Something a rule can check, e.g. "Rain chance today". */
export type Fact =
  | {
      key: string; label: string; type: "number"; value: string; unit?: string;
      /** Applied before comparing — `{ until: true }` turns a time into minutes from now. */
      format?: Format;
    }
  | { key: string; label: string; type: "boolean"; value: string }
  | {
      key: string; label: string; type: "flag";
      /** A yes/no worked out on the panel. References without a dot are this widget's values. */
      test: Condition;
    }
  | { key: string; label: string; type: "text"; value: string }
  | {
      key: string; label: string; type: "choice"; value: string;
      /** Each choice matches a set of raw values, e.g. "Rain" → weather codes 51–67. */
      choices: { id: string; label: string; match: (string | number)[] }[];
    };

// ---------------------------------------------------------------- drawing

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Content = string | Part | (string | Part)[];

export interface TextOptions extends Box {
  size: number;
  weight?: Weight;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  lines?: number;
  white?: boolean;
}

export interface PictureOptions {
  fit?: "cover" | "contain";
  dither?: "floyd" | "atkinson" | "threshold";
  /** -100 … 100. */
  contrast?: number;
  brightness?: number;
}

/**
 * Where a placed group lands: the values of `x` and `y` (this widget's keys)
 * within their ranges, scaled onto `box`. `ys: [north, south]` puts north up.
 */
export interface BoxPlacement {
  x: string;
  y: string;
  box: Box;
  xs: [number, number];
  ys: [number, number];
}

/**
 * A point of the Earth on a globe seen from space: `lat` and `lon` (this
 * widget's keys) on a globe turned to `globe: [lat, lon]`, drawn around
 * `centre` with radius `r`. `side: "front"` shows it only on the near
 * hemisphere, `"back"` only behind; a larger `r` lifts it into orbit.
 */
export interface GlobePlacement {
  lat: string;
  lon: string;
  globe: [number, number];
  centre: { x: number; y: number };
  r: number;
  side?: "front" | "back" | "any";
}

export type Placement = BoxPlacement | GlobePlacement;

export interface Draw {
  /** The widget's own box, origin at 0,0. Draw in these coordinates. */
  readonly width: number;
  readonly height: number;

  // Bindings.
  /** A value from this widget's source, optionally formatted. */
  value(key: string, format?: Format): Part;
  /** A reference to one of this widget's values, for bars, charts and icons. */
  ref(key: string): string;
  /** The current time, formatted with tokens like `HH:mm` or `dddd D MMMM`. */
  time(pattern: string): Part;
  /** A fixed value through a format — a typed date counted down, say. */
  constant(value: Value, format: Format): Part;

  // Shapes.
  text(content: Content, options: TextOptions): void;
  icon(name: string, box: Box, options?: { white?: boolean }): void;
  /** An icon chosen when the panel wakes: `pick` turns the value into an icon name. */
  iconFor(key: string, pick: Format, names: string[], box: Box, options?: { white?: boolean }): void;
  rect(box: Box, options?: { fill?: boolean; stroke?: number; radius?: number; white?: boolean }): void;
  circle(x: number, y: number, r: number, options?: { fill?: boolean; stroke?: number; white?: boolean }): void;
  line(x1: number, y1: number, x2: number, y2: number, options?: { width?: number; white?: boolean }): void;
  hand(x: number, y: number, length: number, ref: string, max: number, options?: { width?: number }): void;
  bar(box: Box, ref: string, min: number, max: number, options?: { vertical?: boolean }): void;
  /**
   * `labels` writes each point's value, through `format`, in a white box riding
   * just above the point — leave about a line of room above the box. `every`
   * labels one point in so many, always including the last.
   */
  chart(box: Box, ref: string, options?: {
    kind?: "bars" | "line" | "steps" | "area"; min?: number; max?: number; gap?: number; width?: number; smooth?: boolean;
    labels?: { size: number; weight?: Weight; format?: Format; every?: number; before?: string; after?: string };
  }): void;
  image(imageId: string, box: Box, options?: PictureOptions): void;
  /**
   * Everything drawn inside `fn` is placed by two values when the panel wakes:
   * draw it around (0, 0), and it lands where `at` puts it. Nothing shows while
   * either value is missing or out of its range. A plane on a radar, say.
   */
  place(at: Placement, fn: () => void): void;
  /**
   * A bitmap the widget draws itself when the project compiles — a globe, say.
   * `ink(x, y)` is asked for every pixel of the box; set pixels draw, the rest
   * are left as they are. `key` names it: the same key and size reuse it.
   */
  bitmap(box: Box, key: string, ink: (x: number, y: number) => boolean): void;
  /**
   * Everything drawn inside `fn` only shows when `condition` holds on the panel.
   * References without a dot are this widget's own values.
   */
  when(condition: Condition, fn: () => void): void;

  // Measuring, at compile time.
  measure(text: string, size: number, weight?: Weight): number;
  lineHeight(size: number, weight?: Weight): number;
  /** Ascent and descent in pixels, to sit different sizes on one baseline. */
  metrics(size: number, weight?: Weight): { ascent: number; descent: number; lineHeight: number };
  /** The largest font size at which every one of `texts` fits `w` × `h`. */
  fit(texts: string[], w: number, h: number, options?: { weight?: Weight; min?: number; max?: number }): number;
  /** How many lines `text` takes when wrapped to `w` at this size. */
  linesFor(text: string, size: number, w: number, weight?: Weight): number;
}

// ---------------------------------------------------------------- extension

export interface Env {
  units: "metric" | "imperial";
  place: Place | null;
  language: string;
  /** IANA zone, e.g. "Europe/Rome" — for examples that must be in the panel's local time. */
  timezone: string;
  /** Linked in Panel settings; shared by every widget. Never put credentials in a widget's settings. */
  accounts: Accounts;
}

export interface Extension<S extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: string;
  description: string;
  /** A Lucide icon name for the gallery. */
  icon: string;
  category: "time" | "weather" | "data" | "text" | "picture" | "device";
  /** Accounts this widget cannot work without. Until they are linked, it cannot be added. */
  requires?: AccountKind[];
  /** Size on the grid, in cells. */
  size: { min: [number, number]; default: [number, number] };
  fields: Field[];
  defaults: (env: Env) => S;
  /**
   * What to fetch. `null` when the settings are not complete enough to ask.
   * Several sources are named — `{ work: …, home: … }` — and their values are
   * then keyed `work/t0`, `home/t0` everywhere (draw, facts, sample).
   */
  source?: (settings: S, env: Env) => SourceSpec | Record<string, SourceSpec> | null;
  /**
   * Lists built on the panel from several of this widget's sources — every
   * account's calendar as one agenda. Keyed by a name its values are read
   * under (`all/t0`); `from` names this widget's sources. See docs/format.md "Merges".
   */
  merges?: (settings: S, env: Env) => Record<string, MergeSpec>;
  /** Settings for the gallery's picture of a widget that shows nothing until it is set up. */
  example?: Partial<S>;
  /** Plausible values for the preview before anything has been fetched. */
  sample?: (settings: S, env: Env) => Record<string, Value>;
  facts?: (settings: S, env: Env) => Fact[];
  /** Minutes between redraws this widget needs, e.g. 1 for a clock. */
  refresh?: (settings: S) => number;
  /** A short label for this placement, e.g. "Weather · Milan". */
  title?: (settings: S, env: Env) => string;
  draw: (d: Draw, settings: S, env: Env) => void;
}

export function defineExtension<S extends Record<string, unknown>>(e: Extension<S>): Extension<S> {
  return e;
}
