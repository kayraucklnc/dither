import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Check, FlaskConical } from "lucide-react";

import { ConnectionIcon } from "@/components/connection-icon";
import { allProviders } from "@/lib/connections";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function link(formData: FormData) {
  "use server";

  const id = String(formData.get("provider"));
  await db.insert(connections).values({ provider: id, label: id }).onConflictDoNothing();
  revalidatePath("/connections");
}

async function unlink(formData: FormData) {
  "use server";

  await db.delete(connections).where(eq(connections.provider, String(formData.get("provider"))));
  revalidatePath("/connections");
}

/**
 * Accounts linked once and shared by every widget and trigger that needs them.
 *
 * Credentials belong here rather than in a widget's settings, so a screen's
 * settings stay about what to show. Providers answering with stand-in data say
 * so once, at the top - a warning repeated on every card is a warning nobody
 * reads.
 */
export default async function ConnectionsPage() {
  const linked = new Set((await db.select().from(connections)).map((row) => row.provider));
  const providers = allProviders();
  const mocked = providers.filter((provider) => provider.mocked).length;

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
            {mocked === providers.length ? "All of these" : `${mocked} of these`} answer with
            stand-in data while their sign-in flows are being built. The shape of the data is
            final, so screens and rules you build now keep working when the real thing lands.
          </span>
        </p>
      )}

      <div className="space-y-2.5">
        {providers.map((provider) => {
          const connected = linked.has(provider.id);

          return (
            <div
              key={provider.id}
              className="flex items-center justify-between gap-5 rounded-panel border border-line bg-surface px-4 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span
                  className={cnIcon(connected)}
                  aria-hidden
                >
                  <ConnectionIcon name={provider.icon} />
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14px] font-medium">{provider.label}</h2>
                    {connected && (
                      <span className="flex items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-[11px] text-live">
                        <Check size={10} />
                        Linked
                      </span>
                    )}
                    {provider.mocked && (
                      <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-faint">
                        Stand-in
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[13px] text-muted">{provider.description}</p>
                  <p className="mt-0.5 text-[12px] text-faint">Used by {provider.unlocks}.</p>
                </div>
              </div>

              <form action={connected ? unlink : link} className="shrink-0">
                <input type="hidden" name="provider" value={provider.id} />
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

const cnIcon = (connected: boolean) =>
  [
    "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
    connected ? "border-accent/40 bg-accent/10 text-accent-bright" : "border-line bg-raised text-faint",
  ].join(" ");
