import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Hardware. A model is a panel: how many pixels, how many colours, how it
 * wants its image dithered. Devices are instances of a model.
 */
export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  colors: integer("colors").notNull().default(2),
  bitDepth: integer("bit_depth").notNull().default(1),
  /** "dither" or "direct". */
  mode: text("mode").notNull().default("dither"),
  colorCodes: jsonb("color_codes").$type<string[]>().notNull().default([]),
  rotation: integer("rotation").notNull().default(0),
  offsetX: integer("offset_x").notNull().default(0),
  offsetY: integer("offset_y").notNull().default(0),
  mimeType: text("mime_type").notNull().default("image/png"),
});

/**
 * A screen is a design: a 6x6 grid holding widgets. It is not tied to a
 * device, so the same screen can be shown by two panels of the same size.
 */
export const screens = pgTable("screens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A widget is one extension PLACED on one screen, with ITS OWN settings.
 *
 * This is the distinction the first version of Dither missed. An extension is
 * code that ships in the repository; it has no settings of its own and is
 * never edited from the dashboard. A widget is a use of that code: "Public
 * Transport, Cadorna to Saronno, top-left quarter". Put the same extension on
 * the same screen twice with different settings and you get two widgets, which
 * is the entire point - one screen showing two train routes, or the weather in
 * two cities.
 *
 * Because settings live here, fetched data lives here too: two widgets of the
 * same extension ask their provider different questions and must not share an
 * answer.
 */
export const widgets = pgTable("widgets", {
  id: serial("id").primaryKey(),
  screenId: integer("screen_id")
    .notNull()
    .references(() => screens.id, { onDelete: "cascade" }),
  /** Directory name under extensions/. The code, not a foreign key. */
  extension: text("extension").notNull(),
  /** Answers to the extension's declared fields. Validated against its schema. */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  /** Optional label so two widgets of one extension are tellable apart. */
  label: text("label").notNull().default(""),
  /**
   * Pin this widget as the screen's alert area.
   *
   * With nothing pinned the largest design that can take alerts is chosen,
   * because room is what an alert needs. Pinning exists so that is a decision
   * rather than a consequence of where things happen to sit.
   */
  hostsNotices: boolean("hosts_notices").notNull().default(false),

  /** Placement on the 6x6 grid. The shape is derived from the span. */
  column: integer("column").notNull(),
  row: integer("row").notNull(),
  columnSpan: integer("column_span").notNull(),
  rowSpan: integer("row_span").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The last answer a widget got from its data source, plus whatever went wrong
 * getting it. Kept separate from the widget so a failed fetch never destroys
 * the configuration that produced it.
 */
export const widgetData = pgTable("widget_data", {
  widgetId: integer("widget_id")
    .primaryKey()
    .references(() => widgets.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  error: text("error"),
});

/** A physical panel on the network. */
export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Device"),
  macAddress: text("mac_address").notNull().unique(),
  apiKey: text("api_key").notNull().unique(),
  modelId: integer("model_id")
    .notNull()
    .references(() => models.id),

  firmwareVersion: text("firmware_version"),
  width: integer("width"),
  height: integer("height"),

  /** Seconds between wakes when no flow state says otherwise. */
  refreshRate: integer("refresh_rate").notNull().default(900),
  imageTimeout: integer("image_timeout").notNull().default(0),

  /** Last thing the device told us about itself. */
  batteryVoltage: real("battery_voltage"),
  percentCharged: real("percent_charged"),
  usbConnected: boolean("usb_connected").notNull().default(false),
  rssi: integer("rssi"),
  wifiBand: text("wifi_band"),
  /** Why it last woke. "Button pressed." is a trigger in its own right. */
  updateSource: text("update_source"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

  /** Quiet hours, minutes past midnight, device-local. */
  sleepStartMinute: integer("sleep_start_minute"),
  sleepStopMinute: integer("sleep_stop_minute"),

  /** The top of this device's decision tree. */
  rootNodeId: integer("root_node_id"),
  /** The leaf it last landed on, and when - only used to honour a hold. */
  currentNodeId: integer("current_node_id"),
  nodeEnteredAt: timestamp("node_entered_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A source of facts a device can decide on.
 *
 * A trigger is an extension plus its own settings, owned by the device rather
 * than by a screen. That separation matters: the first version read facts off
 * whatever widget happened to be on a screen, so you could only trigger on
 * what you were already displaying, and "switch screens when the train from a
 * station I am not showing is late" was not expressible.
 *
 * Same shape as a widget - a use of an extension with its own settings and its
 * own fetched data - but for deciding rather than drawing.
 */
export const triggers = pgTable("triggers", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  extension: text("extension").notNull(),
  /** What it is called in the check editor: "Cadorna departures", "Milan rain". */
  label: text("label").notNull().default(""),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),

  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  error: text("error"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Something to say on whatever screen is showing.
 *
 * The tree answers "which screen"; a notice is additive on top of it. A
 * service alert should be visible while you are looking at your calendar
 * without the calendar knowing anything about trains, and without a branch in
 * the tree for every combination of screen and warning.
 */
export const notices = pgTable("notices", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  label: text("label").notNull().default(""),
  condition: jsonb("condition").$type<Record<string, unknown>>().notNull(),
  icon: text("icon").notNull().default("alert"),
  /** Liquid, rendered against the source the condition reads from. */
  text: text("text").notNull().default(""),
  /**
   * info | warn | urgent.
   *
   * Not only styling: the level decides which notice survives when a design
   * has room for two and three are active, so "the train is cancelled" is
   * never dropped to make room for "rain likely".
   */
  level: text("level").notNull().default("warn"),
  /**
   * screen | source.
   *
   * "screen" puts it in the screen's alert area. "source" puts it on a widget
   * of the same extension when the screen has one - a transit alert on the
   * departure board rather than beside the weather - and falls back to the
   * alert area when it does not.
   */
  placement: text("placement").notNull().default("screen"),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
});

/**
 * One node of a device's decision tree.
 *
 * Every wake, the device walks this tree from its root and shows the first
 * screen it reaches. Questions branch; screens are leaves.
 *
 * A tree rather than a state machine, because the hard case is "when it rains,
 * show the weather wherever you are, then go back". A machine needs an edge
 * from every state and a memory of where it came from. A tree needs one node
 * near the top - and when the rain stops it simply re-answers the questions and
 * lands wherever it should be now, so there is nothing to remember and nothing
 * to return to.
 *
 * Priority is depth: a question nearer the root is asked first, so making a
 * rule win means dragging it higher. That is the whole ordering model.
 */
export const decisionNodes = pgTable("decision_nodes", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),

  /** "question" branches on a condition; "screen" is a leaf that shows something. */
  kind: text("kind").notNull(),
  label: text("label").notNull().default(""),

  /* Questions ------------------------------------------------------------- */
  condition: jsonb("condition").$type<Record<string, unknown>>(),
  yesNodeId: integer("yes_node_id"),
  noNodeId: integer("no_node_id"),

  /* Screens --------------------------------------------------------------- */
  screenId: integer("screen_id").references(() => screens.id, { onDelete: "set null" }),
  /** Seconds between wakes while this screen is showing. */
  refreshSeconds: integer("refresh_seconds"),
  /**
   * Once reached, keep showing this for at least this long even if the answers
   * change. This is the only memory in the system, and it exists because a
   * value sitting on a threshold would otherwise flip the display back and
   * forth on every wake.
   */
  holdSeconds: integer("hold_seconds").notNull().default(0),

  /** Canvas position. The layout of the tree is the user's, so we keep it. */
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
});

/** A rendered image, cached by the inputs that produced it. */
export const renders = pgTable("renders", {
  id: serial("id").primaryKey(),
  screenId: integer("screen_id").references(() => screens.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").references(() => devices.id, { onDelete: "cascade" }),
  /** Hash of screen + widget settings + widget data + panel. The cache key. */
  fingerprint: text("fingerprint").notNull(),
  /** Key in the storage backend, not a filesystem path. */
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull().default("image/png"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An account linked once and used by every widget that names it. Credentials
 * live here, never in a widget's settings.
 */
export const connections = pgTable("connections", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().unique(),
  label: text("label").notNull().default(""),
  /** Whatever the provider needs. Opaque above this table. */
  credentials: jsonb("credentials").$type<Record<string, unknown>>().notNull().default({}),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row, holding the things that are true of this whole installation.
 *
 * Locale and time zone live here because otherwise they leak from the server:
 * a box running in Istanbul renders every date in Turkish, which is a
 * confusing thing to discover on a wall clock.
 */
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  /** BCP 47, e.g. "en-GB". Used for day and month names. */
  locale: text("locale").notNull().default("en-GB"),
  /** IANA zone, e.g. "Europe/Rome". */
  timezone: text("timezone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Firmware images offered to devices over the air. */
export const firmwares = pgTable("firmwares", {
  id: serial("id").primaryKey(),
  version: text("version").notNull().unique(),
  storageKey: text("storage_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** What the device posts to /api/log, kept verbatim. */
export const deviceLogs = pgTable("device_logs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const screensRelations = relations(screens, ({ many }) => ({
  widgets: many(widgets),
}));

export const widgetsRelations = relations(widgets, ({ one }) => ({
  screen: one(screens, { fields: [widgets.screenId], references: [screens.id] }),
  data: one(widgetData, { fields: [widgets.id], references: [widgetData.widgetId] }),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  model: one(models, { fields: [devices.modelId], references: [models.id] }),
  nodes: many(decisionNodes),
  triggers: many(triggers),
  notices: many(notices),
  logs: many(deviceLogs),
}));

export const triggersRelations = relations(triggers, ({ one }) => ({
  device: one(devices, { fields: [triggers.deviceId], references: [devices.id] }),
}));

export const decisionNodesRelations = relations(decisionNodes, ({ one }) => ({
  device: one(devices, { fields: [decisionNodes.deviceId], references: [devices.id] }),
  screen: one(screens, { fields: [decisionNodes.screenId], references: [screens.id] }),
}));

export type Model = typeof models.$inferSelect;
export type Screen = typeof screens.$inferSelect;
export type Widget = typeof widgets.$inferSelect;
export type WidgetData = typeof widgetData.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type DecisionNode = typeof decisionNodes.$inferSelect;
export type Trigger = typeof triggers.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type Render = typeof renders.$inferSelect;
