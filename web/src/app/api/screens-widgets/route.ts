import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { widgets } from "@/lib/db/schema";

/** The widgets on a screen. Used by the checks; the editor gets them rendered. */
export async function GET(request: Request) {
  const screenId = Number(new URL(request.url).searchParams.get("screenId"));
  if (!Number.isInteger(screenId)) return NextResponse.json({ error: "Bad screen." }, { status: 400 });

  return NextResponse.json({
    widgets: await db.select().from(widgets).where(eq(widgets.screenId, screenId)),
  });
}
