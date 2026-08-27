import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import type { Provider } from "./provider";

/**
 * Storing a link, and knowing when there is one.
 *
 * Shared by the connections page and by the OAuth callback, because both write
 * the same row and both have to agree about what "linked" means. A provider
 * that finishes in the browser has a row from the moment its client
 * credentials are pasted, and a page that read "linked" from the row existing
 * would say linked before anyone had consented to anything.
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

export interface Linked {
  label: string;
  credentials: Record<string, unknown>;
}

/** What is stored for a provider, if anything. */
export async function stored(providerId: string): Promise<Linked | undefined> {
  const [row] = await db.select().from(connections).where(eq(connections.provider, providerId));
  return row ? { label: row.label, credentials: row.credentials } : undefined;
}

export async function save(
  providerId: string,
  label: string,
  credentials: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(connections)
    .values({ provider: providerId, label, credentials })
    .onConflictDoUpdate({
      target: connections.provider,
      set: { label, credentials, connectedAt: new Date() },
    });
}

/**
 * A refusal, remembered.
 *
 * Server actions and redirects cannot hand a message back to a page that
 * re-renders from the database, so the reason lives in the row that failed.
 * Credentials already stored are kept: a handshake that came back wrong should
 * not make you paste the client ID again.
 */
export async function note(providerId: string, message: string): Promise<void> {
  const existing = await stored(providerId);

  await db
    .insert(connections)
    .values({ provider: providerId, label: `${FAILED}${message}`, credentials: {} })
    .onConflictDoUpdate({
      target: connections.provider,
      set: { label: `${FAILED}${message}`, credentials: existing?.credentials ?? {} },
    });
}

/** The message from a failed attempt, when the row is one. */
export const failure = (label: string): string | undefined =>
  label.startsWith(FAILED) ? label.slice(FAILED.length) : undefined;

/**
 * Whether these credentials are a finished link.
 *
 * A provider that only wants a key is linked as soon as it has one. A provider
 * with a handshake is linked when the handshake finished, and half of one is
 * not a link.
 */
export function isLinked(source: Provider, row: Linked | undefined): boolean {
  if (!row || failure(row.label)) return false;
  return source.handshake ? source.handshake.complete(row.credentials) : true;
}

/** True when the client credentials are in but the browser step is not done. */
export function isHalfway(source: Provider, row: Linked | undefined): boolean {
  if (!source.handshake || !row) return false;
  if (source.handshake.complete(row.credentials)) return false;

  return (source.credentials ?? []).every((field) => Boolean(row.credentials[field.key]));
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
