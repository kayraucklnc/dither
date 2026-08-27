import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { connections } from "../src/lib/db/schema";
import { provider as findProvider } from "../src/lib/connections";
import { calendars } from "../src/lib/connections/google/api";
import { CLIENT } from "../src/lib/connections/link";

/**
 * Split each existing connection into an installation client and an account.
 *
 *   npx tsx --env-file=.env.local scripts/split-connections.mts
 *
 * A connection used to be one row per provider, holding the OAuth client *and*
 * the grant together. Now they are separate things, because they have
 * different lifetimes and different owners: the client identifies this server
 * and is the same whoever signs in, while a grant belongs to one Google
 * account and there can be several.
 *
 * So a Google row carrying a refresh token becomes two - the client under the
 * empty account name, and the grant under the address it turns out to belong
 * to. Finding that address means one call to Google, which is the whole reason
 * this is a script rather than a column default.
 *
 * A provider with no handshake is left exactly as it was: one row, empty
 * account, which is what a single pasted key has always been.
 *
 * Idempotent: a provider already split has an account row and is skipped.
 */

const rows = await db.select().from(connections);

if (!rows.length) {
  console.log("No connections to split.");
  process.exit(0);
}

let split = 0;
let untouched = 0;

for (const row of rows) {
  const source = findProvider(row.provider);

  if (!source?.handshake) {
    console.log(`${row.provider}: no handshake, left as the installation's own row.`);
    untouched += 1;
    continue;
  }

  if (row.account !== CLIENT) {
    console.log(`${row.provider}: ${row.account} is already an account row.`);
    untouched += 1;
    continue;
  }

  if (!source.handshake.complete(row.credentials)) {
    console.log(`${row.provider}: client credentials only, nothing to split out.`);
    untouched += 1;
    continue;
  }

  // Whose grant is it? The address is what a widget's settings will name from
  // now on, so guessing it is not an option.
  let address = "";
  try {
    const list = await calendars(row.credentials);
    address = list.find((one) => one.primary)?.id ?? "";
  } catch (error) {
    console.log(
      `${row.provider}: could not ask Google who this is (${error instanceof Error ? error.message : error}).`,
    );
    console.log("  Left alone. Sign the account out and in again under Connections.");
    untouched += 1;
    continue;
  }

  if (!address) {
    console.log(`${row.provider}: Google would not say which account this is. Left alone.`);
    untouched += 1;
    continue;
  }

  const { refresh_token: refresh, ...client } = row.credentials as Record<string, unknown>;

  // The grant first, so a failure between the two leaves the old row intact
  // rather than leaving the installation signed out of everything.
  await db
    .insert(connections)
    .values({
      provider: row.provider,
      account: address,
      label: address,
      credentials: { refresh_token: refresh },
    })
    .onConflictDoUpdate({
      target: [connections.provider, connections.account],
      set: { label: address, credentials: { refresh_token: refresh } },
    });

  await db
    .update(connections)
    .set({ label: source.label, credentials: client })
    .where(eq(connections.id, row.id));

  console.log(`${row.provider}: split into the installation's client and ${address}.`);
  split += 1;
}

console.log(
  split
    ? `\nSplit ${split}, left ${untouched} alone.` +
        "\nWidgets naming a calendar keep working - a selection with no account goes to the first one."
    : `Nothing to split - ${untouched} already current.`,
);

process.exit(0);
