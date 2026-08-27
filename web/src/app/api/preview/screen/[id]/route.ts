import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { devices, models, notices, screens, widgets } from "@/lib/db/schema";
import { DEFAULT_PANEL, panelFor } from "@/lib/panel";
import { fingerprint, renderScreen } from "@/lib/render";
import { store } from "@/lib/storage";
import { contextFor } from "@/lib/flow/context";
import { activeNotices } from "@/lib/flow/notices";
import { dataFor } from "@/lib/widget-data";

/** A saved screen, rendered for a panel. Used by every list and thumbnail. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const [screen] = await db.select().from(screens).where(eq(screens.id, id));
  if (!screen) return NextResponse.json({ error: "No such screen." }, { status: 404 });

  const modelId = Number(new URL(request.url).searchParams.get("modelId"));
  const panel = Number.isInteger(modelId) && modelId > 0
    ? await db.select().from(models).where(eq(models.id, modelId))
        .then(([model]) => (model ? panelFor(model) : DEFAULT_PANEL))
    : DEFAULT_PANEL;

  const rows = await db.select().from(widgets).where(eq(widgets.screenId, id));
  const data = await dataFor(rows.map((row) => ({ id: row.id, extension: row.extension })));

  const placed = rows.map((row) => ({
    id: row.id,
    extension: row.extension,
    label: row.label,
    settings: row.settings,
    data: data.get(row.id) ?? {},
    column: row.column,
    row: row.row,
    columnSpan: row.columnSpan,
    rowSpan: row.rowSpan,
  }));

  // With a device named, the preview shows what that device would actually be
  // handed - notices included - rather than the screen in the abstract.
  const deviceId = Number(new URL(request.url).searchParams.get("deviceId"));
  const [device] = Number.isInteger(deviceId) && deviceId > 0
    ? await db.select().from(devices).where(eq(devices.id, deviceId))
    : [undefined];

  const said = device
    ? await activeNotices(
        await db.select().from(notices).where(eq(notices.deviceId, device.id)),
        await contextFor(device),
      )
    : [];

  const key = await fingerprint(placed, panel, said);

  if (request.headers.get("if-none-match") === `"${key}"`) {
    return new NextResponse(null, { status: 304 });
  }

  const cached = await store().get(`${key}.png`);
  const bytes = cached ?? (await renderScreen(placed, panel, said)).bytes;
  if (!cached) await store().put(`${key}.png`, bytes, "image/png");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      ETag: `"${key}"`,
      "Cache-Control": "public, max-age=15, stale-while-revalidate=86400",
    },
  });
}
