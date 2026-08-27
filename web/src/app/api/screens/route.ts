import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { screens } from "@/lib/db/schema";

/** Make a screen. Used by the tree editor, so a new leaf has something to show. */
const body = z.object({ name: z.string().min(1).default("New screen") });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  const name = parsed.success ? parsed.data.name : "New screen";

  const [screen] = await db.insert(screens).values({ name }).returning();
  return NextResponse.json({ screen });
}
