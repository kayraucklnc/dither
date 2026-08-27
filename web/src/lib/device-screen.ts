import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  devices,
  firmwares,
  flowStates,
  flowTransitions,
  models,
  renders,
  screens,
  widgets,
} from "@/lib/db/schema";
import type { Device } from "@/lib/db/schema";
import type { Condition } from "@/lib/flow/conditions";
import { contextFor } from "@/lib/flow/context";
import { decide, type Decision } from "@/lib/flow/machine";
import { panelFor } from "@/lib/panel";
import { fingerprint, renderScreen } from "@/lib/render";
import { store } from "@/lib/storage";
import { dataFor } from "@/lib/widget-data";

/**
 * Decide what this device should show, render it, and remember where the
 * device now is.
 *
 * Advancing the flow is a side effect of being asked, which is deliberate: the
 * device waking up *is* the clock of this system. Nothing else ticks.
 */
export interface Served {
  storageKey: string;
  filename: string;
  refreshSeconds: number;
  decision?: Decision;
  screenName: string;
}

export async function serve(device: Device, now = new Date()): Promise<Served> {
  const [panel] = await db.select().from(models).where(eq(models.id, device.modelId));

  const states = await db.select().from(flowStates).where(eq(flowStates.deviceId, device.id));
  const transitions = await db
    .select()
    .from(flowTransitions)
    .where(eq(flowTransitions.deviceId, device.id));

  const decision = decide(
    states,
    transitions.map((transition) => ({
      id: transition.id,
      fromStateId: transition.fromStateId,
      toStateId: transition.toStateId,
      condition: transition.condition as unknown as Condition,
      priority: transition.priority,
    })),
    { currentStateId: device.currentStateId, stateEnteredAt: device.stateEnteredAt },
    await contextFor(device, now),
    device.refreshRate,
  );

  if (decision?.moved) {
    await db
      .update(devices)
      .set({ currentStateId: decision.state.id, stateEnteredAt: now })
      .where(eq(devices.id, device.id));
  }

  const screenId = decision?.state.screenId ?? null;
  const [screen] = screenId
    ? await db.select().from(screens).where(eq(screens.id, screenId))
    : [undefined];

  const rows = screenId
    ? await db.select().from(widgets).where(eq(widgets.screenId, screenId))
    : [];

  const data = await dataFor(rows.map((row) => ({ id: row.id, extension: row.extension })));
  const placed = rows.map((row) => ({
    id: row.id,
    extension: row.extension,
    label: row.label,
    settings: row.settings,
    data: data.get(row.id) ?? {},
    column: row.column,
    row: row.row,
    columnSpan: row.columnSpan,
    rowSpan: row.rowSpan,
  }));

  const spec = panelFor(panel);
  const key = `${fingerprint(placed, spec)}.png`;

  if (!(await store().has(key))) {
    const rendered = await renderScreen(placed, spec);
    await store().put(key, rendered.bytes, "image/png");

    await db.insert(renders).values({
      screenId,
      deviceId: device.id,
      fingerprint: rendered.fingerprint,
      storageKey: key,
      width: rendered.width,
      height: rendered.height,
    });
  }

  const name = (screen?.name ?? "screen").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    storageKey: key,
    // The device caches by filename, so it must change when the picture does
    // and must not change when it does not. The fingerprint gives both.
    filename: `${name}-${key.slice(0, 10)}`,
    refreshSeconds: decision?.refreshSeconds ?? device.refreshRate,
    decision,
    screenName: screen?.name ?? "Nothing set up",
  };
}

/** The newest firmware on offer, or nothing when the device is already current. */
export async function firmwareFor(device: Device) {
  const [latest] = await db.select().from(firmwares).orderBy(desc(firmwares.id)).limit(1);

  if (!latest || latest.version === device.firmwareVersion) return undefined;
  return latest;
}
