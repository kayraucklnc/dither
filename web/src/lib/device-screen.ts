import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  decisionNodes,
  devices,
  firmwares,
  models,
  notices,
  renders,
  screens,
  widgets,
} from "@/lib/db/schema";
import type { Device } from "@/lib/db/schema";
import type { Condition } from "@/lib/flow/conditions";
import { contextFor, sourceExtensions } from "@/lib/flow/context";
import { activeNotices } from "@/lib/flow/notices";
import { walk, type Node, type Walk } from "@/lib/flow/tree";
import { panelFor } from "@/lib/panel";
import { inQuietHours, secondsUntilAwake } from "@/lib/quiet-hours";
import { environment } from "@/lib/settings";
import { fingerprint, renderEmpty, renderScreen } from "@/lib/render";
import { store } from "@/lib/storage";
import { refreshScreen, refreshTriggers } from "@/lib/extensions/fetcher";
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
  /** True while quiet hours are on; the device is told to sleep through them. */
  asleep: boolean;
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

  // Before the walk, not after: the tree is about to decide on these, and a
  // source nothing ever refreshes decides on the day it was created for ever.
  // Only the ones that have aged out, so a wake is one round of fetches at most.
  await refreshTriggers(now);

  const rows = await db.select().from(decisionNodes).where(eq(decisionNodes.deviceId, device.id));
  const context = await contextFor(device, now);

  const result = walk(
    toNodes(rows),
    device.rootNodeId,
    { currentNodeId: device.currentNodeId, nodeEnteredAt: device.nodeEnteredAt },
    context,
    device.refreshRate,
  );

  // Additive on top of whichever screen the tree chose.
  const said = await activeNotices(
    await db.select().from(notices).where(eq(notices.deviceId, device.id)),
    context,
    await sourceExtensions(),
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

  const data = await dataFor(
    placedRows.map((row) => ({ id: row.id, extension: row.extension, settings: row.settings })),
    { ensure: true },
  );
  const placed = placedRows.map((row) => ({
    id: row.id,
    extension: row.extension,
    label: row.label,
    settings: row.settings,
    data: data.get(row.id)?.payload ?? {},
    problem: data.get(row.id)?.problem,
    standIn: data.get(row.id)?.standIn,
    column: row.column,
    row: row.row,
    columnSpan: row.columnSpan,
    rowSpan: row.rowSpan,
    design: row.design,
    hostsNotices: row.hostsNotices,
  }));

  const spec = panelFor(panel);
  // A leaf with no screen, or no tree at all, still has to put something on
  // the panel - and "blank" is indistinguishable from "broken".
  const nothing = placed.length === 0;

  const heading = device.name;
  const detail = result.leaf
    ? `"${result.leaf.label}" has no screen chosen yet. Pick one on this device's page.`
    : "No decision tree yet. Open this device in Dither to set one up.";

  /*
   * Quiet hours are measured on the displays' clock, not the server's, and
   * they stop the device *waking* rather than blanking it: an e-ink panel
   * costs nothing to leave lit and a lot to refresh, so one long sleep beats
   * forty short ones.
   *
   * Worked out before the render rather than after it, because how long the
   * device is about to sleep for is something the picture needs to know: a
   * clock face drawn at five to eleven is on the wall until morning, and one
   * that says "just gone quarter to eleven" all night is a clock that lies for
   * eight hours. Told the truth about the window, it says "night" instead.
   */
  const { timezoneOffset } = await environment();
  const local = new Date(now.getTime() + timezoneOffset * 60_000);
  const minutesOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();

  const quiet = { startMinute: device.sleepStartMinute, stopMinute: device.sleepStopMinute };
  const asleep = inQuietHours(quiet, minutesOfDay);
  const refreshSeconds = asleep
    ? secondsUntilAwake(quiet, minutesOfDay)
    : result.refreshSeconds;

  /**
   * What the picture is drawn *for*: this instant, and how long it has to last.
   *
   * Both go into the key as well as into the render. A design that draws the
   * clock says how often it would look different, and the key carries the
   * clock quantised to that - so a face showing the time as a band across a
   * quarter of an hour is redrawn four times an hour, and a clock is no longer
   * a picture of whenever the screen was last edited.
   */
  const when = { now, refreshSeconds };

  // The key doubles as the image's filename, so it stays a plain hash - what
  // makes an empty panel distinct goes into the hash, not into a prefix.
  const key = `${await fingerprint(placed, spec, said, nothing ? { empty: [heading, detail] } : undefined, when)}.png`;

  if (!(await store().has(key))) {
    const rendered = nothing
      ? await renderEmpty(spec, heading, detail)
      : await renderScreen(placed, spec, said, when);
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
    refreshSeconds,
    asleep,
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
