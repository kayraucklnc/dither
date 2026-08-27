import { z } from "zod";

/**
 * What an extension declares about itself.
 *
 * An extension is code. It ships in `extensions/<name>/` and is read at boot;
 * there is no "new extension" button and nothing here is editable from the
 * dashboard. What the dashboard edits is a *widget* - one use of an extension,
 * with its own answers to the fields declared below.
 *
 * Everything a good UI needs has to be declarable here, because the dashboard
 * builds itself out of this: the settings form comes from `fields`, the sizes
 * you may draw come from the templates on disk, and the triggers you may build
 * come from `facts`.
 */

/** Field kinds the generated settings form knows how to draw. */
export const FIELD_TYPES = [
  "string",
  "text",
  "number",
  "boolean",
  "select",
  "time",
  "url",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldSchema = z.object({
  keyname: z.string().min(1),
  name: z.string().min(1),
  field_type: z.enum(FIELD_TYPES).default("string"),
  default: z.unknown().optional(),
  help_text: z.string().default(""),
  optional: z.boolean().default(false),
  /** For `select`. Either plain values or labelled ones. */
  options: z
    .array(z.union([z.string(), z.object({ value: z.string(), label: z.string() })]))
    .optional(),
  /**
   * Narrows the choices of one field by the value of another: a city list that
   * depends on the country picked above it. The dashboard reloads the options
   * when the named field changes.
   */
  depends_on: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export type Field = z.infer<typeof fieldSchema>;

/** The value types a fact can hold, and what may be asked about each. */
export const FACT_TYPES = ["duration", "number", "text", "boolean"] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const factSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(FACT_TYPES),
  /** Dotted path into the widget's fetched payload. A numeric step indexes an array. */
  path: z.string().min(1),
  unit: z.string().default(""),
});

export type Fact = z.infer<typeof factSchema>;

/**
 * One HTTP call a `poll` extension makes to get its data.
 *
 * The URL is itself a Liquid template evaluated against the widget's settings,
 * which is what lets two weather widgets on one screen fetch two cities. The
 * answers arrive in the template context as `source_1`, `source_2` and so on,
 * numbered by their order here.
 */
export const exchangeSchema = z.object({
  verb: z.string().default("get"),
  template: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
});

export type Exchange = z.infer<typeof exchangeSchema>;

export const manifestSchema = z.object({
  version: z.string().default("1.0.0"),
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(""),
  /**
   * static     - renders from settings alone, fetches nothing.
   * poll       - calls the URLs in `exchanges` on a schedule.
   * transit    - answered by a provider in code rather than a declared URL.
   * connection - answered by an account you linked once under Connections.
   */
  kind: z.enum(["static", "poll", "transit", "connection"]).default("static"),
  /**
   * The connection this extension needs, when kind is "connection". One linked
   * account serves every widget that names it, so linking Google once gives
   * every calendar widget on every screen its data.
   */
  connection: z.string().optional(),
  mode: z.string().default("text"),
  tags: z.array(z.string()).default([]),

  /** How often data is refetched. `unit: none` means never. */
  interval: z.number().default(15),
  unit: z.enum(["none", "minute", "hour", "day"]).default("minute"),

  fields: z.array(fieldSchema).default([]),
  facts: z.array(factSchema).default([]),
  exchanges: z.array(exchangeSchema).default([]),

  /**
   * Stand-in data, used only for previews and only until something real has
   * been fetched. It is what lets you design a screen before you own the
   * hardware, and it is never served to a device.
   */
  sample: z.record(z.string(), z.unknown()).default({}),
});

export type Manifest = z.infer<typeof manifestSchema>;
