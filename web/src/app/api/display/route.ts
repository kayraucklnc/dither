import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { devices } from "@/lib/db/schema";
import { readDevice } from "@/lib/device-headers";
import { firmwareFor, serve } from "@/lib/device-screen";

/**
 * The hot path: a panel wakes, asks what to show, and goes back to sleep.
 *
 * The response shape is fixed by stock TRMNL firmware and is documented in
 * docs/device-api-contract.md. Every field is always present; firmware_url and
 * firmware_version are null when there is nothing to update to. Do not
 * "improve" this payload - the device is not ours to change.
 */
export async function GET(request: Request) {
  const report = readDevice(request.headers);

  if (!report.accessToken) {
    return NextResponse.json({ error: "Missing access token." }, { status: 401 });
  }

  const [device] = await db.select().from(devices).where(eq(devices.apiKey, report.accessToken));
  if (!device) return NextResponse.json({ error: "Unknown device." }, { status: 404 });

  const now = new Date();

  // Telemetry lands before the flow is evaluated, so a rule about battery or
  // a button press sees this wake, not the last one.
  const [updated] = await db
    .update(devices)
    .set({
      firmwareVersion: report.firmwareVersion ?? device.firmwareVersion,
      width: report.width ?? device.width,
      height: report.height ?? device.height,
      batteryVoltage: report.batteryVoltage ?? device.batteryVoltage,
      percentCharged: report.percentCharged ?? device.percentCharged,
      usbConnected: report.usbConnected,
      rssi: report.rssi ?? device.rssi,
      wifiBand: report.wifiBand ?? device.wifiBand,
      updateSource: report.updateSource ?? null,
      lastSeenAt: now,
    })
    .where(eq(devices.id, device.id))
    .returning();

  const served = await serve(updated, now);
  const firmware = await firmwareFor(updated);
  const base = process.env.API_URI ?? new URL(request.url).origin;

  return NextResponse.json({
    filename: served.filename,
    firmware_url: firmware ? `${base}/api/firmware/${firmware.version}` : null,
    firmware_version: firmware?.version ?? null,
    image_url: `${base}/api/image/${served.storageKey}`,
    image_url_timeout: updated.imageTimeout,
    maximum_compatibility: false,
    refresh_rate: served.refreshSeconds,
    reset_firmware: false,
    special_function: "none",
    temperature_profile: "default",
    touchbar_mode: "tap",
    update_firmware: Boolean(firmware),
  });
}
