import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ArrowRight, Check, FlaskConical, Plus, TriangleAlert } from "lucide-react";

import { ConnectionIcon } from "@/components/connection-icon";
import { CredentialForm } from "@/components/credential-form";
import { RedirectUri } from "@/components/redirect-uri";
import { allProviders, provider as findProvider } from "@/lib/connections";
import {
  CLIENT,
  accountsOf,
  failure,
  forgetConnection,
  isHalfway,
  isLinked,
  note,
  originFromHeaders,
  redirectUri,
  save,
  startUrl,
  stored,
} from "@/lib/connections/link";

export const dynamic = "force-dynamic";

/**
 * Linking an account, and what "linked" is allowed to mean.
 *
 * A provider that needs nothing is one click. A provider that needs a key gets
 * a form, and the key is *checked before it is stored*: pasting a typo and
 * being told "linked" is how you end up debugging a blank widget an hour later
 * when the truth was available in one API call.
 *
 * A provider with a handshake is two steps, because the service will not let
 * an unpublished application ask for what it needs. The form takes the client
 * credentials that identify this installation, and the button that appears
 * afterwards sends the browser off to the service's own consent screen. It is
 * not linked until it comes back.
 *
 * The stored secret never comes back to the browser. The card shows the last
 * four characters, which is enough to tell one key from another and useless to
 * anyone reading over a shoulder or watching a screen share.
 */
async function link(formData: FormData) {
  "use server";

  const id = String(formData.get("provider"));
  const source = findProvider(id);
  if (!source) return;

  const credentials = Object.fromEntries(
    (source.credentials ?? []).map((field) => [field.key, String(formData.get(field.key) ?? "").trim()]),
  );

  const missing = (source.credentials ?? []).find((field) => !credentials[field.key]);
  if (missing) {
    await note(id, `${missing.label} is required.`);
    revalidatePath("/connections");
    return;
  }

  if (source.verify) {
    const verdict = await source.verify(credentials);
    if (!verdict.ok) {
      await note(id, verdict.error ?? "Those credentials were refused.");
      revalidatePath("/connections");
      return;
    }

    await save(id, verdict.label ?? source.label, credentials);
    revalidatePath("/connections");
    return;
  }

  // A provider that asks for nothing and verifies nothing - the stand-ins.
  await save(id, source.label, credentials);
  revalidatePath("/connections");
}

/**
 * Letting go of one account.
 *
 * Named, because a provider can hold several and "unlink Google" is no longer
 * a single thing. The installation's client credentials are left alone: they
 * identify this server, not the account, and having to paste them again to
 * re-add an account you removed by mistake would be a poor trade.
 */
async function signOut(formData: FormData) {
  "use server";

  const id = String(formData.get("provider"));
  const account = String(formData.get("account") ?? "");

  await forgetConnection(id, account);
  revalidatePath("/connections");
}

/**
 * Letting go of the whole provider.
 *
 * Every account and the client credentials with them. For a provider that
 * takes a pasted key this is the only kind of unlinking there is.
 */
async function forget(formData: FormData) {
  "use server";

  await forgetConnection(String(formData.get("provider")));
  revalidatePath("/connections");
}

/** A stored label worth showing, or nothing when it is just the provider's name. */
function accountName(label: string, id: string, providerLabel: string): string | undefined {
  const trimmed = label.trim();
  const same = [id, providerLabel].some(
    (candidate) => candidate.toLowerCase() === trimmed.toLowerCase(),
  );

  return trimmed && !same ? trimmed : undefined;
}

/** The last four characters of a secret, and nothing else. */
function secretHint(credentials: Record<string, unknown>, key: string): string {
  const value = String(credentials[key] ?? "");
  return value ? `••••${value.slice(-4)}` : "";
}

export default async function ConnectionsPage() {
  const providers = allProviders();
  const mocked = providers.filter((one) => one.mocked).length;

  // One query per provider rather than one for everything: a provider now has
  // a client row and a row per account, and keeping them apart here is what
  // stops the page having to know the shape.
  const state = new Map(
    await Promise.all(
      providers.map(
        async (one) =>
          [one.id, { client: await stored(one.id, CLIENT), accounts: await accountsOf(one.id) }] as const,
      ),
    ),
  );

  // The redirect URI a handshake will use, which has to be registered with the
  // provider before the handshake can succeed. Built from the request rather
  // than guessed, so a box reached through a proxy or a tunnel shows the
  // address a browser actually arrives at.
  const origin = originFromHeaders(await headers());

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Accounts Dither can read from. Link one once and every widget and trigger that needs it
          works, on every screen.
        </p>
      </header>

      {mocked > 0 && (
        <p className="mb-6 flex items-start gap-2.5 rounded-panel border border-line bg-surface px-4 py-3 text-[12px] leading-relaxed text-muted">
          <FlaskConical size={14} className="mt-0.5 shrink-0 text-faint" />
          <span>
            {mocked} of these answer with stand-in data while their sign-in flows are being built.
            The shape of the data is final, so screens and rules you build now keep working when
            the real thing lands.
          </span>
        </p>
      )}

      <div className="space-y-2.5">
        {providers.map((one) => {
          const { client, accounts } = state.get(one.id)!;
          const problem = client ? failure(client.label) : undefined;
          const connected = isLinked(one, client, accounts);
          // Client credentials in, nobody signed in. The only state that needs
          // a second button rather than a second form.
          const halfway = isHalfway(one, client, accounts);
          const needsCredentials = (one.credentials ?? []).length > 0;
          const uri = one.handshake ? redirectUri(origin, one.id) : undefined;

          return (
            <div key={one.id} className="rounded-panel border border-line bg-surface px-4 py-3.5">
              <div className="flex items-start justify-between gap-5">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className={badge(connected)} aria-hidden>
                    <ConnectionIcon name={one.icon} />
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[14px] font-medium">{one.label}</h2>
                      {connected && !one.handshake && (
                        <span className="flex items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-[11px] text-live">
                          <Check size={10} />
                          {/* Whose account it turned out to be, when the
                              provider was able to say. A provider that just
                              stores its own id says "Linked" instead of
                              repeating its own name back in lower case. */}
                          {accountName(client!.label, one.id, one.label) ?? "Linked"}
                        </span>
                      )}
                      {connected && one.handshake && (
                        <span className="rounded-full bg-live/10 px-2 py-0.5 text-[11px] text-live">
                          {accounts.length} account{accounts.length === 1 ? "" : "s"}
                        </span>
                      )}
                      {halfway && (
                        <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-faint">
                          Not signed in yet
                        </span>
                      )}
                      {one.mocked && (
                        <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-faint">
                          Stand-in
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-[13px] text-muted">{one.description}</p>
                    <p className="mt-0.5 text-[12px] text-faint">Used by {one.unlocks}.</p>

                    {(connected || halfway) && needsCredentials && (
                      <p className="mt-1.5 font-mono text-[12px] text-faint">
                        {(one.credentials ?? [])
                          .filter((field) => field.secret)
                          .map((field) => `${field.label} ${secretHint(client?.credentials ?? {}, field.key)}`)
                          .join("  ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* A provider that can hold several offers another sign-in
                      for as long as it is linked, not only while empty. */}
                  {(halfway || (connected && one.multiple)) && (
                    <a
                      href={startUrl(one.id)}
                      className={
                        halfway
                          ? "flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
                          : "flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3.5 py-2 text-[13px] text-muted transition-colors hover:text-ink"
                      }
                    >
                      {halfway ? (
                        <>
                          Sign in to {one.label}
                          <ArrowRight size={13} />
                        </>
                      ) : (
                        <>
                          <Plus size={13} />
                          Add account
                        </>
                      )}
                    </a>
                  )}

                  {(connected || halfway || !needsCredentials) && (
                    <form action={forget}>
                      <input type="hidden" name="provider" value={one.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-line bg-raised px-3.5 py-2 text-[13px] text-muted transition-colors hover:text-ink"
                      >
                        {one.handshake ? "Forget" : "Unlink"}
                      </button>
                    </form>
                  )}

                  {!connected && !halfway && !needsCredentials && (
                    <form action={link}>
                      <input type="hidden" name="provider" value={one.id} />
                      <button
                        type="submit"
                        className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
                      >
                        Link
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Every account signed in, each removable on its own. */}
              {accounts.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                  {accounts.map((account) => (
                    <li
                      key={account.account}
                      className="flex items-center justify-between gap-3 rounded-lg bg-ground px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Check size={12} className="shrink-0 text-live" />
                        <span className="truncate text-[13px] text-ink">{account.account}</span>
                      </span>

                      <form action={signOut}>
                        <input type="hidden" name="provider" value={one.id} />
                        <input type="hidden" name="account" value={account.account} />
                        <button
                          type="submit"
                          className="shrink-0 text-[12px] text-faint transition-colors hover:text-danger"
                        >
                          Sign out
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              {problem && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] leading-relaxed text-danger">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                  {problem}
                </p>
              )}

              {halfway && uri && (
                <p className="mt-3 text-[12px] leading-relaxed text-faint">
                  If signing in comes back with <code className="font-mono">redirect_uri_mismatch</code>,
                  the OAuth client is missing <code className="font-mono text-muted">{uri}</code> as an
                  authorised redirect URI.
                </p>
              )}

              {!connected && !halfway && needsCredentials && (
                <CredentialForm
                  provider={one.id}
                  fields={one.credentials ?? []}
                  help={one.help}
                  action={link}
                  submitLabel={one.handshake ? "Save and continue" : "Link"}
                  above={uri ? <RedirectUri uri={uri} /> : undefined}
                />
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-faint">
        Credentials are stored in this installation&rsquo;s own database and are never sent to a
        browser or to anyone else. Give Dither a restricted, read-only key where the service offers
        one &mdash; it only ever reads.
      </p>
    </div>
  );
}

const badge = (connected: boolean) =>
  [
    "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
    connected ? "border-accent/40 bg-accent/10 text-accent-bright" : "border-line bg-raised text-faint",
  ].join(" ");
