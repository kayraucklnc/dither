import { eq, inArray } from "drizzle-orm";
import { Liquid } from "liquidjs";

import { provider } from "@/lib/connections";
import { db } from "@/lib/db";
import { readyAccounts, stored } from "@/lib/connections/link";
import { observations, triggers, widgets, type Widget } from "@/lib/db/schema";
import { find, type Extension } from "@/lib/extensions/registry";
import {
  answersFor,
  observationKey,
  record,
  recordFailure,
  type Answer,
  type Question,
} from "@/lib/extensions/observations";
import { environment } from "@/lib/settings";
import { board } from "@/lib/transit/board";

/**
 * Getting an answer to a question.
 *
 * A question is an extension plus settings - never a widget or a source. Two
 * weather widgets with different settings ask different questions and must not
 * share an answer; a widget and a source configured identically ask the *same*
 * question and must not fetch twice.
 *
 * A failure is recorded, not thrown. A provider being down should leave the
 * previous answer on screen with a note, not blank the panel.
 */

const engine = new Liquid({ strictVariables: false, strictFilters: false });

const MINUTES: Record<string, number> = { none: 0, minute: 1, hour: 60, day: 1440 };

/** How old an answer may get before it is worth asking again. */
export function stalenessMinutes(interval: number, unit: string): number {
  return interval * (MINUTES[unit] ?? 0);
}

async function poll(
  extension: Extension,
  settings: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};

  for (const [index, exchange] of extension.manifest.exchanges.entries()) {
    // The URL is a Liquid template over the settings, which is what lets two
    // weather widgets on one screen fetch two different cities.
    const url = await engine.parseAndRender(exchange.template, {
      extension: { name: extension.name, label: extension.manifest.label, values: settings },
    });

    const response = await fetch(url.trim(), {
      method: exchange.verb.toUpperCase(),
      headers: exchange.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`${extension.manifest.label}: ${response.status} from source_${index + 1}.`);
    }

    payload[`source_${index + 1}`] = await response.json();
  }

  return payload;
}

async function fromConnection(
  extension: Extension,
  settings: Record<string, unknown>,
  now: Date,
): Promise<Record<string, unknown>> {
  const id = extension.manifest.connection;
  const source = id ? provider(id) : undefined;

  if (!source) throw new Error(`${extension.manifest.label} needs a connection that does not exist.`);

  // A provider with a handshake keeps one row per signed-in account, plus one
  // for the installation's own client credentials. One without keeps a single
  // row under the empty account name, which `readyAccounts` skips - so it is
  // read separately.
  const [client, accounts] = await Promise.all([
    stored(source.id),
    source.handshake ? readyAccounts(source.id) : Promise.resolve([]),
  ]);

  const usable = source.handshake
    ? accounts.filter((one) => source.handshake!.complete(one.credentials))
    : client
      ? [{ account: "", label: client.label, credentials: client.credentials }]
      : [];

  // A mocked provider answers without a link, so screens can be designed before
  // anyone has signed in. A real one must not - and for a provider whose link
  // finishes in the browser, a row is not a link: the client credentials are
  // stored the moment they are pasted, and nobody has consented to anything
  // yet. Saying so beats a widget that fails with "no refresh token".
  if (!source.mocked && !usable.length) {
    throw new Error(
      source.handshake && client
        ? `Finish signing in to ${source.label} under Connections.`
        : `Link your ${source.label} account to use ${extension.manifest.label}.`,
    );
  }

  // The installation's zone, not the server's. "What did we take today" is a
  // question about a calendar day somewhere, and the somewhere is here.
  const { locale, timezone } = await environment();

  return source.fetch(settings, now, {
    accounts: usable,
    credentials: usable[0]?.credentials ?? {},
    locale,
    timezone,
  });
}

export interface FetchResult {
  /** The question that was asked, not who asked it. */
  key: string;
  payload?: Record<string, unknown>;
  error?: string;
}

/**
 * Ask a question and remember the answer.
 *
 * Everything that wants data goes through here: a widget being drawn, a source
 * being watched, a settings change in the editor. They all reduce to an
 * extension and some settings.
 */
export async function ask(
  extensionName: string,
  settings: Record<string, unknown>,
  now = new Date(),
): Promise<FetchResult> {
  const key = observationKey(extensionName, settings);
  const extension = await find(extensionName);

  if (!extension) {
    await recordFailure(extensionName, settings, `${extensionName} is not installed.`);
    return { key, error: `${extensionName} is not installed.` };
  }

  if (extension.manifest.kind === "static") return { key };

  try {
    const payload =
      extension.manifest.kind === "connection"
        ? await fromConnection(extension, settings, now)
        : extension.manifest.kind === "poll"
          ? await poll(extension, settings)
          : await board(settings, now);

    await record(extensionName, settings, payload, now);
    return { key, payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordFailure(extensionName, settings, message);

    return { key, error: message };
  }
}

/**
 * Answers, asking first for anything that has never been answered.
 *
 * Without this an editor shows the extension's *sample* the moment settings
 * change - because a new question has no answer yet - so a transit board would
 * flash "Milano Cadorna to Saronno" whatever you had just typed, then settle
 * on the real thing. Data about a different question is worse than a spinner.
 *
 * Only ever for questions never answered, and never twice in a minute for one
 * that is failing, so a dead provider does not get hammered by a preview.
 */
const RETRY_AFTER = 60_000;

export async function answersEnsuring(asked: Question[], now = new Date()): Promise<Map<string, Answer>> {
  const answers = await answersFor(asked);
  const pending = new Map<string, Question>();

  for (const question of asked) {
    const key = observationKey(question.extension, question.settings);
    const answer = answers.get(key);
    if (!answer?.standIn) continue;

    const extension = await find(question.extension);
    if (!extension || extension.manifest.kind === "static") continue;

    const attempted = answer.attemptedAt?.getTime() ?? 0;
    if (now.getTime() - attempted < RETRY_AFTER) continue;

    pending.set(key, question);
  }

  if (!pending.size) return answers;

  await Promise.all([...pending.values()].map((question) => ask(question.extension, question.settings, now)));
  return answersFor(asked);
}

/** Whether the answer to this question has aged out. */
export async function isStale(
  extensionName: string,
  settings: Record<string, unknown>,
  now = new Date(),
): Promise<boolean> {
  const extension = await find(extensionName);
  if (!extension || extension.manifest.kind === "static") return false;

  const window = stalenessMinutes(extension.manifest.interval, extension.manifest.unit);
  if (window <= 0) return false;

  const [row] = await db
    .select()
    .from(observations)
    .where(eq(observations.key, observationKey(extensionName, settings)));

  if (!row?.fetchedAt) return true;
  return now.getTime() - row.fetchedAt.getTime() >= window * 60_000;
}

/* -- convenience wrappers, in the vocabulary of whoever is asking ----------- */

export const refresh = (widget: Widget, now = new Date()) =>
  ask(widget.extension, widget.settings, now);

export const refreshTrigger = (source: { extension: string; settings: Record<string, unknown> }, now = new Date()) =>
  ask(source.extension, source.settings, now);

/** Refresh whatever a screen needs and has let go stale. */
export async function refreshScreen(screenId: number, now = new Date()): Promise<FetchResult[]> {
  const rows = await db.select().from(widgets).where(eq(widgets.screenId, screenId));
  const due: Widget[] = [];

  for (const widget of rows) {
    if (await isStale(widget.extension, widget.settings, now)) due.push(widget);
  }

  return Promise.all(due.map((widget) => refresh(widget, now)));
}

/** Refresh every watched source that has aged out. Shared, so once for all. */
export async function refreshTriggers(now = new Date()): Promise<FetchResult[]> {
  const rows = await db.select().from(triggers);
  const due = [];

  for (const source of rows) {
    if (await isStale(source.extension, source.settings, now)) due.push(source);
  }

  return Promise.all(due.map((source) => refreshTrigger(source, now)));
}

/** Everything a set of widget ids needs, asked now regardless of age. */
export async function refreshWidgets(ids: number[], now = new Date()): Promise<FetchResult[]> {
  if (!ids.length) return [];

  const rows = await db.select().from(widgets).where(inArray(widgets.id, ids));
  return Promise.all(rows.map((widget) => refresh(widget, now)));
}
