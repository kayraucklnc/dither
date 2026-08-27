import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { devices, models, notices, screens, widgets } from "@/lib/db/schema";
import { DEFAULT_PANEL, panelFor } from "@/lib/panel";
import { fingerprint, renderScreen } from "@/lib/render";
import { store } from "@/lib/storage";
import { contextFor, sourceExtensions } from "@/lib/flow/context";
import { activeNotices } from "@/lib/flow/notices";

interface Simulation {
  at: Date;
  overrides: Record<string, Record<string, unknown>>;
  notices: Record<number, "on" | "off">;
}

/** Base64 JSON, because a `<img src>` cannot carry a body. */
function readSimulation(raw: string | null): Simulation {
  const empty: Simulation = { at: new Date(), overrides: {}, notices: {} };
  if (!raw) return empty;

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const at = parsed.at ? new Date(parsed.at) : new Date();

    return {
      at: Number.isNaN(at.getTime()) ? new Date() : at,
      overrides: parsed.overrides ?? {},
      notices: Object.fromEntries(
        Object.entries(parsed.notices ?? {}).map(([id, state]) => [Number(id), state]),
      ) as Record<number, "on" | "off">,
    };
  } catch {
    // A malformed parameter should show the truth, not an error page.
    return empty;
  }
}
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
  const data = await dataFor(
    rows.map((row) => ({ id: row.id, extension: row.extension, settings: row.settings })),
    { ensure: true },
  );

  const placed = rows.map((row) => ({
    id: row.id,
    extension: row.extension,
    label: row.label,
    settings: row.settings,
    data: data.get(row.id)?.payload ?? {},
    problem: data.get(row.id)?.problem,
    standIn: data.get(row.id)?.standIn,
    column: row.column,
    row: row.row,
    columnSpan: row.columnSpan,
    rowSpan: row.rowSpan,
    design: row.design,
    hostsNotices: row.hostsNotices,
  }));

  // With a device named, the preview shows what that device would actually be
  // handed - notices included - rather than the screen in the abstract.
  const deviceId = Number(new URL(request.url).searchParams.get("deviceId"));
  const [device] = Number.isInteger(deviceId) && deviceId > 0
    ? await db.select().from(devices).where(eq(devices.id, deviceId))
    : [undefined];

  /**
   * A thumbnail has to agree with the trace beside it.
   *
   * The Test tab can pretend it is a different hour, that a value is other
   * than it is, or that an alert is firing. A preview that ignores all that
   * shows the truth while the trace shows the pretence, and the two disagree
   * on screen. It rides in the URL because these are `<img src>`, which cannot
   * post a body.
   */
  const simulation = readSimulation(new URL(request.url).searchParams.get("sim"));

  const said = device
    ? await activeNotices(
        await db.select().from(notices).where(eq(notices.deviceId, device.id)),
        await contextFor(device, simulation.at, simulation.overrides),
        await sourceExtensions(),
        simulation.notices,
      )
    : [];

  /**
   * The moment being drawn, which reaches the key as `now` and is quantised
   * there by whatever tick the designs on this screen declare.
   *
   * It used to go in raw, as milliseconds, which made every request a key
   * nothing had ever used: the stored render was never reused, so every
   * thumbnail was drawn again from scratch, and the ETag below could never
   * match, so no browser was ever told its copy was still good.
   */
  const when = { now: simulation.at };

  const key = await fingerprint(placed, panel, said, undefined, when);

  if (request.headers.get("if-none-match") === `"${key}"`) {
    return new NextResponse(null, { status: 304 });
  }

  const cached = await store().get(`${key}.png`);
  const bytes = cached ?? (await renderScreen(placed, panel, said, when)).bytes;
  if (!cached) await store().put(`${key}.png`, bytes, "image/png");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      ETag: `"${key}"`,
      /*
       * Keep the copy, but never draw it without asking first.
       *
       * The fingerprint above already covers everything that can change the
       * picture, so revalidating costs a 304 and nothing else - while a
       * freshness window costs correctness: edit a screen, walk back to the
       * device that shows it, and the tree hands you the picture from before
       * the edit. `stale-while-revalidate` made that permanent rather than
       * momentary, because the fresh copy lands in the cache instead of on
       * the screen, leaving every thumbnail exactly one visit behind.
       */
      "Cache-Control": "no-cache",
    },
  });
}
