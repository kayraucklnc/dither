import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { devices, triggers } from "@/lib/db/schema";
import { refreshTrigger } from "@/lib/extensions/fetcher";
import { defaultSettings, find } from "@/lib/extensions/registry";

/**
 * The sources a device can decide on.
 *
 * A trigger is created here rather than borrowed from a screen, so you can
 * branch on a station, a city or a calendar you are not displaying anywhere.
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  return NextResponse.json({
    triggers: await db.select().from(triggers).where(eq(triggers.deviceId, deviceId)),
  });
}

const created = z.object({
  extension: z.string().min(1),
  label: z.string().default(""),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  const parsed = created.safeParse(await request.json());

  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  const extension = await find(parsed.data.extension);
  if (!extension) return NextResponse.json({ error: "No such extension." }, { status: 404 });

  if (!extension.manifest.facts.length) {
    return NextResponse.json(
      { error: `${extension.manifest.label} does not report anything to decide on.` },
      { status: 422 },
    );
  }

  const [trigger] = await db
    .insert(triggers)
    .values({
      deviceId,
      extension: extension.name,
      label: parsed.data.label || extension.manifest.label,
      settings: parsed.data.settings ?? defaultSettings(extension),
    })
    .returning();

  // Fetch straight away so the editor can show real values while you build the
  // check, rather than an empty dropdown you have to trust.
  await refreshTrigger(trigger);

  const [fresh] = await db.select().from(triggers).where(eq(triggers.id, trigger.id));
  return NextResponse.json({ trigger: fresh });
}

const updated = z.object({
  id: z.number(),
  label: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  const parsed = updated.safeParse(await request.json());

  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const [trigger] = await db
    .update(triggers)
    .set({
      ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
      ...(parsed.data.settings !== undefined ? { settings: parsed.data.settings } : {}),
    })
    .where(and(eq(triggers.id, parsed.data.id), eq(triggers.deviceId, deviceId)))
    .returning();

  if (!trigger) return NextResponse.json({ error: "No such trigger." }, { status: 404 });

  // Settings changed means the old answer is about something else now.
  if (parsed.data.settings !== undefined) await refreshTrigger(trigger);

  const [fresh] = await db.select().from(triggers).where(eq(triggers.id, trigger.id));
  return NextResponse.json({ trigger: fresh });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  const id = Number(new URL(request.url).searchParams.get("id"));

  if (!Number.isInteger(deviceId) || !Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id." }, { status: 400 });
  }

  await db.delete(triggers).where(and(eq(triggers.id, id), eq(triggers.deviceId, deviceId)));
  return NextResponse.json({ ok: true });
}
