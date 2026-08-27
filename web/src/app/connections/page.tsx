import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Check, FlaskConical, TriangleAlert } from "lucide-react";

import { ConnectionIcon } from "@/components/connection-icon";
import { CredentialForm } from "@/components/credential-form";
import { allProviders, provider as findProvider } from "@/lib/connections";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Linking an account, and what "linked" is allowed to mean.
 *
 * A provider that needs nothing is one click. A provider that needs a key gets
 * a form, and the key is *checked before it is stored*: pasting a typo and
 * being told "linked" is how you end up debugging a blank widget an hour later
 * when the truth was available in one API call.
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
    return;
  }

  if (source.verify) {
    const verdict = await source.verify(credentials);
    if (!verdict.ok) {
      await note(id, verdict.error ?? "Those credentials were refused.");
      return;
    }

    await db
      .insert(connections)
      .values({ provider: id, label: verdict.label ?? source.label, credentials })
      .onConflictDoUpdate({
        target: connections.provider,
        set: { label: verdict.label ?? source.label, credentials, connectedAt: new Date() },
      });

    revalidatePath("/connections");
    return;
  }

  await db
    .insert(connections)
    .values({ provider: id, label: source.label, credentials })
    .onConflictDoNothing();

  revalidatePath("/connections");
}

/**
 * A refusal, remembered.
 *
 * Server actions cannot hand a message back to a page that re-renders from the
 * database, so the reason lives in the row that failed - as a link with no
 * credentials, which is exactly what it is.
 */
async function note(id: string, message: string) {
  await db
    .insert(connections)
    .values({ provider: id, label: `error:${message}`, credentials: {} })
    .onConflictDoUpdate({
      target: connections.provider,
      set: { label: `error:${message}`, credentials: {} },
    });

  revalidatePath("/connections");
}

async function unlink(formData: FormData) {
  "use server";

  await db.delete(connections).where(eq(connections.provider, String(formData.get("provider"))));
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
function hint(credentials: Record<string, unknown>, key: string): string {
  const value = String(credentials[key] ?? "");
  return value ? `••••${value.slice(-4)}` : "";
}

export default async function ConnectionsPage() {
  const rows = await db.select().from(connections);
  const linked = new Map(rows.map((row) => [row.provider, row]));
  const providers = allProviders();
  const mocked = providers.filter((one) => one.mocked).length;

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
          const row = linked.get(one.id);
          const failure = row?.label.startsWith("error:") ? row.label.slice(6) : undefined;
          const connected = Boolean(row) && !failure;
          const needsCredentials = (one.credentials ?? []).length > 0;

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
                      {connected && (
                        <span className="flex items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-[11px] text-live">
                          <Check size={10} />
                          {/* Whose account it turned out to be, when the
                              provider was able to say. A provider that just
                              stores its own id says "Linked" instead of
                              repeating its own name back in lower case. */}
                          {accountName(row!.label, one.id, one.label) ?? "Linked"}
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

                    {connected && needsCredentials && (
                      <p className="mt-1.5 font-mono text-[12px] text-faint">
                        {(one.credentials ?? [])
                          .filter((field) => field.secret)
                          .map((field) => `${field.label} ${hint(row!.credentials, field.key)}`)
                          .join("  ")}
                      </p>
                    )}
                  </div>
                </div>

                {(connected || !needsCredentials) && (
                  <form action={connected ? unlink : link} className="shrink-0">
                    <input type="hidden" name="provider" value={one.id} />
                    <button
                      type="submit"
                      className={
                        connected
                          ? "rounded-lg border border-line bg-raised px-3.5 py-2 text-[13px] text-muted transition-colors hover:text-ink"
                          : "rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
                      }
                    >
                      {connected ? "Unlink" : "Link"}
                    </button>
                  </form>
                )}
              </div>

              {failure && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] leading-relaxed text-danger">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                  {failure}
                </p>
              )}

              {!connected && needsCredentials && (
                <CredentialForm
                  provider={one.id}
                  fields={one.credentials ?? []}
                  help={one.help}
                  action={link}
                />
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-faint">
        Credentials are stored in this installation&rsquo;s own database and are never sent to a
        browser or to anyone else. Give Dither a restricted, read-only key where the service offers
        one — it only ever reads.
      </p>
    </div>
  );
}

const badge = (connected: boolean) =>
  [
    "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
    connected ? "border-accent/40 bg-accent/10 text-accent-bright" : "border-line bg-raised text-faint",
  ].join(" ");
