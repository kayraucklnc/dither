// The project: everything the editor knows, saved to a file, to the browser,
// and (gzipped) onto the panel itself. The compiler turns it into the runtime
// of docs/format.md; nothing here travels to the firmware directly.

import { z } from "zod";

export const PROJECT_VERSION = 1;

const id = z.string().min(1).max(64);

export const widgetSchema = z.object({
  id,
  type: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  frame: z.enum(["none", "outline", "inverted"]).default("none"),
  settings: z.record(z.string(), z.unknown()).default({}),
});

export const screenSchema = z.object({
  id,
  name: z.string().max(60),
  widgets: z.array(widgetSchema).default([]),
});

export const checkSchema = z.object({
  /** What is checked: a fact id from the catalog, e.g. `time`, `weekday`, `<widget>:rain`. */
  fact: z.string().min(1),
  op: z.string().min(1),
  value: z.unknown().optional(),
});

export const ruleSchema = z.object({
  id,
  screenId: id,
  match: z.enum(["all", "any"]).default("all"),
  checks: z.array(checkSchema).default([]),
  enabled: z.boolean().default(true),
});

/** Shown on top of whatever screen is up while its checks hold — first match wins. */
export const alertSchema = z.object({
  id,
  enabled: z.boolean().default(true),
  match: z.enum(["all", "any"]).default("any"),
  checks: z.array(checkSchema).default([]),
  icon: z.string().default("circle-alert"),
  text: z.string().max(80).default(""),
  /** A fact whose value is printed after the text, e.g. the delay in minutes. */
  value: z.string().nullable().default(null),
  style: z.enum(["banner", "takeover"]).default("banner"),
});

/** Accounts the panel signs in to, linked once in Panel settings and shared by every widget. */
export const googleLinkSchema = z.object({
  /** Stable id a widget refers to; the email when Google gives one. */
  id: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  refreshToken: z.string(),
  email: z.string().default(""),
  /** What the panel calls this account, e.g. "Work". */
  label: z.string().max(24).default(""),
});

export const accountsSchema = z.object({
  // Projects saved before several accounts were possible hold one link, or none.
  google: z.preprocess(
    (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [{ id: (v as { email?: string }).email || "google", ...(v as object) }]),
    z.array(googleLinkSchema),
  ).default([]),
  stripe: z.object({ key: z.string(), name: z.string().default("") }).nullable().default(null),
});

export const wifiSchema = z.object({
  ssid: z.string().max(32),
  password: z.string().max(64).default(""),
});

export const placeSchema = z.object({
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const projectSchema = z.object({
  version: z.literal(PROJECT_VERSION),
  name: z.string().max(80).default("My panel"),
  board: z.string().default("xiao-epaper-75"),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  timezone: z.string().default("UTC"),
  language: z.string().default("en"),
  units: z.enum(["metric", "imperial"]).default("metric"),
  place: placeSchema.nullable().default(null),
  wifi: z.array(wifiSchema).default([]),
  accounts: accountsSchema.default({ google: [], stripe: null }),
  refreshMinutes: z.number().int().min(1).max(1440).default(15),
  quiet: z.object({ enabled: z.boolean(), from: z.string(), to: z.string() })
    .default({ enabled: false, from: "23:00", to: "07:00" }),
  screens: z.array(screenSchema).min(1),
  defaultScreenId: id,
  rules: z.array(ruleSchema).default([]),
  alerts: z.array(alertSchema).default([]),
  /** Pictures placed by the image widget, as 1-bit DBMP in base64, keyed by id. */
  images: z.record(z.string(), z.string()).default({}),
});

export type Widget = z.infer<typeof widgetSchema>;
export type ScreenDef = z.infer<typeof screenSchema>;
export type Check = z.infer<typeof checkSchema>;
export type RuleDef = z.infer<typeof ruleSchema>;
export type AlertDef = z.infer<typeof alertSchema>;
export type Wifi = z.infer<typeof wifiSchema>;
export type Accounts = z.infer<typeof accountsSchema>;
export type GoogleLink = z.infer<typeof googleLinkSchema>;
export type AccountKind = keyof Accounts;
export type Place = z.infer<typeof placeSchema>;
export type Project = z.infer<typeof projectSchema>;

export function parseProject(input: unknown): Project {
  const result = projectSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`This is not a Dither project (${first?.path.join(".") || "root"}: ${first?.message}).`);
  }
  const p = result.data;
  if (!p.screens.some((s) => s.id === p.defaultScreenId)) return { ...p, defaultScreenId: p.screens[0].id };
  return p;
}
