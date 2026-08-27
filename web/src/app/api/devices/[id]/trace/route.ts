import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { decisionNodes, devices, notices } from "@/lib/db/schema";
import { toNodes } from "@/lib/device-screen";
import { contextFor, sourceExtensions, type Overrides } from "@/lib/flow/context";
import { editorSources } from "@/lib/flow/editor-sources";
import { activeNotices, noticeHosts } from "@/lib/flow/notices";
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
/** Notices to force on or off regardless of their condition, when pretending. */
export type ForcedNotices = Record<string, "on" | "off">;

async function answer(
  id: number,
  now: Date,
  overrides: Overrides,
  simulated: boolean,
  forced: ForcedNotices = {},
) {
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

  const rules = await db.select().from(notices).where(eq(notices.deviceId, id));

  const said = await activeNotices(
    rules,
    context,
    await sourceExtensions(id),
    Object.fromEntries(Object.entries(forced).map(([id, state]) => [Number(id), state])),
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
    firing: said.map((notice) => notice.id),
    hosts: await noticeHosts(id, result.leaf?.screenId ?? null),
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
  notices: z.record(z.string(), z.enum(["on", "off"])).default({}),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const parsed = simulation.safeParse(await request.json().catch(() => ({})));

  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const at = parsed.data.at ? new Date(parsed.data.at) : new Date();
  if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "Bad time." }, { status: 400 });

  return answer(id, at, parsed.data.overrides, true, parsed.data.notices);
}
