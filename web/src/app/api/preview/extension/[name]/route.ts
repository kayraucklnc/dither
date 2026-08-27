import { NextResponse } from "next/server";

import { defaultSettings, find } from "@/lib/extensions/registry";
import { DEFAULT_PANEL } from "@/lib/panel";
import { fingerprint, renderSolo } from "@/lib/render";
import { store } from "@/lib/storage";
import { COLUMNS, ROWS, pixelsFor, shape as findShape } from "@/lib/shapes";

/**
 * A thumbnail of one extension at one shape.
 *
 * The first version rendered these synchronously on every page load, which is
 * why the extension catalogue took seconds to appear: three cards meant three
 * Chromium launches. Now the fingerprint is computed without rendering, the
 * store is checked first, and the browser gets an ETag so a revisit costs a
 * 304 rather than a render.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const url = new URL(request.url);
  const shapeId = url.searchParams.get("shape") ?? "quarter";

  const extension = await find(name);
  if (!extension) return NextResponse.json({ error: "No such extension." }, { status: 404 });

  const shape = findShape(shapeId);
  if (!shape) return NextResponse.json({ error: "No such shape." }, { status: 400 });

  if (!extension.shapes.includes(shape.id)) {
    return NextResponse.json(
      { error: `${extension.manifest.label} has no ${shape.label.toLowerCase()} design.` },
      { status: 404 },
    );
  }

  const settings = defaultSettings(extension);
  const data = extension.manifest.sample as Record<string, unknown>;
  const [width, height] = pixelsFor(shape, DEFAULT_PANEL.width, DEFAULT_PANEL.height);

  // Same material the renderer would hash, computed without rendering.
  const key = await fingerprint(
    [{
      id: 0, extension: name, label: name, settings, data,
      column: 1, row: 1, columnSpan: COLUMNS, rowSpan: ROWS,
    }],
    { ...DEFAULT_PANEL, width, height },
  );

  if (request.headers.get("if-none-match") === `"${key}"`) {
    return new NextResponse(null, { status: 304 });
  }

  const cached = await store().get(`${key}.png`);
  const bytes = cached ?? (await renderSolo(name, shape.id, settings, data, DEFAULT_PANEL)).bytes;

  if (!cached) await store().put(`${key}.png`, bytes, "image/png");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      ETag: `"${key}"`,
      "Cache-Control": "public, max-age=30, stale-while-revalidate=86400",
    },
  });
}
