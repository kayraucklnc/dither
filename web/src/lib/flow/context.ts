import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { triggers, type Device } from "@/lib/db/schema";
import { find as findExtension } from "@/lib/extensions/registry";
import type { Context } from "@/lib/flow/conditions";
import { clockSource, deviceSource, triggerSource, type Source } from "@/lib/flow/sources";

/**
 * Everything a device's tree can ask about: itself, the clock, and the trigger
 * sources set up on it.
 *
 * Triggers are deliberately not read off the screens a device shows. A trigger
 * is its own use of an extension with its own settings, so you can branch on a
 * station you are not displaying.
 */
export async function sourcesFor(device: Device, now = new Date()): Promise<Source[]> {
  const rows = await db.select().from(triggers).where(eq(triggers.deviceId, device.id));
  const built: Source[] = [deviceSource(device, now), clockSource(now)];

  for (const trigger of rows) {
    const extension = await findExtension(trigger.extension);
    built.push(triggerSource(trigger, extension?.manifest.facts ?? [], now));
  }

  return built;
}

export async function contextFor(device: Device, now = new Date()): Promise<Context> {
  const sources = await sourcesFor(device, now);

  return { now, sources: new Map(sources.map((source) => [source.id, source])) };
}
