import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { flowStates, screens, widgets } from "@/lib/db/schema";
import { find as findExtension } from "@/lib/extensions/registry";
import type { Fact } from "@/lib/extensions/manifest";
import type { Context } from "@/lib/flow/conditions";
import type { Device } from "@/lib/db/schema";
import { dataFor } from "@/lib/widget-data";

/**
 * Everything a device's flow can ask about, gathered once.
 *
 * The facts available to a device are the facts of the widgets on the screens
 * its flow can reach - because a fact belongs to a *placement*, not to an
 * extension. "Cadorna to Saronno leaves in under ten minutes" is a different
 * trigger from "Centrale to Bergamo leaves in under ten minutes", and both can
 * exist at once.
 */
export interface WidgetFacts {
  widgetId: number;
  label: string;
  extension: string;
  screenId: number;
  screenName: string;
  facts: Fact[];
}

export async function widgetsForDevice(deviceId: number): Promise<WidgetFacts[]> {
  const states = await db.select().from(flowStates).where(eq(flowStates.deviceId, deviceId));
  const screenIds = [...new Set(states.map((state) => state.screenId).filter((id): id is number => id !== null))];

  if (!screenIds.length) return [];

  const rows = await db
    .select({
      id: widgets.id,
      label: widgets.label,
      extension: widgets.extension,
      screenId: widgets.screenId,
      screenName: screens.name,
    })
    .from(widgets)
    .innerJoin(screens, eq(screens.id, widgets.screenId))
    .where(inArray(widgets.screenId, screenIds));

  const result: WidgetFacts[] = [];

  for (const row of rows) {
    const extension = await findExtension(row.extension);
    if (!extension?.manifest.facts.length) continue;

    result.push({
      widgetId: row.id,
      label: row.label || extension.manifest.label,
      extension: row.extension,
      screenId: row.screenId,
      screenName: row.screenName,
      facts: extension.manifest.facts,
    });
  }

  return result;
}

/** The live values, for evaluating a flow or showing a trace. */
export async function contextFor(device: Device, now = new Date()): Promise<Context> {
  const available = await widgetsForDevice(device.id);
  const data = await dataFor(
    available.map((entry) => ({ id: entry.widgetId, extension: entry.extension })),
  );

  return {
    now,
    device: {
      percentCharged: device.percentCharged,
      usbConnected: device.usbConnected,
      rssi: device.rssi,
      updateSource: device.updateSource,
    },
    widgets: new Map(
      available.map((entry) => [
        entry.widgetId,
        {
          payload: data.get(entry.widgetId) ?? {},
          facts: entry.facts,
          label: entry.label,
          fetchedAt: now,
        },
      ]),
    ),
  };
}
