import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { observations } from "@/lib/db/schema";
import { find } from "@/lib/extensions/registry";

/**
 * One answer per question, shared by everything that asks it.
 *
 * A widget draws the Cadorna board; a source lets a rule branch on it. Those
 * are two intents and stay two objects - you can decide on a station you never
 * display, and display one you never decide on. But they are the same
 * question, and asking Trenord twice for one answer is rude and slow.
 *
 * So an answer is keyed by what was asked, never by who asked. Configure a
 * source to match a widget and it is fresh the moment it exists.
 */
export function observationKey(extension: string, settings: Record<string, unknown>): string {
  // Sorted keys, or the same settings in a different order hash differently.
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(settings ?? {}).sort(([a], [b]) => a.localeCompare(b))),
  );

  return createHash("sha256").update(`${extension} ${canonical}`).digest("hex").slice(0, 32);
}

export interface Answer {
  payload: Record<string, unknown>;
  fetchedAt: Date | null;
  error?: string;
}

export interface Question {
  extension: string;
  settings: Record<string, unknown>;
}

/**
 * What is known about each question, falling back to the extension's sample
 * until something real has been fetched.
 *
 * The sample is what lets a screen be designed before anyone owns the hardware
 * or has an API key. It is never handed to a device that has real data.
 */
export async function answersFor(asked: Question[]): Promise<Map<string, Answer>> {
  const keys = [...new Set(asked.map((one) => observationKey(one.extension, one.settings)))];

  const rows = keys.length
    ? await db.select().from(observations).where(inArray(observations.key, keys))
    : [];

  const stored = new Map(rows.map((row) => [row.key, row]));
  const answers = new Map<string, Answer>();

  for (const one of asked) {
    const key = observationKey(one.extension, one.settings);
    if (answers.has(key)) continue;

    const row = stored.get(key);

    if (row?.fetchedAt && Object.keys(row.payload).length) {
      answers.set(key, {
        payload: row.payload,
        fetchedAt: row.fetchedAt,
        error: row.error ?? undefined,
      });
      continue;
    }

    const extension = await find(one.extension);

    answers.set(key, {
      payload: (extension?.manifest.sample ?? {}) as Record<string, unknown>,
      fetchedAt: null,
      error: row?.error ?? undefined,
    });
  }

  return answers;
}

export async function record(
  extension: string,
  settings: Record<string, unknown>,
  payload: Record<string, unknown>,
  now: Date,
): Promise<void> {
  const key = observationKey(extension, settings);

  await db
    .insert(observations)
    .values({ key, extension, settings, payload, fetchedAt: now, error: null })
    .onConflictDoUpdate({
      target: observations.key,
      set: { payload, fetchedAt: now, error: null },
    });
}

export async function recordFailure(
  extension: string,
  settings: Record<string, unknown>,
  error: string,
): Promise<void> {
  const key = observationKey(extension, settings);

  // Keep whatever was there. A dead provider should not blank a display.
  await db
    .insert(observations)
    .values({ key, extension, settings, payload: {}, error })
    .onConflictDoUpdate({ target: observations.key, set: { error } });
}
