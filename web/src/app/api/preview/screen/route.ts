import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { models } from "@/lib/db/schema";
import { DEFAULT_PANEL, panelFor } from "@/lib/panel";
import { fingerprint, renderScreen } from "@/lib/render";
import type { PlacedWidget } from "@/lib/render/compose";
import { store } from "@/lib/storage";
import { dataFor } from "@/lib/widget-data";

/**
 * Render an arbitrary arrangement of widgets, saved or not.
 *
 * The editor posts what is currently on the canvas, so the picture you are
 * looking at is the picture the device would get - including the parts you
 * have not saved yet. Anything less and "see how the full screen will look"
 * is a promise the editor cannot keep.
 */
const body = z.object({
  modelId: z.number().optional(),
  widgets: z.array(
    z.object({
      id: z.number().default(0),
      extension: z.string(),
      label: z.string().default(""),
      settings: z.record(z.string(), z.unknown()).default({}),
      column: z.number(),
      row: z.number(),
      columnSpan: z.number(),
      rowSpan: z.number(),
    }),
  ),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { modelId, widgets } = parsed.data;

  const panel = modelId
    ? await db
        .select()
        .from(models)
        .where(eq(models.id, modelId))
        .then(([model]) => (model ? panelFor(model) : DEFAULT_PANEL))
    : DEFAULT_PANEL;

  const data = await dataFor(widgets.map((widget) => ({ id: widget.id, extension: widget.extension })));

  const placed: PlacedWidget[] = widgets.map((widget) => ({
    ...widget,
    data: data.get(widget.id) ?? {},
  }));

  const key = await fingerprint(placed, panel);
  const cached = await store().get(`${key}.png`);

  if (cached) {
    return new NextResponse(new Uint8Array(cached), {
      headers: {
        "Content-Type": "image/png",
        "X-Dither-Fingerprint": key,
        "Cache-Control": "no-store",
      },
    });
  }

  const rendered = await renderScreen(placed, panel);
  await store().put(`${key}.png`, rendered.bytes, "image/png");

  return new NextResponse(new Uint8Array(rendered.bytes), {
    headers: {
      "Content-Type": "image/png",
      "X-Dither-Fingerprint": rendered.fingerprint,
      // Problems ride along so the editor can name a refused shape without a
      // second round trip.
      "X-Dither-Problems": encodeURIComponent(JSON.stringify(rendered.problems)),
      "Cache-Control": "no-store",
    },
  });
}
