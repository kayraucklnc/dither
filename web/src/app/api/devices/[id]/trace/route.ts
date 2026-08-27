import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { decisionNodes, devices } from "@/lib/db/schema";
import { toNodes } from "@/lib/device-screen";
import { contextFor } from "@/lib/flow/context";
import { editorSources } from "@/lib/flow/editor-sources";
import { walk } from "@/lib/flow/tree";

/**
 * What the tree answers right now, and the path it took to get there.
 *
 * This is the answer to "my display is showing the wrong thing and I cannot
 * tell why". The canvas lights the path up, so the explanation is the picture
 * you are already looking at. Live source values ride along, so the check
 * editor can show what it is comparing against without a second request.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  const now = new Date();
  const rows = await db.select().from(decisionNodes).where(eq(decisionNodes.deviceId, id));

  const result = walk(
    toNodes(rows),
    device.rootNodeId,
    { currentNodeId: device.currentNodeId, nodeEnteredAt: device.nodeEnteredAt },
    await contextFor(device, now),
    device.refreshRate,
  );

  return NextResponse.json({
    leafId: result.leaf?.id ?? null,
    leafLabel: result.leaf?.label ?? null,
    refreshSeconds: result.refreshSeconds,
    held: result.held,
    reason: result.reason,
    steps: result.steps,
    sources: await editorSources(device, now),
  });
}
