// Linking a Google account from a static page: the authorization code flow
// with PKCE in a popup, the code traded for a refresh token straight from the
// browser (Google's token endpoint allows it). The refresh token then goes to
// the panel, which trades it for access tokens itself.

import { TOKEN_URL, type GoogleLink } from "./index";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function redirectUri(): string {
  return new URL("oauth.html", document.baseURI).toString();
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge: base64url(digest) };
}

function waitForCode(state: string, popup: Window): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel("dither-oauth");
    const timer = setInterval(() => {
      if (popup.closed) finish(() => reject(new Error("The Google window was closed before signing in finished.")));
    }, 500);
    const finish = (then: () => void) => {
      clearInterval(timer);
      channel.close();
      then();
    };
    channel.onmessage = (e: MessageEvent<{ state?: string; code?: string; error?: string }>) => {
      if (e.data.state !== state) return;
      finish(() => (e.data.code ? resolve(e.data.code) : reject(new Error(`Google said: ${e.data.error ?? "no"}`))));
    };
  });
}

function emailFrom(idToken: unknown): string {
  if (typeof idToken !== "string") return "";
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { email?: string };
    return payload.email ?? "";
  } catch {
    return "";
  }
}

export async function linkGoogle(clientId: string, clientSecret: string, scopes: string[]): Promise<GoogleLink> {
  const { verifier, challenge } = await pkce();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    // Without consent, a second link returns no refresh token at all.
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const popup = window.open(`${AUTH_URL}?${params}`, "dither-google", "width=520,height=680");
  if (!popup) throw new Error("The browser blocked the Google window. Allow pop-ups for this page and try again.");
  const code = await waitForCode(state, popup);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri(), code_verifier: verifier,
    }),
  });
  const body = (await res.json()) as { refresh_token?: string; id_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.refresh_token) {
    throw new Error(body.error_description ?? body.error ?? "Google did not hand back a refresh token.");
  }
  const email = emailFrom(body.id_token);
  return { id: email || `google-${Date.now().toString(36)}`, clientId, clientSecret, refreshToken: body.refresh_token, email };
}

/** A short-lived access token, for the browser's own calls (calendar list, preview). */
export async function accessToken(link: GoogleLink): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: link.refreshToken, client_id: link.clientId, client_secret: link.clientSecret }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(body.error_description ?? "Google refused the saved sign-in. Link the account again.");
  return body.access_token;
}

export async function listCalendars(link: GoogleLink): Promise<{ id: string; name: string }[]> {
  const token = await accessToken(link);
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?fields=items(id,summary,primary)", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google answered ${res.status} for the calendar list.`);
  const body = (await res.json()) as { items?: { id: string; summary: string; primary?: boolean }[] };
  return (body.items ?? []).map((c) => ({ id: c.primary ? "primary" : c.id, name: c.summary }));
}
