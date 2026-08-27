import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { deviceLogs, devices } from "@/lib/db/schema";
import { readDevice } from "@/lib/device-headers";

/** The device posts its own logs here. Stored verbatim. */
export async function POST(request: Request) {
  const report = readDevice(request.headers);
  if (!report.accessToken) return NextResponse.json({ error: "Missing access token." }, { status: 401 });

  const [device] = await db.select().from(devices).where(eq(devices.apiKey, report.accessToken));
  if (!device) return NextResponse.json({ error: "Unknown device." }, { status: 404 });

  const payload = await request.json().catch(() => ({}));
  await db.insert(deviceLogs).values({ deviceId: device.id, payload });

  return NextResponse.json({ status: 200 });
}
