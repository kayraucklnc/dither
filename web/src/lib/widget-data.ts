import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { widgetData } from "@/lib/db/schema";
import { find as findExtension } from "@/lib/extensions/registry";

/**
 * The data a widget draws with.
 *
 * Real fetched data when there is any, and the extension's declared sample
 * when there is not. The sample is what lets you design a screen before you
 * own the hardware or wire up an API key; it is used in previews only and is
 * never handed to a device.
 */
export async function dataFor(
  requests: { id: number; extension: string }[],
): Promise<Map<number, Record<string, unknown>>> {
  const ids = requests.map((request) => request.id).filter((id) => id > 0);

  const stored = ids.length
    ? await db.select().from(widgetData).where(inArray(widgetData.widgetId, ids))
    : [];

  const byWidget = new Map(stored.map((row) => [row.widgetId, row]));
  const result = new Map<number, Record<string, unknown>>();

  for (const request of requests) {
    const row = byWidget.get(request.id);

    if (row?.fetchedAt && Object.keys(row.payload).length) {
      result.set(request.id, row.payload);
      continue;
    }

    const extension = await findExtension(request.extension);
    result.set(request.id, (extension?.manifest.sample ?? {}) as Record<string, unknown>);
  }

  return result;
}
