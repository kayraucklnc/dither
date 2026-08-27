import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { devices, notices, triggers } from "@/lib/db/schema";
import { find } from "@/lib/extensions/registry";
import { conditionSchema } from "@/lib/flow/conditions";

/**
 * Notices: what a device says on top of whatever screen it is showing.
 *
 * GET also answers the notices this device's sources *suggest* - a transit
 * source offers "tell me about service alerts" - so the common case is a
 * click rather than a rule you compose by hand.
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const rows = await db.select().from(notices).where(eq(notices.deviceId, deviceId));
  const sources = await db.select().from(triggers).where(eq(triggers.deviceId, deviceId));

  const suggestions = [];

  for (const source of sources) {
    const extension = await find(source.extension);

    for (const notice of extension?.manifest.notices ?? []) {
      const already = rows.some((row) => {
        const condition = row.condition as { sourceId?: string; factKey?: string };
        return condition.sourceId === String(source.id) && condition.factKey === notice.when.fact;
      });

      if (already) continue;

      suggestions.push({
        sourceId: String(source.id),
        sourceLabel: source.label || extension?.manifest.label,
        key: notice.key,
        label: notice.label,
        icon: notice.icon,
        text: notice.text,
        loud: notice.loud,
        condition: {
          kind: "fact" as const,
          sourceId: String(source.id),
          factKey: notice.when.fact,
          operator: notice.when.operator,
          value: notice.when.value,
        },
      });
    }
  }

  return NextResponse.json({ notices: rows, suggestions });
}

const created = z.object({
  label: z.string().default(""),
  condition: conditionSchema,
  icon: z.string().default("alert"),
  text: z.string().default(""),
  loud: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  const parsed = created.safeParse(await request.json());

  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  const [notice] = await db
    .insert(notices)
    .values({
      deviceId,
      label: parsed.data.label,
      condition: parsed.data.condition as unknown as Record<string, unknown>,
      icon: parsed.data.icon,
      text: parsed.data.text,
      loud: parsed.data.loud,
    })
    .returning();

  return NextResponse.json({ notice });
}

const updated = z.object({
  id: z.number(),
  label: z.string().optional(),
  condition: conditionSchema.optional(),
  icon: z.string().optional(),
  text: z.string().optional(),
  loud: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  const parsed = updated.safeParse(await request.json());

  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { id, condition, ...rest } = parsed.data;

  const [notice] = await db
    .update(notices)
    .set({
      ...rest,
      ...(condition ? { condition: condition as unknown as Record<string, unknown> } : {}),
    })
    .where(and(eq(notices.id, id), eq(notices.deviceId, deviceId)))
    .returning();

  if (!notice) return NextResponse.json({ error: "No such notice." }, { status: 404 });
  return NextResponse.json({ notice });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  const id = Number(new URL(request.url).searchParams.get("id"));

  if (!Number.isInteger(deviceId) || !Number.isInteger(id)) {
    return NextResponse.json({ error: "Bad id." }, { status: 400 });
  }

  await db.delete(notices).where(and(eq(notices.id, id), eq(notices.deviceId, deviceId)));
  return NextResponse.json({ ok: true });
}
