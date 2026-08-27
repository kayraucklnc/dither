import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Check, Link2, TriangleAlert } from "lucide-react";

import { allProviders } from "@/lib/connections";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function link(formData: FormData) {
  "use server";

  const id = String(formData.get("provider"));
  await db
    .insert(connections)
    .values({ provider: id, label: id, credentials: {} })
    .onConflictDoNothing();

  revalidatePath("/connections");
}

async function unlink(formData: FormData) {
  "use server";

  await db.delete(connections).where(eq(connections.provider, String(formData.get("provider"))));
  revalidatePath("/connections");
}

/**
 * Accounts linked once and shared by every widget that needs them.
 *
 * Credentials belong here rather than in a widget's settings, so a screen's
 * settings stay about what to show. Providers marked as stand-ins answer with
 * plausible data, which is what lets a calendar screen and its triggers be
 * designed before the sign-in flow exists.
 */
export default async function ConnectionsPage() {
  const linked = new Set((await db.select().from(connections)).map((row) => row.provider));

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Accounts Dither can read from. Link one once and every widget that needs it works, on
          every screen.
        </p>
      </header>

      <div className="space-y-3">
        {allProviders().map((provider) => {
          const connected = linked.has(provider.id);

          return (
            <div
              key={provider.id}
              className="flex items-center justify-between gap-5 rounded-panel border border-line bg-surface px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link2 size={14} className="shrink-0 text-faint" />
                  <h2 className="text-[14px] font-medium">{provider.label}</h2>
                  {connected && (
                    <span className="flex items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-[11px] text-live">
                      <Check size={10} />
                      Linked
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-[13px] text-muted">{provider.description}</p>
                <p className="mt-1 text-[12px] text-faint">Used by {provider.unlocks}.</p>

                {provider.mocked && (
                  <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-warn">
                    <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                    Stand-in data for now. Screens and triggers built against it will keep working
                    when the real sign-in lands.
                  </p>
                )}
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
                  {connected ? "Unlink" : `Link ${provider.label}`}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
