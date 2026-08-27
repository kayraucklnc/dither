import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { decisionNodes, devices, models } from "@/lib/db/schema";
import { readDevice } from "@/lib/device-headers";

/**
 * A panel introduces itself. Answers a key the first time and an empty one
 * afterwards, which is what the firmware expects. See the contract doc.
 */
export async function GET(request: Request) {
  const report = readDevice(request.headers);
  const base = process.env.API_URI ?? new URL(request.url).origin;

  const answer = (apiKey: string) =>
    NextResponse.json({
      api_key: apiKey,
      image_url: `${base}/assets/setup.bmp`,
      message: "Welcome to Dither!",
      status: 200,
    });

  if (!report.macAddress) {
    return NextResponse.json({ error: "Missing device id." }, { status: 400 });
  }

  const [known] = await db.select().from(devices).where(eq(devices.macAddress, report.macAddress));
  if (known) return answer("");

  // Match the panel the device claims to be; fall back to a generic 800x480
  // rather than refusing, so an unknown model still gets on the network.
  const [model] =
    (report.model
      ? await db.select().from(models).where(eq(models.name, report.model))
      : []).concat(await db.select().from(models).where(eq(models.name, "byod_custom")));

  if (!model) return NextResponse.json({ error: "No models are installed." }, { status: 503 });

  const apiKey = randomBytes(16).toString("hex");

  const [device] = await db
    .insert(devices)
    .values({
      name: `Panel ${report.macAddress.slice(-5)}`,
      macAddress: report.macAddress,
      apiKey,
      modelId: model.id,
      firmwareVersion: report.firmwareVersion,
      width: report.width ?? model.width,
      height: report.height ?? model.height,
    })
    .returning();

  // A device with no tree can never show anything, so it arrives with a
  // one-leaf tree rather than waiting for someone to notice.
  const [root] = await db
    .insert(decisionNodes)
    .values({ deviceId: device.id, kind: "screen", label: "Home", x: 40, y: 40 })
    .returning();

  await db.update(devices).set({ rootNodeId: root.id }).where(eq(devices.id, device.id));

  return answer(apiKey);
}
