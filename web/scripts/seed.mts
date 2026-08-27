import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { decisionNodes, devices, models, screens, widgets } from "../src/lib/db/schema";

const [panel] = await db.select().from(models).where(eq(models.name, "og_plus"));
if (!panel) throw new Error("Copy the models first.");

await db.delete(decisionNodes);
await db.delete(devices);
await db.delete(screens);

const screenNamed = async (name: string, description: string) =>
  (await db.insert(screens).values({ name, description }).returning())[0];

const transit = (label: string) => ({
  extension: "public_transport",
  label,
  settings: {
    country: "it", city: "milan", provider: "trenord",
    origin: "Milano Cadorna", destination: "Saronno",
  },
});

const home = await screenNamed("Morning", "Trains down the left, clock and weather on the right.");
await db.insert(widgets).values([
  { screenId: home.id, ...transit("Cadorna to Saronno"), column: 1, row: 1, columnSpan: 3, rowSpan: 6 },
  { screenId: home.id, extension: "clock", label: "Local time", settings: { utc_offset_hours: "2", heading: "Milan" }, column: 4, row: 1, columnSpan: 3, rowSpan: 3 },
  { screenId: home.id, extension: "weather", label: "Milan weather", settings: { place: "Milan", latitude: "45.4642", longitude: "9.19", units: "celsius" }, column: 4, row: 4, columnSpan: 3, rowSpan: 3 },
]);

const leaving = await screenNamed("Leaving now", "Departures full screen, for when a train is close.");
await db.insert(widgets).values({
  screenId: leaving.id, ...transit("Cadorna to Saronno"), column: 1, row: 1, columnSpan: 6, rowSpan: 6,
});

const wet = await screenNamed("Wet weather", "The forecast, full screen, for when it is raining.");
await db.insert(widgets).values({
  screenId: wet.id, extension: "weather", label: "Milan weather",
  settings: { place: "Milan", latitude: "45.4642", longitude: "9.19", units: "celsius" },
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
  })
  .returning();

const leaf = async (label: string, screenId: number, refreshSeconds: number, holdSeconds = 0) =>
  (
    await db
      .insert(decisionNodes)
      .values({ deviceId: device.id, kind: "screen", label, screenId, refreshSeconds, holdSeconds })
      .returning()
  )[0];

// The two facts the demo tree asks about, on the screens it can reach.
const [rainWidget] = await db.select().from(widgets).where(eq(widgets.screenId, wet.id));
const [trainWidget] = await db.select().from(widgets).where(eq(widgets.screenId, leaving.id));

const homeLeaf = await leaf("Home", home.id, 900);
const leavingLeaf = await leaf("Leaving now", leaving.id, 300);
// Twenty minutes, so a shower that stops and starts does not flap the display.
const wetLeaf = await leaf("Wet weather", wet.id, 600, 1200);

const [trainQuestion] = await db
  .insert(decisionNodes)
  .values({
    deviceId: device.id,
    kind: "question",
    label: "Train leaving soon?",
    condition: { kind: "fact", widgetId: trainWidget.id, factKey: "next_departure_in", operator: "lt", value: 15 },
    yesNodeId: leavingLeaf.id,
    noNodeId: homeLeaf.id,
  })
  .returning();

// Asked first, so it wins wherever the device would otherwise have been.
const [rainQuestion] = await db
  .insert(decisionNodes)
  .values({
    deviceId: device.id,
    kind: "question",
    label: "Raining?",
    condition: { kind: "fact", widgetId: rainWidget.id, factKey: "rain_chance", operator: "gt", value: 60 },
    yesNodeId: wetLeaf.id,
    noNodeId: trainQuestion.id,
  })
  .returning();

await db.update(devices).set({ rootNodeId: rainQuestion.id }).where(eq(devices.id, device.id));

console.log(`device ${device.id}  screens ${home.id}/${leaving.id}/${wet.id}  root ${rainQuestion.id}`);
process.exit(0);
