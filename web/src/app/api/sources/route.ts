import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { triggers } from "@/lib/db/schema";
import { refreshTrigger } from "@/lib/extensions/fetcher";
import { defaultSettings, find } from "@/lib/extensions/registry";

/**
 * Sources: the questions this installation asks of the world.
 *
 * Shared rather than owned by a device. "Milan transit" is not a property of a
 * panel, so the one in the hall and the one on the desk can both watch it and
 * it is fetched once for both. What each device chooses is its own
 * subscription - the checks and notices it builds on top.
 */
export async function GET() {
  return NextResponse.json({ sources: await db.select().from(triggers) });
}

const created = z.object({
  extension: z.string().min(1),
  label: z.string().default(""),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const parsed = created.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const extension = await find(parsed.data.extension);
  if (!extension) return NextResponse.json({ error: "No such extension." }, { status: 404 });

  if (!extension.manifest.facts.length) {
    return NextResponse.json(
      { error: `${extension.manifest.label} does not report anything to decide on.` },
      { status: 422 },
    );
  }

  const settings = parsed.data.settings ?? defaultSettings(extension);

  /*
   * The same question asked twice answers with the source that already exists.
   * Two calendars are only useful when they are *different* calendars, and a
   * silent failure that invited a second click once left four identical rows.
   */
  const existing = (await db.select().from(triggers)).find(
    (row) =>
      row.extension === extension.name &&
      JSON.stringify(row.settings) === JSON.stringify(settings),
  );

  if (existing) return NextResponse.json({ source: existing, reused: true });

  const [source] = await db
    .insert(triggers)
    .values({ extension: extension.name, label: parsed.data.label || extension.manifest.label, settings })
    .returning();

  // Fetch straight away, so the editor shows real values while a check is
  // being built rather than an empty dropdown you have to trust.
  await refreshTrigger(source);

  const [fresh] = await db.select().from(triggers).where(eq(triggers.id, source.id));
  return NextResponse.json({ source: fresh });
}

const updated = z.object({
  id: z.number(),
  label: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function PUT(request: Request) {
  const parsed = updated.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const [source] = await db
    .update(triggers)
    .set({
      ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
      ...(parsed.data.settings !== undefined ? { settings: parsed.data.settings } : {}),
    })
    .where(eq(triggers.id, parsed.data.id))
    .returning();

  if (!source) return NextResponse.json({ error: "No such source." }, { status: 404 });

  // Different settings means the answer it holds is about something else now.
  if (parsed.data.settings !== undefined) await refreshTrigger(source);

  const [fresh] = await db.select().from(triggers).where(eq(triggers.id, source.id));
  return NextResponse.json({ source: fresh });
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  await db.delete(triggers).where(eq(triggers.id, id));
  return NextResponse.json({ ok: true });
}
