import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { connections, triggers, widgets } from "../src/lib/db/schema";
import { CLIENT } from "../src/lib/connections/link";
import { derivedId, identify } from "../src/lib/connections/stripe/read";
import { OWN_CURRENCY } from "../src/lib/connections/stripe/reading";

/**
 * Bring a Stripe link and its widgets up to date with more than one account.
 *
 *   npx tsx --env-file=.env.local scripts/stripe-accounts.mts
 *
 * Two changes, and the first is the one that matters.
 *
 * A Stripe key used to be the *installation's* credentials, filed under the
 * empty account name the way an OAuth client is. Now a key is an account and
 * is filed under the account's own id, because that id is what a widget's
 * settings name and what a second key has to differ from. A row left under the
 * empty name is not an account, so nothing would list it and every revenue
 * widget would report that nothing is linked - which is why this moves it
 * rather than teaching the reader to look in two places.
 *
 * The second is settings. A revenue widget saved before this has no `accounts`
 * and no `currency`, and both are read correctly without them - nothing chosen
 * means every account, and no currency means the account's own. But reading a
 * missing value correctly and being able to *show* it are different things:
 * the settings form has nothing to put in either control and draws them empty,
 * which reads as "nothing chosen" rather than as what they actually mean.
 *
 * Sources get the same treatment as widgets, or a widget and the trigger
 * beside it stop asking the same question and stop sharing one fetch.
 *
 * Idempotent. Run it twice and the second run says there was nothing to do.
 */

const EXTENSION = "revenue";

/* -- the connection --------------------------------------------------------- */

const [installation] = await db
  .select()
  .from(connections)
  .where(eq(connections.provider, "stripe"));

if (installation && installation.account === CLIENT) {
  const key = installation.credentials.secret_key;

  if (!key) {
    // The row left behind by a key that was refused. Nothing to move, and
    // leaving it would put a red message under a working connection.
    await db.delete(connections).where(eq(connections.id, installation.id));
    console.log("Removed an empty Stripe row that only held a refusal.");
  } else {
    /*
     * Ask Stripe whose key this is. If it cannot be reached at this moment the
     * key still has to move - a row stranded under the empty name is a
     * connection nothing can see - so it goes under the name derived from the
     * key itself, which is exactly what a restricted key gets anyway.
     */
    const identity = await identify(installation.credentials).catch(() => undefined);
    const id = identity?.id ?? derivedId(installation.credentials);
    const currency = identity?.currency ?? "";
    const name = identity?.name ?? "";

    if (!identity) {
      console.log("Stripe could not be reached, so the key keeps a name derived from itself.");
    }

    await db.insert(connections).values({
      provider: "stripe",
      account: id,
      label: name
        ? `${name} (${currency.toUpperCase()})`
        : currency
          ? `Stripe (${currency.toUpperCase()})`
          : "Stripe",
      credentials: installation.credentials,
      connectedAt: installation.connectedAt,
    });

    await db.delete(connections).where(eq(connections.id, installation.id));
    console.log(`Moved the Stripe key to its own account, ${id}.`);
  }
} else {
  console.log("The Stripe connection is already filed under an account.");
}

/* -- the settings ----------------------------------------------------------- */

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

  if (!Array.isArray(next.accounts)) {
    // Empty rather than the account we just moved: a widget that never chose
    // meant "whatever is linked", and naming one now would quietly stop it
    // adding up a second key somebody links tomorrow.
    next.accounts = [];
    touched = true;
  }

  if (typeof next.currency !== "string" || !next.currency) {
    next.currency = OWN_CURRENCY;
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
