import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { decisionNodes, devices, notices } from "@/lib/db/schema";
import { toNodes } from "@/lib/device-screen";
import { contextFor, type Overrides } from "@/lib/flow/context";
import { editorSources } from "@/lib/flow/editor-sources";
import { activeNotices } from "@/lib/flow/notices";
import { walk } from "@/lib/flow/tree";

/**
 * What the tree answers, and the path it took to get there.
 *
 * GET answers for right now. POST answers for a moment and some values you
 * have made up, which is the only practical way to check a rule about rain in
 * August - the alternative is waiting for weather or trusting the arithmetic.
 *
 * Live source values ride along either way, so the check editor can show what
 * it is comparing against without a second request.
 */
async function answer(id: number, now: Date, overrides: Overrides, simulated: boolean) {
  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  const rows = await db.select().from(decisionNodes).where(eq(decisionNodes.deviceId, id));
  const context = await contextFor(device, now, overrides);

  const result = walk(
    toNodes(rows),
    device.rootNodeId,
    // A simulated run must not inherit a hold from the real one, or "what
    // happens at 8am" answers "whatever it is showing now".
    simulated
      ? { currentNodeId: null, nodeEnteredAt: null }
      : { currentNodeId: device.currentNodeId, nodeEnteredAt: device.nodeEnteredAt },
    context,
    device.refreshRate,
  );

  const said = await activeNotices(
    await db.select().from(notices).where(eq(notices.deviceId, id)),
    context,
  );

  return NextResponse.json({
    simulated,
    at: now.toISOString(),
    leafId: result.leaf?.id ?? null,
    leafLabel: result.leaf?.label ?? null,
    screenId: result.leaf?.screenId ?? null,
    refreshSeconds: result.refreshSeconds,
    held: result.held,
    reason: result.reason,
    steps: result.steps,
    notices: said,
    sources: await editorSources(device, now),
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  return answer(id, new Date(), {}, false);
}

const simulation = z.object({
  /** ISO timestamp to pretend it is. */
  at: z.string().optional(),
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const parsed = simulation.safeParse(await request.json().catch(() => ({})));

  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const at = parsed.data.at ? new Date(parsed.data.at) : new Date();
  if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "Bad time." }, { status: 400 });

  return answer(id, at, parsed.data.overrides, true);
}
