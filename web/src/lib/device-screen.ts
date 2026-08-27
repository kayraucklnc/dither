import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  decisionNodes,
  devices,
  firmwares,
  models,
  renders,
  screens,
  widgets,
} from "@/lib/db/schema";
import type { Device } from "@/lib/db/schema";
import type { Condition } from "@/lib/flow/conditions";
import { contextFor } from "@/lib/flow/context";
import { walk, type Node, type Walk } from "@/lib/flow/tree";
import { panelFor } from "@/lib/panel";
import { fingerprint, renderScreen } from "@/lib/render";
import { store } from "@/lib/storage";
import { refreshScreen } from "@/lib/extensions/fetcher";
import { dataFor } from "@/lib/widget-data";

/**
 * Decide what this device should show, render it, and remember the leaf it
 * landed on so a hold can be honoured next time.
 *
 * Walking the tree is a side effect of being asked, which is deliberate: the
 * device waking up *is* the clock of this system. Nothing else ticks.
 */
export interface Served {
  storageKey: string;
  filename: string;
  refreshSeconds: number;
  walk: Walk;
  screenName: string;
}

export function toNodes(rows: (typeof decisionNodes.$inferSelect)[]): Node[] {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind === "question" ? "question" : "screen",
    label: row.label,
    condition: (row.condition as unknown as Condition | null) ?? null,
    yesNodeId: row.yesNodeId,
    noNodeId: row.noNodeId,
    screenId: row.screenId,
    refreshSeconds: row.refreshSeconds,
    holdSeconds: row.holdSeconds,
  }));
}

export async function serve(device: Device, now = new Date()): Promise<Served> {
  const [panel] = await db.select().from(models).where(eq(models.id, device.modelId));

  const rows = await db.select().from(decisionNodes).where(eq(decisionNodes.deviceId, device.id));

  const result = walk(
    toNodes(rows),
    device.rootNodeId,
    { currentNodeId: device.currentNodeId, nodeEnteredAt: device.nodeEnteredAt },
    await contextFor(device, now),
    device.refreshRate,
  );

  if (result.leaf && result.leaf.id !== device.currentNodeId) {
    await db
      .update(devices)
      .set({ currentNodeId: result.leaf.id, nodeEnteredAt: now })
      .where(eq(devices.id, device.id));
  }

  const screenId = result.leaf?.screenId ?? null;
  const [screen] = screenId
    ? await db.select().from(screens).where(eq(screens.id, screenId))
    : [undefined];

  // The device asking is the only clock in this system, so this is where stale
  // data gets refreshed - before the picture it is about to receive is drawn.
  if (screenId) await refreshScreen(screenId, now);

  const placedRows = screenId
    ? await db.select().from(widgets).where(eq(widgets.screenId, screenId))
    : [];

  const data = await dataFor(placedRows.map((row) => ({ id: row.id, extension: row.extension })));
  const placed = placedRows.map((row) => ({
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
    refreshSeconds: result.refreshSeconds,
    walk: result,
    screenName: screen?.name ?? "Nothing set up",
  };
}

/** The newest firmware on offer, or nothing when the device is already current. */
export async function firmwareFor(device: Device) {
  const [latest] = await db.select().from(firmwares).orderBy(desc(firmwares.id)).limit(1);

  if (!latest || latest.version === device.firmwareVersion) return undefined;
  return latest;
}
