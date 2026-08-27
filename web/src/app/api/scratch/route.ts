import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { decisionNodes, devices, models, screens, widgets } from "@/lib/db/schema";

const SCREEN = "Scratch — for checks";
const DEVICE = "Scratch panel";

/**
 * A screen and a device for the browser checks to work on.
 *
 * They drive the real editor, so they save; without somewhere of their own
 * they save over whatever is seeded. Created once and reused, so a run leaves
 * nothing new behind.
 */
export async function GET() {
  const existing = await db.select().from(screens).where(eq(screens.name, SCREEN));

  const screen =
    existing[0] ??
    (
      await db
        .insert(screens)
        .values({ name: SCREEN, description: "Safe to scribble on. Recreated on demand." })
        .returning()
    )[0];

  if (!(await db.select().from(widgets).where(eq(widgets.screenId, screen.id))).length) {
    await db.insert(widgets).values({
      screenId: screen.id,
      extension: "public_transport",
      label: "Cadorna to Saronno",
      settings: {
        country: "it", city: "milan", provider: "trenord",
        origin: "Milano Cadorna", destination: "Saronno",
      },
      column: 1, row: 1, columnSpan: 3, rowSpan: 6,
    });
  }

  const known = await db.select().from(devices).where(eq(devices.name, DEVICE));
  let device = known[0];

  if (!device) {
    const [panel] = await db.select().from(models).where(eq(models.name, "og_plus"));

    [device] = await db
      .insert(devices)
      .values({
        name: DEVICE,
        macAddress: `SC:RA:TC:H0:00:${randomBytes(1).toString("hex")}`,
        apiKey: randomBytes(16).toString("hex"),
        modelId: panel.id,
        width: panel.width,
        height: panel.height,
        lastSeenAt: new Date(),
      })
      .returning();

    const [root] = await db
      .insert(decisionNodes)
      .values({ deviceId: device.id, kind: "screen", label: "Home", screenId: screen.id, x: 40, y: 40 })
      .returning();

    await db.update(devices).set({ rootNodeId: root.id }).where(eq(devices.id, device.id));
  }

  return NextResponse.json({ screenId: screen.id, deviceId: device.id });
}
