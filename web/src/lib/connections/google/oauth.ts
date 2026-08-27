/**
 * Signing in to Google, on an installation that nobody published.
 *
 * There is no "Dither" application registered with Google, and there cannot
 * usefully be one: `calendar.readonly` is a sensitive scope, so the consent
 * screen naming an application has to be verified by Google against a privacy
 * policy and a domain owned by whoever published it. A self-hosted server has
 * no such domain. So the installation registers its own OAuth client - a few
 * minutes in the Google Cloud console - and pastes the two halves of it in
 * once. Home Assistant asks for exactly the same thing, for exactly the same
 * reason.
 *
 * What is stored afterwards is a *refresh token*: long lived, revocable from
 * the Google account's own security page, and worth an access token an hour at
 * a time. Access tokens are never stored, only kept in memory until they
 * expire, because a token written to a database outlives the process that
 * could have used it.
 */

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

export const CLIENT_ID = "client_id";
export const CLIENT_SECRET = "client_secret";
export const REFRESH_TOKEN = "refresh_token";

/**
 * Read-only, and only the calendar.
 *
 * `calendar.readonly` covers both the list of calendars and the events in
 * them. There is a narrower `calendar.events.readonly`, but it cannot list
 * which calendars exist, which is what makes the calendar picker a picker
 * rather than a box you type an address into.
 */
export const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

export interface Tokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

function halves(credentials: Record<string, unknown>): { id: string; secret: string } {
  const id = String(credentials[CLIENT_ID] ?? "").trim();
  const secret = String(credentials[CLIENT_SECRET] ?? "").trim();

  if (!id || !secret) throw new Error("No Google client ID and secret are stored for this connection.");
  return { id, secret };
}

/** Where to send the browser to ask the account for consent. */
export function authorizeUrl(
  credentials: Record<string, unknown>,
  redirectUri: string,
  state: string,
): string {
  const { id } = halves(credentials);

  const url = new URL(AUTHORIZE);
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  // Offline, or there is no refresh token and the link dies in an hour.
  url.searchParams.set("access_type", "offline");
  // And forced, or a *second* authorisation of an account that has already
  // said yes comes back without a refresh token at all - Google issues one
  // per grant, not per handshake. Re-linking has to actually re-link.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url.toString();
}

async function post(body: Record<string, string>): Promise<Tokens> {
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const code = String(payload.error ?? response.status);
    const detail = String(payload.error_description ?? "").trim();

    // The one worth naming, because it is the one that happens months later:
    // the grant was revoked from the Google account, or the client secret was
    // rotated, and every widget on every screen has gone quiet at once.
    if (code === "invalid_grant") {
      throw new Error(
        "Google refused the stored authorisation. Unlink and reconnect the account under Connections.",
      );
    }

    throw new Error(detail ? `Google: ${detail}` : `Google refused the request (${code}).`);
  }

  return payload as unknown as Tokens;
}

/** Turn the code the browser came back with into a refresh token. */
export async function exchangeCode(
  code: string,
  credentials: Record<string, unknown>,
  redirectUri: string,
): Promise<Tokens> {
  const { id, secret } = halves(credentials);

  return post({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

/* -------------------------------------------------------------------------- */

/**
 * Access tokens, for as long as they are worth anything.
 *
 * Held in memory rather than written back to the connection row: a screen
 * refreshing every ten minutes would otherwise write a token to the database
 * six times an hour for no gain, and the row would carry a live credential
 * that expires without anyone clearing it. A cold process pays one extra
 * round trip, which is the right price.
 */
const tokens = new Map<string, { token: string; expiresAt: number }>();

/** A minute of headroom, so a token cannot expire in flight. */
const EARLY = 60_000;

export async function accessToken(
  credentials: Record<string, unknown>,
  now = Date.now(),
): Promise<string> {
  const refresh = String(credentials[REFRESH_TOKEN] ?? "").trim();
  if (!refresh) {
    throw new Error("This Google account has not finished connecting. Open Connections and continue.");
  }

  const held = tokens.get(refresh);
  if (held && held.expiresAt - EARLY > now) return held.token;

  const { id, secret } = halves(credentials);

  const minted = await post({
    client_id: id,
    client_secret: secret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });

  tokens.set(refresh, {
    token: minted.access_token,
    expiresAt: now + (minted.expires_in ?? 3600) * 1000,
  });

  return minted.access_token;
}

/** Forget an account's access token, so the next fetch mints a fresh one. */
export function forget(credentials: Record<string, unknown>): void {
  tokens.delete(String(credentials[REFRESH_TOKEN] ?? "").trim());
}

/** Whether what is stored is a finished handshake or only the first half. */
export function complete(credentials: Record<string, unknown>): boolean {
  return Boolean(String(credentials[REFRESH_TOKEN] ?? "").trim());
}
