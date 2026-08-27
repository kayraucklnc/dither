import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { DeviceTree } from "@/components/flow/canvas";
import { db } from "@/lib/db";
import { decisionNodes, devices, models, screens } from "@/lib/db/schema";
import { toNodes } from "@/lib/device-screen";
import { widgetsForDevice } from "@/lib/flow/context";

export const dynamic = "force-dynamic";

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) notFound();

  const [panel] = await db.select().from(models).where(eq(models.id, device.modelId));

  const rows = await db
    .select()
    .from(decisionNodes)
    .where(eq(decisionNodes.deviceId, id))
    .orderBy(asc(decisionNodes.id));

  const screenOptions = await db
    .select({ id: screens.id, name: screens.name })
    .from(screens)
    .orderBy(asc(screens.name));

  // A trigger belongs to a placement, not to an extension, so the choices are
  // the widgets on the screens this device's tree can actually reach.
  const factGroups = (await widgetsForDevice(id)).map((entry) => ({
    widgetId: entry.widgetId,
    label: entry.label,
    screenName: entry.screenName,
    facts: entry.facts,
  }));

  return (
    <DeviceTree
      deviceId={device.id}
      deviceRefreshSeconds={device.refreshRate}
      modelId={device.modelId}
      panel={{ width: panel?.width ?? 800, height: panel?.height ?? 480 }}
      screens={screenOptions}
      factGroups={factGroups}
      initialNodes={toNodes(rows)}
      initialRootId={device.rootNodeId}
    />
  );
}
