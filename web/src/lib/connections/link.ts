import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import type { Provider } from "./provider";

/**
 * Storing a link, and knowing when there is one.
 *
 * Shared by the connections page and by the OAuth callback, because both write
 * the same rows and both have to agree about what "linked" means. A provider
 * that finishes in the browser has a row from the moment its client
 * credentials are pasted, and a page that read "linked" from the row existing
 * would say linked before anyone had consented to anything.
 *
 * A provider holds one row per linked account, plus one for the installation's
 * own client credentials under the empty account name. So "is Google linked"
 * is a question about the *grants*, not about the client.
 */

/** The prefix a failed attempt is remembered under, in the row's own label. */
const FAILED = "error:";

/**
 * Where the handshake's nonce is kept while the browser is away.
 *
 * Lives here rather than in the route that sets it: a route module may only
 * export request handlers, so the two halves of the handshake cannot share a
 * constant through one.
 */
export const STATE_COOKIE = "dither_link_state";

/** The path the cookie is scoped to - both routes, and nothing else. */
export const STATE_PATH = "/api/connections";

/**
 * The empty account: the installation's own credentials for a provider.
 *
 * The OAuth client identifies *this server* to Google and is the same
 * whichever account signs in, so it is stored once rather than copied onto
 * every grant. Deleting one account cannot take the client with it.
 */
export const CLIENT = "";

export interface Linked {
  account: string;
  label: string;
  credentials: Record<string, unknown>;
}

/** One row, by provider and account. */
export async function stored(providerId: string, account = CLIENT): Promise<Linked | undefined> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.provider, providerId), eq(connections.account, account)));

  return row ? { account: row.account, label: row.label, credentials: row.credentials } : undefined;
}

/** Every account linked for a provider, the installation's client aside. */
export async function accountsOf(providerId: string): Promise<Linked[]> {
  const rows = await db.select().from(connections).where(eq(connections.provider, providerId));

  return rows
    .filter((row) => row.account !== CLIENT)
    .map((row) => ({ account: row.account, label: row.label, credentials: row.credentials }))
    .sort((a, b) => a.account.localeCompare(b.account));
}

/**
 * What a provider is handed for an account: the grant, over the installation's
 * client credentials.
 *
 * Merged here rather than stored merged, so rotating a client secret is one
 * row and not one row per account.
 */
export async function credentialsFor(providerId: string, account: string): Promise<Record<string, unknown>> {
  const [client, grant] = await Promise.all([stored(providerId, CLIENT), stored(providerId, account)]);
  return { ...(client?.credentials ?? {}), ...(grant?.credentials ?? {}) };
}

/** Every linked account with its credentials ready to use. */
export async function readyAccounts(providerId: string): Promise<Linked[]> {
  const [client, accounts] = await Promise.all([stored(providerId, CLIENT), accountsOf(providerId)]);

  return accounts.map((one) => ({
    ...one,
    credentials: { ...(client?.credentials ?? {}), ...one.credentials },
  }));
}

export async function save(
  providerId: string,
  label: string,
  credentials: Record<string, unknown>,
  account = CLIENT,
): Promise<void> {
  await db
    .insert(connections)
    .values({ provider: providerId, account, label, credentials })
    .onConflictDoUpdate({
      target: [connections.provider, connections.account],
      set: { label, credentials, connectedAt: new Date() },
    });
}

/** Forget one account, or - with no account named - the whole provider. */
export async function forgetConnection(providerId: string, account?: string): Promise<void> {
  await db
    .delete(connections)
    .where(
      account === undefined
        ? eq(connections.provider, providerId)
        : and(eq(connections.provider, providerId), eq(connections.account, account)),
    );
}

/**
 * A refusal, remembered.
 *
 * Server actions and redirects cannot hand a message back to a page that
 * re-renders from the database, so the reason lives on the provider's client
 * row - which is the one row that always exists once anything has been
 * pasted, and the one the page renders the message beside.
 */
export async function note(providerId: string, message: string): Promise<void> {
  const existing = await stored(providerId, CLIENT);

  await db
    .insert(connections)
    .values({ provider: providerId, account: CLIENT, label: `${FAILED}${message}`, credentials: {} })
    .onConflictDoUpdate({
      target: [connections.provider, connections.account],
      set: { label: `${FAILED}${message}`, credentials: existing?.credentials ?? {} },
    });
}

/** The message from a failed attempt, when the row is one. */
export const failure = (label: string): string | undefined =>
  label.startsWith(FAILED) ? label.slice(FAILED.length) : undefined;

/**
 * Whether a provider is usable.
 *
 * A provider that only wants a key is linked as soon as it has one. A provider
 * with a handshake is linked when at least one account has finished one - half
 * a handshake is not a link, and neither is a client with nobody signed in.
 */
export function isLinked(source: Provider, client: Linked | undefined, accounts: Linked[] = []): boolean {
  if (source.handshake) {
    return accounts.some((one) => source.handshake!.complete(one.credentials));
  }

  // A provider that takes a key and can hold several files each one under the
  // account it belongs to, so there is no client row to read this from - only
  // the accounts. Asking the client row would say "linked" for a provider
  // whose only row is the note left by a key that was refused.
  if (source.multiple) return accounts.length > 0;

  return Boolean(client) && !failure(client!.label);
}

/** True when the client credentials are in but nobody has signed in yet. */
export function isHalfway(source: Provider, client: Linked | undefined, accounts: Linked[] = []): boolean {
  if (!source.handshake || !client) return false;
  if (accounts.some((one) => source.handshake!.complete(one.credentials))) return false;

  return (source.credentials ?? []).every((field) => Boolean(client.credentials[field.key]));
}

/* -- where this installation is, as far as a browser is concerned ----------- */

/**
 * The origin to build a redirect URI from.
 *
 * The browser's own view of this server, not the device's. Those are different
 * addresses and only one of them is allowed here: `API_URI` names the host a
 * panel on the wall can reach, which on a dev box is a LAN address, and Google
 * refuses a plain-HTTP redirect URI that is not `localhost` or `127.0.0.1` -
 * it cannot even be registered. Devices do not do OAuth, so `API_URI` has no
 * business in this decision.
 *
 * What is left is what the browser asked for: the forwarded headers first,
 * because behind a reverse proxy the request's own host is the proxy's
 * internal one, then the host it did send. `DITHER_OAUTH_ORIGIN` is for the
 * proxy that rewrites the host and sets no forwarded headers - the one case
 * where nothing in the request is true.
 */
export function originFromHeaders(headers: Headers, fallback = "http://localhost:3000"): string {
  const declared = process.env.DITHER_OAUTH_ORIGIN;
  if (declared) return declared.replace(/\/+$/, "");

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return fallback;

  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? new URL(fallback).protocol.slice(0, -1);

  return `${proto}://${host}`;
}

/** The same, for a route handler, which knows its own URL as a last resort. */
export const originOf = (request: Request): string =>
  originFromHeaders(request.headers, new URL(request.url).origin);

export const redirectUri = (origin: string, providerId: string): string =>
  `${origin}/api/connections/${providerId}/callback`;

export const startUrl = (providerId: string): string => `/api/connections/${providerId}/start`;
