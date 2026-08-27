import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { decisionNodes, devices } from "@/lib/db/schema";
import { conditionSchema } from "@/lib/flow/conditions";

/**
 * Read and write a device's decision tree.
 *
 * The canvas owns the whole tree, so a save replaces it. Nodes the client
 * already has ids for keep them, because the device remembers which leaf it is
 * showing and that reference must survive an edit.
 */
const nodeSchema = z.object({
  id: z.number(),
  kind: z.enum(["question", "screen"]),
  label: z.string().default(""),
  condition: conditionSchema.nullable().default(null),
  yesNodeId: z.number().nullable().default(null),
  noNodeId: z.number().nullable().default(null),
  screenId: z.number().nullable().default(null),
  refreshSeconds: z.number().int().min(30).nullable().default(null),
  holdSeconds: z.number().int().min(0).default(0),
  x: z.number(),
  y: z.number(),
});

const body = z.object({
  rootNodeId: z.number().nullable(),
  nodes: z.array(nodeSchema),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  const parsed = body.safeParse(await request.json());

  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }

  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  const { nodes, rootNodeId } = parsed.data;

  for (const node of nodes) {
    if (node.kind === "question" && !node.condition) {
      return NextResponse.json({ error: `"${node.label}" has no question set.` }, { status: 422 });
    }
  }

  const saved = await db.transaction(async (tx) => {
    const idMap = new Map<number, number>();

    // Two passes: rows first so every id exists, then the branch links, which
    // point at rows that may not have been written yet on the first pass.
    for (const node of nodes) {
      const values = {
        deviceId,
        kind: node.kind,
        label: node.label,
        condition: (node.condition ?? null) as Record<string, unknown> | null,
        screenId: node.screenId,
        refreshSeconds: node.refreshSeconds,
        holdSeconds: node.holdSeconds,
        x: node.x,
        y: node.y,
      };

      if (node.id > 0) {
        await tx.update(decisionNodes).set(values).where(eq(decisionNodes.id, node.id));
        idMap.set(node.id, node.id);
      } else {
        const [created] = await tx.insert(decisionNodes).values(values).returning();
        idMap.set(node.id, created.id);
      }
    }

    const resolve = (id: number | null) => (id === null ? null : (idMap.get(id) ?? null));

    for (const node of nodes) {
      const real = idMap.get(node.id)!;
      await tx
        .update(decisionNodes)
        .set({ yesNodeId: resolve(node.yesNodeId), noNodeId: resolve(node.noNodeId) })
        .where(eq(decisionNodes.id, real));
    }

    const kept = [...idMap.values()];
    const existing = await tx.select().from(decisionNodes).where(eq(decisionNodes.deviceId, deviceId));

    for (const node of existing) {
      if (!kept.includes(node.id)) await tx.delete(decisionNodes).where(eq(decisionNodes.id, node.id));
    }

    const root = resolve(rootNodeId);

    await tx
      .update(devices)
      .set({
        rootNodeId: root,
        // A device parked on a leaf that no longer exists must not keep a
        // dangling reference, or its hold would never expire.
        ...(device.currentNodeId && !kept.includes(device.currentNodeId)
          ? { currentNodeId: null, nodeEnteredAt: null }
          : {}),
      })
      .where(eq(devices.id, deviceId));

    return {
      rootNodeId: root,
      nodes: await tx.select().from(decisionNodes).where(eq(decisionNodes.deviceId, deviceId)),
    };
  });

  return NextResponse.json(saved);
}
