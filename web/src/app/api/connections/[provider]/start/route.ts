import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { provider as findProvider } from "@/lib/connections";
import {
  STATE_COOKIE,
  STATE_PATH,
  note,
  originOf,
  redirectUri,
  stored,
} from "@/lib/connections/link";

/**
 * Sending the browser off to ask an account for consent.
 *
 * The two halves of this are one thought: a nonce goes out in the URL and into
 * a cookie, and only a callback carrying both is believed. Without it, anyone
 * who can get you to open a link can hand your installation a code from *their*
 * account and quietly point your panels at their calendar.
 */

/** Long enough to read a consent screen, short enough not to sit around. */
const STATE_TTL = 600;

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const source = findProvider(id);
  const back = new URL("/connections", originOf(request));

  if (!source?.handshake) {
    return NextResponse.redirect(back, { status: 303 });
  }

  const row = await stored(id);
  const ready = (source.credentials ?? []).every((field) => Boolean(row?.credentials[field.key]));

  if (!ready) {
    await note(id, `Add the ${source.label} client ID and secret first.`);
    return NextResponse.redirect(back, { status: 303 });
  }

  const nonce = randomBytes(24).toString("base64url");
  const uri = redirectUri(originOf(request), id);

  let destination: string;
  try {
    destination = source.handshake.authorizeUrl(row!.credentials, uri, nonce);
  } catch (error) {
    await note(id, error instanceof Error ? error.message : String(error));
    return NextResponse.redirect(back, { status: 303 });
  }

  const response = NextResponse.redirect(destination, { status: 303 });

  response.cookies.set(STATE_COOKIE, `${id}:${nonce}`, {
    httpOnly: true,
    // Lax rather than strict: the browser comes back from Google's domain by a
    // top-level redirect, and a strict cookie is not sent on one - the
    // handshake would fail every time, on a correctly configured server.
    sameSite: "lax",
    secure: uri.startsWith("https://"),
    path: STATE_PATH,
    maxAge: STATE_TTL,
  });

  return response;
}
