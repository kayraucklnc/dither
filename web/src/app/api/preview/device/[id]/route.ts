import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { devices } from "@/lib/db/schema";
import { serve } from "@/lib/device-screen";
import { store } from "@/lib/storage";

/**
 * Exactly what this device would be handed if it woke up now.
 *
 * Not an approximation and not a screen in the abstract: the tree is walked,
 * the notices are evaluated, and the same renderer runs. A dashboard that
 * shows something prettier than the panel would is a dashboard you cannot
 * trust.
 *
 * `serve` also advances the device's leaf, which is right - looking at the
 * dashboard is the only clock this system has when no hardware is connected.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const [device] = await db.select().from(devices).where(eq(devices.id, id));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  const served = await serve(device);

  if (request.headers.get("if-none-match") === `"${served.storageKey}"`) {
    return new NextResponse(null, { status: 304 });
  }

  const bytes = await store().get(served.storageKey);
  if (!bytes) return NextResponse.json({ error: "Nothing rendered." }, { status: 500 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      ETag: `"${served.storageKey}"`,
      "X-Dither-Screen": encodeURIComponent(served.screenName),
      "X-Dither-Reason": encodeURIComponent(served.walk.reason),
      "Cache-Control": "no-store",
    },
  });
}
