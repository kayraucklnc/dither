import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { triggers, type Device } from "@/lib/db/schema";
import { answersFor, observationKey, reading } from "@/lib/extensions/observations";
import { find as findExtension } from "@/lib/extensions/registry";
import type { Context } from "@/lib/flow/conditions";
import { setAt } from "@/lib/facts";
import { clockSource, deviceSource, triggerSource, type Source } from "@/lib/flow/sources";

/**
 * Everything a device's tree can ask about: itself, the clock, and the trigger
 * sources set up on it.
 *
 * Sources are deliberately not read off the screens a device shows, and not
 * owned by the device either: one is a question asked of the world, so two
 * panels can watch the same one and it is fetched once for both.
 */
export async function sourcesFor(device: Device, now = new Date()): Promise<Source[]> {
  // Sources are shared; the device and the clock are the two that are not.
  const rows = await db.select().from(triggers);
  const built: Source[] = [deviceSource(device, now), clockSource(now)];

  const answers = await answersFor(rows);

  for (const trigger of rows) {
    const extension = await findExtension(trigger.extension);
    const answer = answers.get(observationKey(trigger.extension, trigger.settings));

    built.push(
      triggerSource(
        trigger,
        extension?.manifest.facts ?? [],
        // `reading`, not the answer itself: a stand-in is the extension's
        // sample, and a check cannot tell one from a reading. See observations.
        reading(answer),
        now,
      ),
    );
  }

  return built;
}

/**
 * Values to pretend, keyed by source id and then by fact key.
 *
 * Building a rule for "when it is raining" in August means either waiting for
 * rain or trusting the arithmetic. This is how you check instead.
 */
export type Overrides = Record<string, Record<string, unknown>>;

function pretend(source: Source, values: Record<string, unknown>): Source {
  let payload = source.payload;

  for (const [key, value] of Object.entries(values)) {
    const fact = source.facts.find((candidate) => candidate.key === key);
    if (fact) payload = setAt(payload, fact.path, value);
  }

  return { ...source, payload };
}

/** Source id to the extension behind it, for notices placed with their source. */
export async function sourceExtensions(): Promise<Record<string, string>> {
  const rows = await db.select().from(triggers);
  return Object.fromEntries(rows.map((row) => [String(row.id), row.extension]));
}

export async function contextFor(
  device: Device,
  now = new Date(),
  overrides: Overrides = {},
): Promise<Context> {
  const sources = await sourcesFor(device, now);

  return {
    now,
    sources: new Map(
      sources.map((source) => [
        source.id,
        overrides[source.id] ? pretend(source, overrides[source.id]) : source,
      ]),
    ),
  };
}
