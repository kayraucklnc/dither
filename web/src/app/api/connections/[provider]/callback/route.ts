import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { cookies } from "next/headers";

import { provider as findProvider } from "@/lib/connections";
import {
  STATE_COOKIE,
  STATE_PATH,
  note,
  originOf,
  redirectUri,
  save,
  stored,
} from "@/lib/connections/link";

/**
 * Coming back from the consent screen.
 *
 * Everything here ends at /connections, whatever happened, because that is the
 * page that can explain it: a refusal is written to the connection's own row
 * and rendered beside the card it belongs to. A JSON error at a URL nobody
 * typed is a dead end.
 */

const equal = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const origin = originOf(request);
  const back = new URL("/connections", origin);

  const done = (): NextResponse => {
    const response = NextResponse.redirect(back, { status: 303 });
    response.cookies.delete({ name: STATE_COOKIE, path: STATE_PATH });
    return response;
  };

  const source = findProvider(id);
  if (!source?.handshake) return done();

  const query = new URL(request.url).searchParams;

  // The person pressed cancel, or the client is misconfigured at the provider's
  // end. Either way their words are better than ours.
  const refused = query.get("error");
  if (refused) {
    await note(
      id,
      refused === "access_denied"
        ? `${source.label} was not given permission.`
        : `${source.label} refused the sign-in: ${refused}.`,
    );
    return done();
  }

  const code = query.get("code") ?? "";
  const state = query.get("state") ?? "";
  const expected = (await cookies()).get(STATE_COOKIE)?.value;

  if (!code || !state || !expected || !equal(expected, `${id}:${state}`)) {
    await note(id, "That sign-in did not come back the way it went out. Start it again from here.");
    return done();
  }

  const row = await stored(id);
  if (!row) {
    await note(id, `Add the ${source.label} client ID and secret first.`);
    return done();
  }

  try {
    const linked = await source.handshake.exchange(code, row.credentials, redirectUri(origin, id));

    // The grant goes on its own row, named by the account it turned out to be
    // - so signing in a second account adds one rather than replacing the
    // first. The client credentials stay where they are, because the OAuth
    // client identifies this server and is the same whoever signs in.
    await save(id, linked.label, linked.grant, linked.account);

    // And the client row stops carrying whatever refusal it was last told
    // about, now that something has worked.
    await save(id, source.label, row.credentials);
  } catch (error) {
    await note(id, error instanceof Error ? error.message : String(error));
  }

  return done();
}
