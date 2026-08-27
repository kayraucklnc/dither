import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { devices, flowStates, flowTransitions, models, screens, widgets } from "../src/lib/db/schema";

const [panel] = await db.select().from(models).where(eq(models.name, "og_plus"));
if (!panel) throw new Error("Run the model copy first.");

// A screen worth looking at on first run: the whole panel used, three widgets.
const [home] = await db
  .insert(screens)
  .values({ name: "Morning", description: "Trains down the left, clock and weather on the right." })
  .returning();

await db.insert(widgets).values([
  {
    screenId: home.id, extension: "public_transport", label: "Cadorna to Saronno",
    settings: { country: "it", city: "milan", provider: "trenord", origin: "Milano Cadorna", destination: "Saronno" },
    column: 1, row: 1, columnSpan: 3, rowSpan: 6,
  },
  {
    screenId: home.id, extension: "clock", label: "Local time",
    settings: { utc_offset_hours: "2", heading: "Milan" },
    column: 4, row: 1, columnSpan: 3, rowSpan: 3,
  },
  {
    screenId: home.id, extension: "weather", label: "Milan weather",
    settings: { place: "Milan", latitude: "45.4642", longitude: "9.19", units: "celsius" },
    column: 4, row: 4, columnSpan: 3, rowSpan: 3,
  },
]);

const [focus] = await db
  .insert(screens)
  .values({ name: "Leaving now", description: "Departures full screen, for when a train is close." })
  .returning();

await db.insert(widgets).values({
  screenId: focus.id, extension: "public_transport", label: "Cadorna to Saronno",
  settings: { country: "it", city: "milan", provider: "trenord", origin: "Milano Cadorna", destination: "Saronno" },
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
    refreshRate: 900,
    percentCharged: 85,
    batteryVoltage: 4.74,
    rssi: -54,
  })
  .returning();

const [homeState] = await db
  .insert(flowStates)
  .values({ deviceId: device.id, name: "Home", screenId: home.id, refreshSeconds: 900, isInitial: true, x: 80, y: 160 })
  .returning();

const [focusState] = await db
  .insert(flowStates)
  .values({ deviceId: device.id, name: "Leaving now", screenId: focus.id, refreshSeconds: 300, minDwellSeconds: 300, x: 520, y: 160 })
  .returning();

const [transitWidget] = await db.select().from(widgets).where(eq(widgets.screenId, home.id));

await db.insert(flowTransitions).values({
  deviceId: device.id,
  fromStateId: null,
  toStateId: focusState.id,
  condition: { kind: "fact", widgetId: transitWidget.id, factKey: "next_departure_in", operator: "lt", value: 15 },
  priority: 0,
});

await db.update(devices).set({ currentStateId: homeState.id }).where(eq(devices.id, device.id));

console.log(`device ${device.id} "${device.name}"  screens ${home.id}, ${focus.id}  states ${homeState.id}, ${focusState.id}`);
process.exit(0);
