import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { triggers } from "@/lib/db/schema";
import { refreshTrigger } from "@/lib/extensions/fetcher";

/**
 * Fetch every source now.
 *
 * Sources refresh on their own schedule when a device wakes, which is right for
 * a panel and wrong for someone building a rule and wanting to watch the number
 * move. This is that button.
 */
export async function POST() {
  const rows = await db.select().from(triggers);
  const results = await Promise.all(rows.map((source) => refreshTrigger(source)));

  return NextResponse.json({ refreshed: results.length, results });
}
