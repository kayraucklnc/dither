import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
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

  /**
   * Where the device currently sits in its flow. A flow has memory - that is
   * what makes it a machine rather than a list of rules - and this is the
   * memory.
   */
  currentStateId: integer("current_state_id"),
  stateEnteredAt: timestamp("state_entered_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A state is "show this screen, and while you are here wake this often".
 * Every device has at least one, its home state.
 */
export const flowStates = pgTable(
  "flow_states",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    screenId: integer("screen_id").references(() => screens.id, { onDelete: "set null" }),
    /** Seconds. Null means "use the device default". */
    refreshSeconds: integer("refresh_seconds"),
    isInitial: boolean("is_initial").notNull().default(false),
    /**
     * Once entered, stay at least this long even if the condition that brought
     * us here stops holding. Without it a display flickers between states every
     * time a value crosses a threshold.
     */
    minDwellSeconds: integer("min_dwell_seconds").notNull().default(0),
    /** Canvas position. Layout of the graph is the user's, so we keep it. */
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
  },
  (table) => [
    // Partial, and it has to be: a plain unique on (device, is_initial) would
    // also forbid a device having two states that are *not* initial.
    uniqueIndex("flow_states_one_initial")
      .on(table.deviceId)
      .where(sql`${table.isInitial}`),
  ],
);

/**
 * An edge. `fromStateId` null means "from anywhere" - one global transition
 * instead of an edge out of every state, which is what keeps a flow with ten
 * states from needing ninety edges.
 *
 * Transitions out of a state are evaluated in `priority` order; the first
 * whose condition holds wins.
 */
export const flowTransitions = pgTable("flow_transitions", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  fromStateId: integer("from_state_id").references(() => flowStates.id, { onDelete: "cascade" }),
  toStateId: integer("to_state_id")
    .notNull()
    .references(() => flowStates.id, { onDelete: "cascade" }),
  condition: jsonb("condition").$type<Record<string, unknown>>().notNull(),
  priority: integer("priority").notNull().default(0),
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
  states: many(flowStates),
  transitions: many(flowTransitions),
  logs: many(deviceLogs),
}));

export const flowStatesRelations = relations(flowStates, ({ one }) => ({
  device: one(devices, { fields: [flowStates.deviceId], references: [devices.id] }),
  screen: one(screens, { fields: [flowStates.screenId], references: [screens.id] }),
}));

export const flowTransitionsRelations = relations(flowTransitions, ({ one }) => ({
  device: one(devices, { fields: [flowTransitions.deviceId], references: [devices.id] }),
  from: one(flowStates, { fields: [flowTransitions.fromStateId], references: [flowStates.id] }),
  to: one(flowStates, { fields: [flowTransitions.toStateId], references: [flowStates.id] }),
}));

export type Model = typeof models.$inferSelect;
export type Screen = typeof screens.$inferSelect;
export type Widget = typeof widgets.$inferSelect;
export type WidgetData = typeof widgetData.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type FlowState = typeof flowStates.$inferSelect;
export type FlowTransition = typeof flowTransitions.$inferSelect;
export type Render = typeof renders.$inferSelect;
