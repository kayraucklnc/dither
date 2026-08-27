import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { devices } from "@/lib/db/schema";

/**
 * Look a device up by MAC.
 *
 * Exists so the contract check can remove the device it registers. Without it
 * every run leaves one behind and the dashboard becomes a list of past test
 * runs, which is how seven of them accumulated.
 */
export async function GET(request: Request) {
  const mac = new URL(request.url).searchParams.get("mac");
  if (!mac) return NextResponse.json({ error: "Missing mac." }, { status: 400 });

  const [device] = await db.select().from(devices).where(eq(devices.macAddress, mac));
  if (!device) return NextResponse.json({ error: "No such device." }, { status: 404 });

  return NextResponse.json({ id: device.id, name: device.name });
}
