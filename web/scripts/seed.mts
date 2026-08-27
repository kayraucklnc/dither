import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { decisionNodes, devices, models, screens, triggers, widgets } from "../src/lib/db/schema";
import { refreshTrigger } from "../src/lib/extensions/fetcher";
import { defaultSettings, find } from "../src/lib/extensions/registry";

const [panel] = await db.select().from(models).where(eq(models.name, "og_plus"));
if (!panel) throw new Error("Copy the models first.");

await db.delete(decisionNodes);
await db.delete(triggers);
await db.delete(devices);
await db.delete(screens);

const screenNamed = async (name: string, description: string) =>
  (await db.insert(screens).values({ name, description }).returning())[0];

const TRANSIT = {
  country: "it", city: "milan", provider: "trenord",
  origin: "Milano Cadorna", destination: "Saronno",
};
const WEATHER = { place: "Milan", latitude: "45.4642", longitude: "9.19", units: "celsius" };

const home = await screenNamed("Morning", "Trains down the left, clock and weather on the right.");
await db.insert(widgets).values([
  { screenId: home.id, extension: "public_transport", label: "Cadorna to Saronno", settings: TRANSIT, column: 1, row: 1, columnSpan: 3, rowSpan: 6 },
  { screenId: home.id, extension: "clock", label: "Local time", settings: { utc_offset_hours: "2", heading: "Milan" }, column: 4, row: 1, columnSpan: 3, rowSpan: 3 },
  { screenId: home.id, extension: "weather", label: "Milan weather", settings: WEATHER, column: 4, row: 4, columnSpan: 3, rowSpan: 3 },
]);

const leaving = await screenNamed("Leaving now", "Departures full screen, for when a train is close.");
await db.insert(widgets).values({
  screenId: leaving.id, extension: "public_transport", label: "Cadorna to Saronno",
  settings: TRANSIT, column: 1, row: 1, columnSpan: 6, rowSpan: 6,
});

const wet = await screenNamed("Wet weather", "The forecast, full screen, for when it is raining.");
await db.insert(widgets).values({
  screenId: wet.id, extension: "weather", label: "Milan weather",
  settings: WEATHER, column: 1, row: 1, columnSpan: 6, rowSpan: 6,
});

const meetings = await screenNamed("Meetings", "What is next, with the day's list beside it.");
await db.insert(widgets).values({
  screenId: meetings.id, extension: "google_calendar", label: "My calendar",
  settings: { calendar: "primary", horizon_hours: 12, heading: "Today", show_location: true },
  column: 1, row: 1, columnSpan: 6, rowSpan: 6,
});

const [device] = await db
  .insert(devices)
  .values({
    name: "Desk panel",
    macAddress: "A1:B2:C3:D4:E5:F6",
    apiKey: "dev-" + Math.random().toString(36).slice(2, 14),
    modelId: panel.id,
    width: panel.width,
    height: panel.height,
    percentCharged: 85,
    batteryVoltage: 4.74,
    rssi: -54,
    lastSeenAt: new Date(),
  })
  .returning();

/*
 * Sources belong to nothing in particular: not to a screen, so a check can ask
 * about a station that is not displayed, and not to a device, so two panels can
 * watch the same one.
 */
const source = async (extension: string, label: string, settings: Record<string, unknown> = {}) => {
  const loaded = await find(extension);
  const [row] = await db
    .insert(triggers)
    .values({
      extension,
      label,
      settings: { ...(loaded ? defaultSettings(loaded) : {}), ...settings },
    })
    .returning();

  await refreshTrigger(row);
  return row;
};

const rainSource = await source("weather", "Milan weather", WEATHER);
const trainSource = await source("public_transport", "Cadorna departures", TRANSIT);
const calendarSource = await source("google_calendar", "My calendar", {
  calendar: "primary", horizon_hours: 12,
});

const leaf = async (label: string, screenId: number, refreshSeconds: number, holdSeconds = 0) =>
  (
    await db
      .insert(decisionNodes)
      .values({ deviceId: device.id, kind: "screen", label, screenId, refreshSeconds, holdSeconds })
      .returning()
  )[0];

const check = async (
  label: string,
  condition: Record<string, unknown>,
  yesNodeId: number,
  noNodeId: number,
) =>
  (
    await db
      .insert(decisionNodes)
      .values({ deviceId: device.id, kind: "question", label, condition, yesNodeId, noNodeId })
      .returning()
  )[0];

const homeLeaf = await leaf("Home", home.id, 900);
const leavingLeaf = await leaf("Leaving now", leaving.id, 300);
const meetingLeaf = await leaf("Next meeting", meetings.id, 300);
// Twenty minutes, so a shower that stops and starts does not flap the display.
const wetLeaf = await leaf("Wet weather", wet.id, 600, 1200);

const trainCheck = await check(
  "Train leaving soon?",
  { kind: "fact", sourceId: String(trainSource.id), factKey: "next_departure_in", operator: "lt", value: 15 },
  leavingLeaf.id,
  homeLeaf.id,
);

// Two conditions at once: a meeting soon *and* one you have to travel to.
const meetingCheck = await check(
  "Meeting to travel to?",
  {
    kind: "all",
    conditions: [
      { kind: "fact", sourceId: String(calendarSource.id), factKey: "next_meeting_in", operator: "lt", value: 45 },
      { kind: "fact", sourceId: String(calendarSource.id), factKey: "next_meeting_is_remote", operator: "is_false" },
    ],
  },
  meetingLeaf.id,
  trainCheck.id,
);

// Asked first, so it wins wherever the device would otherwise have been.
const rainCheck = await check(
  "Raining?",
  { kind: "fact", sourceId: String(rainSource.id), factKey: "rain_chance", operator: "gt", value: 60 },
  wetLeaf.id,
  meetingCheck.id,
);

await db.update(devices).set({ rootNodeId: rainCheck.id }).where(eq(devices.id, device.id));

console.log(`device ${device.id}  screens ${[home, leaving, wet, meetings].map((s) => s.id).join("/")}  root ${rainCheck.id}`);
process.exit(0);
