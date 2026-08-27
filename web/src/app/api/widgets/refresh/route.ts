import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { widgets } from "@/lib/db/schema";
import { refresh } from "@/lib/extensions/fetcher";

/**
 * Fetch now, on demand.
 *
 * Previews never fetch on their own - a preview that waits on a third party is
 * one nobody uses - so this exists for the button that says "get the real
 * numbers".
 */
const body = z.object({ widgetIds: z.array(z.number()).min(1).max(24) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const rows = await db.select().from(widgets).where(inArray(widgets.id, parsed.data.widgetIds));
  const results = await Promise.all(rows.map((widget) => refresh(widget)));

  return NextResponse.json({ results });
}

export async function GET(request: Request) {
  const screenId = Number(new URL(request.url).searchParams.get("screenId"));
  if (!Number.isInteger(screenId)) return NextResponse.json({ error: "Bad screen." }, { status: 400 });

  const rows = await db.select().from(widgets).where(eq(widgets.screenId, screenId));
  const results = await Promise.all(rows.map((widget) => refresh(widget)));

  return NextResponse.json({ results });
}
