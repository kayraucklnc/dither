import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { widgets } from "@/lib/db/schema";
import { refreshWidgets } from "@/lib/extensions/fetcher";

/**
 * Ask again, now.
 *
 * Previews never fetch on their own - a preview waiting on a third party is one
 * nobody uses - so this is what the editor calls after settings settle, and
 * what the "get the real numbers" button calls.
 */
const body = z.object({ widgetIds: z.array(z.number()).min(1).max(24) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  return NextResponse.json({ results: await refreshWidgets(parsed.data.widgetIds) });
}

export async function GET(request: Request) {
  const screenId = Number(new URL(request.url).searchParams.get("screenId"));
  if (!Number.isInteger(screenId)) return NextResponse.json({ error: "Bad screen." }, { status: 400 });

  const rows = await db.select().from(widgets).where(eq(widgets.screenId, screenId));
  return NextResponse.json({ results: await refreshWidgets(rows.map((row) => row.id)) });
}
