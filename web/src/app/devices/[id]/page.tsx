import { asc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { DeviceFlow, type FlowState, type FlowTransition } from "@/components/flow/canvas";
import { db } from "@/lib/db";
import { devices, flowStates, flowTransitions, models, screens, widgets } from "@/lib/db/schema";
import type { Condition } from "@/lib/flow/conditions";
import { widgetsForDevice } from "@/lib/flow/context";

export const dynamic = "force-dynamic";

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) notFound();

  const [panel] = await db.select().from(models).where(eq(models.id, device.modelId));

  const states = await db
    .select()
    .from(flowStates)
    .where(eq(flowStates.deviceId, id))
    .orderBy(asc(flowStates.id));

  const transitions = await db
    .select()
    .from(flowTransitions)
    .where(eq(flowTransitions.deviceId, id))
    .orderBy(asc(flowTransitions.priority), asc(flowTransitions.id));

  const screenOptions = await db
    .select({
      id: screens.id,
      name: screens.name,
      widgetCount: sql<number>`count(${widgets.id})::int`,
    })
    .from(screens)
    .leftJoin(widgets, eq(widgets.screenId, screens.id))
    .groupBy(screens.id)
    .orderBy(asc(screens.name));

  // A trigger belongs to a placement, not to an extension, so the choices here
  // are the widgets on the screens this device can actually reach.
  const factGroups = (await widgetsForDevice(id)).map((entry) => ({
    widgetId: entry.widgetId,
    label: entry.label,
    screenName: entry.screenName,
    facts: entry.facts,
  }));

  return (
    <DeviceFlow
      deviceId={device.id}
      deviceRefreshSeconds={device.refreshRate}
      modelId={device.modelId}
      panel={{ width: panel?.width ?? 800, height: panel?.height ?? 480 }}
      screens={screenOptions}
      factGroups={factGroups}
      initialStates={states satisfies FlowState[]}
      initialTransitions={transitions.map<FlowTransition>((transition) => ({
        id: transition.id,
        fromStateId: transition.fromStateId,
        toStateId: transition.toStateId,
        condition: transition.condition as unknown as Condition,
        priority: transition.priority,
      }))}
    />
  );
}
