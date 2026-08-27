import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { devices, flowStates, flowTransitions } from "@/lib/db/schema";
import { contextFor } from "@/lib/flow/context";
import { decide } from "@/lib/flow/machine";
import type { Condition } from "@/lib/flow/conditions";

/**
 * What the flow would decide right now, and why.
 *
 * This is the answer to "my display is showing the wrong thing and I cannot
 * tell why". It runs the real machine against the real current values and
 * reports every transition it looked at, whether it held, and what value it
 * actually saw - without moving the device.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  const states = await db.select().from(flowStates).where(eq(flowStates.deviceId, id));
  const transitions = await db.select().from(flowTransitions).where(eq(flowTransitions.deviceId, id));
  const context = await contextFor(device);

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
    context,
    device.refreshRate,
  );

  if (!decision) {
    return NextResponse.json({
      reason: "This device has no states yet, so there is nothing to show.",
      stateId: null,
      steps: [],
      values: [],
    });
  }

  // Current fact values, so the panel can show what each widget knows even
  // when no transition mentions it.
  const values = [...context.widgets.entries()].flatMap(([widgetId, widget]) =>
    widget.facts.map((fact) => ({
      widgetId,
      widgetLabel: widget.label,
      key: fact.key,
      label: fact.label,
      unit: fact.unit,
      value: String(
        fact.path.split(".").reduce<unknown>(
          (current, step) =>
            current && typeof current === "object"
              ? (current as Record<string, unknown>)[step]
              : undefined,
          widget.payload,
        ) ?? "—",
      ),
    })),
  );

  return NextResponse.json({
    stateId: decision.state.id,
    stateName: decision.state.name,
    moved: decision.moved,
    refreshSeconds: decision.refreshSeconds,
    reason: decision.reason,
    steps: decision.steps.map((step) => ({
      transitionId: step.transitionId,
      label: step.label,
      holds: step.trace.holds,
      sentence: step.trace.sentence,
      actual: step.trace.actual,
      blockedBy: step.blockedBy,
    })),
    values,
  });
}
