import { eq } from "drizzle-orm";
import { Liquid } from "liquidjs";

import { provider } from "@/lib/connections";
import { db } from "@/lib/db";
import { connections, widgetData, widgets, type Widget } from "@/lib/db/schema";
import { find } from "@/lib/extensions/registry";

/**
 * Getting a widget its data.
 *
 * Per widget, not per extension: two weather widgets with different settings
 * ask different questions and must not share an answer. This is the practical
 * consequence of a widget being a placement rather than a singleton, and it is
 * why `widget_data` is keyed by widget id.
 *
 * A failure is recorded, not thrown. A provider being down should leave the
 * previous data on screen with a note, not blank the panel.
 */

const engine = new Liquid({ strictVariables: false, strictFilters: false });

const MINUTES: Record<string, number> = { none: 0, minute: 1, hour: 60, day: 1440 };

/** How old data may get before it is worth fetching again. */
export function stalenessMinutes(interval: number, unit: string): number {
  return interval * (MINUTES[unit] ?? 0);
}

export async function isStale(widget: Widget, now = new Date()): Promise<boolean> {
  const extension = await find(widget.extension);
  if (!extension || extension.manifest.kind === "static") return false;

  const window = stalenessMinutes(extension.manifest.interval, extension.manifest.unit);
  if (window <= 0) return false;

  const [row] = await db.select().from(widgetData).where(eq(widgetData.widgetId, widget.id));
  if (!row?.fetchedAt) return true;

  return now.getTime() - row.fetchedAt.getTime() >= window * 60_000;
}

async function poll(
  extension: NonNullable<Awaited<ReturnType<typeof find>>>,
  settings: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};

  for (const [index, exchange] of extension.manifest.exchanges.entries()) {
    // The URL is a Liquid template over the widget's settings, which is what
    // lets two weather widgets on one screen fetch two different cities.
    const url = await engine.parseAndRender(exchange.template, {
      extension: { name: extension.name, label: extension.manifest.label, values: settings },
    });

    const response = await fetch(url.trim(), {
      method: exchange.verb.toUpperCase(),
      headers: exchange.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`${extension.manifest.label}: ${response.status} from source_${index + 1}.`);

    payload[`source_${index + 1}`] = await response.json();
  }

  return payload;
}

async function fromConnection(
  extension: NonNullable<Awaited<ReturnType<typeof find>>>,
  settings: Record<string, unknown>,
  now: Date,
): Promise<Record<string, unknown>> {
  const id = extension.manifest.connection;
  const source = id ? provider(id) : undefined;

  if (!source) throw new Error(`${extension.manifest.label} needs a connection that does not exist.`);

  const [linked] = await db.select().from(connections).where(eq(connections.provider, source.id));

  // A mocked provider answers without a link, so screens can be designed before
  // anyone has signed in. A real one must not.
  if (!linked && !source.mocked) {
    throw new Error(`Link your ${source.label} account to use ${extension.manifest.label}.`);
  }

  return source.fetch(settings, now);
}

export interface FetchResult {
  widgetId: number;
  payload?: Record<string, unknown>;
  error?: string;
}

export async function refresh(widget: Widget, now = new Date()): Promise<FetchResult> {
  const extension = await find(widget.extension);

  if (!extension) return { widgetId: widget.id, error: `${widget.extension} is not installed.` };
  if (extension.manifest.kind === "static") return { widgetId: widget.id };

  try {
    const settings = widget.settings;

    const payload =
      extension.manifest.kind === "connection"
        ? await fromConnection(extension, settings, now)
        : extension.manifest.kind === "poll"
          ? await poll(extension, settings)
          : // Transit providers are not ported yet; the sample stands in.
            (extension.manifest.sample as Record<string, unknown>);

    await db
      .insert(widgetData)
      .values({ widgetId: widget.id, payload, fetchedAt: now, error: null })
      .onConflictDoUpdate({
        target: widgetData.widgetId,
        set: { payload, fetchedAt: now, error: null },
      });

    return { widgetId: widget.id, payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Keep whatever was there. A dead API should not blank the display.
    await db
      .insert(widgetData)
      .values({ widgetId: widget.id, payload: {}, error: message })
      .onConflictDoUpdate({ target: widgetData.widgetId, set: { error: message } });

    return { widgetId: widget.id, error: message };
  }
}

/** Refresh every widget on a screen whose data has aged out. */
export async function refreshScreen(screenId: number, now = new Date()): Promise<FetchResult[]> {
  const rows = await db.select().from(widgets).where(eq(widgets.screenId, screenId));
  const due = [];

  for (const widget of rows) if (await isStale(widget, now)) due.push(widget);

  return Promise.all(due.map((widget) => refresh(widget, now)));
}
