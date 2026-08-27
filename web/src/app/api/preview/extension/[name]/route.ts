import { NextResponse } from "next/server";

import { defaultSettings, find, supportsSize } from "@/lib/extensions/registry";
import { DEFAULT_PANEL } from "@/lib/panel";
import { fingerprint, renderSolo } from "@/lib/render";
import { store } from "@/lib/storage";
import { refusal } from "@/lib/designs";
import { COLUMNS, ROWS, parseSize, pixelsFor } from "@/lib/shapes";

/**
 * A thumbnail of one extension at one shape.
 *
 * The first version rendered these synchronously on every page load, which is
 * why the extension catalogue took seconds to appear: three cards meant three
 * Chromium launches. Now the fingerprint is computed without rendering, the
 * store is checked first, and the browser gets an ETag so a revisit costs a
 * 304 rather than a render.
 */
/**
 * Settings passed in the URL, so a thumbnail can preview a *choice*.
 *
 * The style picker shows what each design looks like with the settings this
 * widget already has, not with the extension's defaults - picking between five
 * revenue designs is useless if all five are drawn showing today's takings
 * when the widget is set to MRR.
 */
function settingsFromQuery(url: URL): Record<string, unknown> {
  const raw = url.searchParams.get("settings");
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const url = new URL(request.url);

  // A preset name or a plain "6x4". Both spellings have to work: the named one
  // because it reads, the numeric one because with a free grid most sizes have
  // no name at all.
  const size = parseSize(url.searchParams.get("size") ?? url.searchParams.get("shape") ?? "quarter");
  if (!size) return NextResponse.json({ error: "No such size." }, { status: 400 });

  /** Which style to draw. Empty means whichever design fits the size best. */
  const design = url.searchParams.get("design") ?? undefined;

  const extension = await find(name);
  if (!extension) return NextResponse.json({ error: "No such extension." }, { status: 404 });

  if (!supportsSize(extension, size)) {
    return NextResponse.json(
      { error: refusal(extension.manifest.label, size, extension.designs) },
      { status: 404 },
    );
  }

  /**
   * Stand-in notices, so the catalogue can show a design with and without.
   *
   * They are this extension's *own* declared alerts where it has any, at their
   * own levels - a departure board previews a cancellation, a revenue panel
   * previews failing payments. A generic string tells you the strip exists; its
   * own alerts tell you whether they fit.
   */
  const withNotice = url.searchParams.get("notice") === "1";

  const notices = withNotice
    ? (extension.manifest.notices.length
        ? extension.manifest.notices
        : [
            { icon: "alert", text: "Something worth knowing", level: "warn" as const },
            { icon: "info", text: "And something quieter", level: "info" as const },
          ]
      )
        .slice(0, extension.manifest.notice_capacity)
        .map((notice) => ({
          icon: notice.icon,
          // The declared text is Liquid over live data; the label is the plain
          // sentence, which is what a preview wants.
          text: "label" in notice ? notice.label : notice.text,
          level: notice.level,
        }))
    : [];

  const settings = { ...defaultSettings(extension), ...settingsFromQuery(url) };
  const data = extension.manifest.sample as Record<string, unknown>;
  const [width, height] = pixelsFor(size, DEFAULT_PANEL.width, DEFAULT_PANEL.height);

  // Same material the renderer would hash, computed without rendering.
  const key = await fingerprint(
    [{
      id: 0, extension: name, label: name, settings, data, design,
      column: 1, row: 1, columnSpan: COLUMNS, rowSpan: ROWS,
    }],
    { ...DEFAULT_PANEL, width, height },
    notices,
  );

  if (request.headers.get("if-none-match") === `"${key}"`) {
    return new NextResponse(null, { status: 304 });
  }

  const cached = await store().get(`${key}.png`);
  const bytes =
    cached ?? (await renderSolo(name, size, settings, data, DEFAULT_PANEL, notices, design)).bytes;

  if (!cached) await store().put(`${key}.png`, bytes, "image/png");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      ETag: `"${key}"`,
      // Ask every time; the key above already covers the template and the
      // stylesheet, so an unchanged tile costs a 304. A freshness window here
      // is the same lie the screen previews used to tell - edit a template and
      // the catalogue keeps yesterday's picture.
      "Cache-Control": "no-cache",
    },
  });
}
