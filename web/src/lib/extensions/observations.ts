import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { observations } from "@/lib/db/schema";
import { canonicalSettings } from "@/lib/extensions/question";
import { find, questionSettings } from "@/lib/extensions/registry";

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
  return createHash("sha256")
    .update(`${extension} ${canonicalSettings(settings)}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * The key an answer is *stored* under, which is not always the key a caller
 * holds.
 *
 * A caller identifies a widget by everything it is configured with, and that
 * is the right identity for "which answer is mine". But two widgets that
 * differ only in how they draw the same numbers are asking one question, and
 * they must not cost two trips to Stripe - so the stored key is taken over the
 * settings that decide what is fetched, with the presentational ones dropped.
 *
 * Keeping the two apart means no caller has to remember to filter: pass the
 * settings you have, get the answer to the question they imply.
 */
export async function storedKey(
  extension: string,
  settings: Record<string, unknown>,
): Promise<string> {
  return observationKey(extension, questionSettings(await find(extension), settings));
}

export interface Answer {
  payload: Record<string, unknown>;
  fetchedAt: Date | null;
  /** When it was last asked, whether or not that worked. */
  attemptedAt: Date | null;
  error?: string;
  /** True when this is the extension's sample rather than a real answer. */
  standIn: boolean;
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
  // Two keys per question: the one the caller will look this up by, over all
  // of its settings, and the one it is filed under, over the settings that
  // decide what was fetched. They are the same for most extensions and differ
  // wherever a design brings its own settings.
  const filed = new Map<string, string>();
  for (const one of asked) {
    const key = observationKey(one.extension, one.settings);
    if (!filed.has(key)) filed.set(key, await storedKey(one.extension, one.settings));
  }

  const keys = [...new Set(filed.values())];

  const rows = keys.length
    ? await db.select().from(observations).where(inArray(observations.key, keys))
    : [];

  const stored = new Map(rows.map((row) => [row.key, row]));
  const answers = new Map<string, Answer>();

  for (const one of asked) {
    const key = observationKey(one.extension, one.settings);
    if (answers.has(key)) continue;

    const row = stored.get(filed.get(key)!);

    if (row?.fetchedAt && Object.keys(row.payload).length) {
      answers.set(key, {
        payload: row.payload,
        fetchedAt: row.fetchedAt,
        attemptedAt: row.attemptedAt,
        error: row.error ?? undefined,
        standIn: false,
      });
      continue;
    }

    const extension = await find(one.extension);

    answers.set(key, {
      payload: (extension?.manifest.sample ?? {}) as Record<string, unknown>,
      fetchedAt: null,
      attemptedAt: row?.attemptedAt ?? null,
      error: row?.error ?? undefined,
      standIn: true,
    });
  }

  return answers;
}

/**
 * The same answer, as a *decision* is allowed to read it.
 *
 * `answersFor` falls back to the extension's sample, which is right for a
 * picture and wrong for a rule. A widget drawing the sample is a screen being
 * designed before anyone owns the hardware; a check reading it is a device
 * branching on invented data, and a notice reading it fires on an alert nobody
 * published - permanently, because a source that has never answered never
 * stops being a stand-in.
 *
 * So a stand-in reads as nothing here. Every operator in `compare` already
 * answers false for missing data, which is exactly the wanted behaviour: a
 * source that has not spoken does not get to decide anything.
 */
export function reading(answer: Answer | undefined): {
  payload: Record<string, unknown>;
  fetchedAt: Date | null;
  error?: string;
} {
  return answer && !answer.standIn
    ? { payload: answer.payload, fetchedAt: answer.fetchedAt, error: answer.error }
    : { payload: {}, fetchedAt: null, error: answer?.error };
}

export async function record(
  extension: string,
  settings: Record<string, unknown>,
  payload: Record<string, unknown>,
  now: Date,
): Promise<void> {
  // Filed under the question, and *with* the question: the row's settings are
  // what would be sent to the provider again, not what one widget happened to
  // be drawn with.
  const asked = questionSettings(await find(extension), settings);
  const key = observationKey(extension, asked);

  await db
    .insert(observations)
    .values({ key, extension, settings: asked, payload, fetchedAt: now, attemptedAt: now, error: null })
    .onConflictDoUpdate({
      target: observations.key,
      set: { payload, fetchedAt: now, attemptedAt: now, error: null },
    });
}

export async function recordFailure(
  extension: string,
  settings: Record<string, unknown>,
  error: string,
  now = new Date(),
): Promise<void> {
  const asked = questionSettings(await find(extension), settings);
  const key = observationKey(extension, asked);

  // The payload is left alone - a dead provider should not blank a display -
  // but the attempt is written down, so a failure is distinguishable from a
  // question nobody has asked and does not get retried on every preview.
  await db
    .insert(observations)
    .values({ key, extension, settings: asked, payload: {}, attemptedAt: now, error })
    .onConflictDoUpdate({ target: observations.key, set: { attemptedAt: now, error } });
}
