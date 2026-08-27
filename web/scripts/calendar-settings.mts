import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { triggers, widgets } from "../src/lib/db/schema";

/**
 * Bring calendar settings saved before ranges and multiple feeds up to date.
 *
 *   npx tsx --env-file=.env.local scripts/calendar-settings.mts
 *
 * Two changes, both of which the code already tolerates at read time:
 *
 *   calendar: "primary"   ->  calendar: ["primary"]
 *   horizon_hours, no range  ->  range: "hours"
 *
 * So why run it at all? Because tolerating something at read time and being
 * able to *show* it are different. A widget with no `range` key is treated as
 * a rolling window - which is right, it is what it always meant - but the
 * settings form has nothing to put in the selector and draws it empty, and an
 * empty selector reads as "nothing chosen" rather than as "the next 12 hours".
 * Writing the value down removes the invisible state instead of teaching one
 * more component about it.
 *
 * Idempotent: a row already carrying a `range` and a list is left alone, and
 * the script says how many it skipped.
 */

const EXTENSION = "google_calendar";

interface Change {
  what: string;
  id: number;
  before: string;
  after: string;
}

/** The updated settings, or nothing when there was nothing to do. */
function migrate(settings: Record<string, unknown>): Record<string, unknown> | undefined {
  const next = { ...settings };
  let touched = false;

  if (!Array.isArray(next.calendar)) {
    const single = String(next.calendar ?? "").trim();
    next.calendar = single ? [single] : ["primary"];
    touched = true;
  }

  if (next.range === undefined) {
    // `horizon_hours` is the only thing an old widget could have been told, so
    // its presence is what a rolling window looks like. Without it - a widget
    // that never had the field at all - the new default is the honest reading.
    next.range = next.horizon_hours === undefined ? "today" : "hours";
    touched = true;
  }

  return touched ? next : undefined;
}

const changes: Change[] = [];
let skipped = 0;

const placed = await db.select().from(widgets).where(eq(widgets.extension, EXTENSION));

for (const widget of placed) {
  const next = migrate(widget.settings);
  if (!next) {
    skipped += 1;
    continue;
  }

  await db.update(widgets).set({ settings: next }).where(eq(widgets.id, widget.id));
  changes.push({
    what: "widget",
    id: widget.id,
    before: JSON.stringify(widget.settings),
    after: JSON.stringify(next),
  });
}

// Sources ask the same questions as widgets and are stored the same way, so a
// trigger watching a calendar needs exactly the same treatment - and if it did
// not get it, a widget and the source beside it would stop sharing one answer.
const watched = await db.select().from(triggers).where(eq(triggers.extension, EXTENSION));

for (const source of watched) {
  const next = migrate(source.settings);
  if (!next) {
    skipped += 1;
    continue;
  }

  await db.update(triggers).set({ settings: next }).where(eq(triggers.id, source.id));
  changes.push({
    what: "source",
    id: source.id,
    before: JSON.stringify(source.settings),
    after: JSON.stringify(next),
  });
}

for (const change of changes) {
  console.log(`${change.what} ${change.id}`);
  console.log(`  was ${change.before}`);
  console.log(`  now ${change.after}`);
}

console.log(
  changes.length
    ? `\nUpdated ${changes.length}, left ${skipped} already current.` +
        "\nEach one asks a new question, so it refetches once on the next wake."
    : `Nothing to do - ${skipped} already current.`,
);

process.exit(0);
