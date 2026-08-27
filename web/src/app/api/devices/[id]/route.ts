import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { devices } from "@/lib/db/schema";

/** What a device is called, how often it wakes, and when it should not. */
const body = z.object({
  name: z.string().min(1).max(60).optional(),
  refreshRate: z.number().int().min(60).max(86_400).optional(),
  imageTimeout: z.number().int().min(0).max(600).optional(),
  sleepStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
  sleepStopMinute: z.number().int().min(0).max(1439).nullable().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const parsed = body.safeParse(await request.json());

  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  }

  const [device] = await db
    .update(devices)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(devices.id, id))
    .returning();

  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });
  return NextResponse.json({ device });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  await db.delete(devices).where(eq(devices.id, id));
  return NextResponse.json({ ok: true });
}
