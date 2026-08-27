import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { triggers } from "@/lib/db/schema";
import { refreshTrigger } from "@/lib/extensions/fetcher";

/**
 * Fetch every source on this device now.
 *
 * Sources refresh on their own schedule when a device wakes, which is right
 * for a panel and wrong for someone building a rule and wanting to see the
 * number move. This is that button.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const deviceId = Number((await params).id);
  if (!Number.isInteger(deviceId)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const rows = await db.select().from(triggers).where(eq(triggers.deviceId, deviceId));
  const results = await Promise.all(rows.map((trigger) => refreshTrigger(trigger)));

  return NextResponse.json({ refreshed: results.length, results });
}
