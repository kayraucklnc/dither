import { z } from "zod";

import { FACT_TYPES } from "@/lib/facts";

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
  /**
   * Several of the same list at once, kept as an array.
   *
   * A calendar widget showing work and family together is one widget asking
   * one question, not two widgets overlapping - so the answer is a list, and
   * everything downstream sorts it before it becomes a cache key.
   */
  "multiselect",
  /** Typed into, with matches from a source. For lists too long to open. */
  "search",
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
   * Where the choices come from, when the code already knows them: which
   * operators answer for a city, which stations exist. Resolved server-side,
   * so a manifest never has to list three hundred stations.
   *
   * See lib/fields/sources.ts. The source declares what narrows it, so
   * `depends_on` is not needed alongside.
   */
  options_from: z.string().optional(),
  /**
   * Hide this field unless the current settings can do the named thing - a
   * metro board has no destination and no platform, and a field for something
   * the operator ignores is worse than a missing one.
   */
  needs_capability: z.string().optional(),
  /**
   * Hide this field unless another answer has one of these values.
   *
   * This is what makes a settings form follow the choice already made rather
   * than showing every question at once: pick "money taken" and a window
   * appears; pick "how many subscribers" and it does not, because there is no
   * such thing as subscribers over the last seven days.
   *
   * `field` is another field's keyname, or the reserved word `design` for the
   * style the widget is drawn with - so a design can bring its own settings.
   */
  visible_when: z
    .object({ field: z.string().min(1), any_of: z.array(z.string()).min(1) })
    .optional(),
  /**
   * True when this answer only changes how the widget is *drawn*, never what
   * is fetched for it.
   *
   * An answer is cached by the question that produced it, and the question is
   * every setting the widget carries - so without this, choosing bars instead
   * of a line asks Stripe a second time for numbers it has already given us.
   * Six revenue widgets on one screen must cost one trip, and they only do if
   * the presentational half of their settings is left out of the question.
   *
   * The default is false, meaning "this changes the answer", because that is
   * the safe way round: a field wrongly marked presentational makes two
   * widgets share one answer, and two weather widgets showing one city is a
   * worse failure than one extra fetch.
   */
  presentation: z.boolean().default(false),
  min: z.number().optional(),
  max: z.number().optional(),
});

export type Field = z.infer<typeof fieldSchema>;

/**
 * A value a check can compare. Types and operators live in lib/facts so the
 * device, the clock and every extension declare facts in one vocabulary.
 */
export const factSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(FACT_TYPES),
  /** Dotted path into the widget's fetched payload. A numeric step indexes an array. */
  path: z.string().min(1),
  unit: z.string().default(""),
});

export type { Fact, FactType } from "@/lib/facts";

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

/**
 * A notice an extension suggests emitting from its own data.
 *
 * Adding the extension as a source offers these, so "tell me when there is a
 * service alert" is a checkbox rather than a rule you have to compose. The
 * text is Liquid over the source's payload, so it can quote the alert itself.
 */
export const NOTICE_LEVELS = ["info", "warn", "urgent"] as const;
export type NoticeLevel = (typeof NOTICE_LEVELS)[number];

export const noticeSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().default("alert"),
  /** Liquid, rendered against the source's payload. */
  text: z.string().min(1),
  /** info is worth knowing, warn is worth noticing, urgent is worth acting on. */
  level: z.enum(NOTICE_LEVELS).default("warn"),
  /** Prefer a widget of this same extension when the screen has one. */
  placement: z.enum(["screen", "source"]).default("screen"),
  when: z.object({
    fact: z.string().min(1),
    operator: z.string().default("present"),
    value: z.unknown().optional(),
  }),
});

export type NoticeSuggestion = z.infer<typeof noticeSchema>;

/**
 * One design: a template, and the sizes it will be drawn at.
 *
 * A design is not a size - it is a look, offered across a range of sizes. Two
 * designs whose ranges overlap are two styles of the same widget at the same
 * size, and the widget picks between them. Where a manifest declares nothing,
 * a template named after one of the original shapes gets that shape's range,
 * so every extension written before this kept working unedited.
 *
 * `columns` and `rows` are [smallest, largest] out of twelve.
 */
export const designSchema = z.object({
  /** Template stem under templates/, or `full` for the root template. */
  template: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().default(""),
  columns: z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(12)]),
  rows: z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(12)]),
  /** The size it was really drawn for. Decides which design wins a tie. */
  nominal: z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(12)]).optional(),
  /**
   * Seconds between one drawing of this design and a different-looking one,
   * for a design that draws the clock. Zero, the default, means the picture
   * only changes when the data does.
   *
   * This is the honest half of drawing time on a panel that wakes every
   * quarter of an hour. A design that shows the time to the minute has to say
   * `tick: 60` or it is served a picture from the last time its data moved -
   * which, for a clock, is never. A design that shows the time as a band
   * across a quarter of an hour says `tick: 900` and is redrawn four times an
   * hour, because that is how often it would look different.
   */
  tick: z.number().int().min(0).max(86_400).default(0),
});

export type DesignDeclaration = z.infer<typeof designSchema>;

export const manifestSchema = z.object({
  version: z.string().default("1.0.0"),
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().default(""),
  /**
   * static     - renders from settings alone, fetches nothing.
   * poll       - calls the URLs in `exchanges` on a schedule.
   * transit    - answered by a provider in code rather than a declared URL.
   * gallery    - answered by the pictures on this machine's own disk.
   * connection - answered by an account you linked once under Connections.
   */
  kind: z.enum(["static", "poll", "transit", "gallery", "connection"]).default("static"),
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

  /**
   * The looks this extension offers, and the sizes each covers. Empty means
   * every template is named after one of the original shapes and takes that
   * shape's range.
   */
  designs: z.array(designSchema).default([]),

  fields: z.array(fieldSchema).default([]),
  /** Where "what can these settings do" is answered, for `needs_capability`. */
  capabilities_from: z.string().optional(),
  facts: z.array(factSchema).default([]),
  notices: z.array(noticeSchema).default([]),
  /**
   * Whether this extension's designs have somewhere to show a notice from
   * another extension. False means notices are simply never routed here - the
   * hook is offered, not imposed.
   */
  accepts_notices: z.boolean().default(false),
  /**
   * How many notices a design of this extension can show before it is
   * crowded. Overflow is summarised rather than squeezed, because six alerts
   * in a band is six unreadable alerts.
   */
  notice_capacity: z.number().int().min(1).max(8).default(4),
  exchanges: z.array(exchangeSchema).default([]),

  /**
   * Stand-in data, used only for previews and only until something real has
   * been fetched. It is what lets you design a screen before you own the
   * hardware, and it is never served to a device.
   */
  sample: z.record(z.string(), z.unknown()).default({}),
});

export type Manifest = z.infer<typeof manifestSchema>;
