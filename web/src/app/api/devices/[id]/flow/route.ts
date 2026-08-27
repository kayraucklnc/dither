import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { devices, flowStates, flowTransitions } from "@/lib/db/schema";
import { conditionSchema } from "@/lib/flow/conditions";

/**
 * Read and write a device's flow.
 *
 * The canvas owns the whole graph, so a save replaces it wholesale. States
 * keep their ids where the client sends one, because a device's *current*
 * state points at a row and must not be orphaned by an edit to the layout.
 */

const stateSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  screenId: z.number().nullable(),
  refreshSeconds: z.number().int().min(30).nullable(),
  isInitial: z.boolean(),
  minDwellSeconds: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
});

const transitionSchema = z.object({
  id: z.number(),
  fromStateId: z.number().nullable(),
  toStateId: z.number(),
  condition: conditionSchema,
  priority: z.number().int(),
});

const body = z.object({
  states: z.array(stateSchema).min(1),
  transitions: z.array(transitionSchema),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  const parsed = body.safeParse(await request.json());

  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") },
      { status: 400 },
    );
  }

  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  const { states, transitions } = parsed.data;

  // Exactly one home. Without it a device that falls out of every state has
  // nowhere to land, and the display would simply stop changing.
  if (states.filter((state) => state.isInitial).length !== 1) {
    return NextResponse.json({ error: "Exactly one state must be the starting state." }, { status: 422 });
  }

  const result = await db.transaction(async (tx) => {
    const idMap = new Map<number, number>();
    const keptStates: number[] = [];

    // The unique index allows one initial state per device, so the old one has
    // to stop being initial before the new one can start.
    await tx.update(flowStates).set({ isInitial: false }).where(eq(flowStates.deviceId, deviceId));

    for (const state of states) {
      const values = {
        deviceId,
        name: state.name,
        screenId: state.screenId,
        refreshSeconds: state.refreshSeconds,
        isInitial: state.isInitial,
        minDwellSeconds: state.minDwellSeconds,
        x: state.x,
        y: state.y,
      };

      if (state.id > 0) {
        await tx
          .update(flowStates)
          .set(values)
          .where(and(eq(flowStates.id, state.id), eq(flowStates.deviceId, deviceId)));
        idMap.set(state.id, state.id);
        keptStates.push(state.id);
      } else {
        const [created] = await tx.insert(flowStates).values(values).returning();
        idMap.set(state.id, created.id);
        keptStates.push(created.id);
      }
    }

    // Transitions are cheap and fully described by the canvas, so they are
    // replaced rather than reconciled.
    await tx.delete(flowTransitions).where(eq(flowTransitions.deviceId, deviceId));

    if (transitions.length) {
      await tx.insert(flowTransitions).values(
        transitions.map((transition) => ({
          deviceId,
          fromStateId:
            transition.fromStateId === null ? null : (idMap.get(transition.fromStateId) ?? null),
          toStateId: idMap.get(transition.toStateId) ?? transition.toStateId,
          condition: transition.condition as Record<string, unknown>,
          priority: transition.priority,
        })),
      );
    }

    const existing = await tx.select().from(flowStates).where(eq(flowStates.deviceId, deviceId));
    for (const state of existing) {
      if (!keptStates.includes(state.id)) await tx.delete(flowStates).where(eq(flowStates.id, state.id));
    }

    // A device parked in a state that no longer exists is sent home.
    if (device.currentStateId && !keptStates.includes(device.currentStateId)) {
      const home = states.find((state) => state.isInitial);
      await tx
        .update(devices)
        .set({
          currentStateId: home ? (idMap.get(home.id) ?? null) : null,
          stateEnteredAt: new Date(),
        })
        .where(eq(devices.id, deviceId));
    }

    return {
      states: await tx.select().from(flowStates).where(eq(flowStates.deviceId, deviceId)),
      transitions: await tx.select().from(flowTransitions).where(eq(flowTransitions.deviceId, deviceId)),
    };
  });

  return NextResponse.json(result);
}
