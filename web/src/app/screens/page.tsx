import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LayoutTemplate, Plus } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { db } from "@/lib/db";
import { screens, widgets } from "@/lib/db/schema";
import { DEFAULT_PANEL } from "@/lib/panel";

export const dynamic = "force-dynamic";

async function createScreen() {
  "use server";

  const [screen] = await db.insert(screens).values({ name: "New screen" }).returning();
  revalidatePath("/screens");
  redirect(`/screens/${screen.id}`);
}

export default async function ScreensPage() {
  const rows = await db
    .select({
      id: screens.id,
      name: screens.name,
      description: screens.description,
      updatedAt: screens.updatedAt,
      widgetCount: sql<number>`count(${widgets.id})::int`,
    })
    .from(screens)
    .leftJoin(widgets, eq(widgets.screenId, screens.id))
    .groupBy(screens.id)
    .orderBy(desc(screens.updatedAt));

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Screens</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
            A screen is a design: widgets arranged on the panel. A device shows one at a time, and
            which one it shows is decided by its flow.
          </p>
        </div>
        <form action={createScreen}>
          <button
            type="submit"
            className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            <Plus size={15} />
            New screen
          </button>
        </form>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line p-12 text-center">
          <LayoutTemplate size={22} className="mx-auto text-faint" />
          <p className="mt-4 text-[14px] text-muted">
            No screens yet. Make one and drop a few extensions onto it.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((screen) => (
            <Link
              key={screen.id}
              href={`/screens/${screen.id}`}
              className="group rounded-panel border border-line bg-surface p-3 transition-colors hover:border-line-strong"
            >
              <ScreenPreview
                src={`/api/preview/screen/${screen.id}`}
                width={DEFAULT_PANEL.width}
                height={DEFAULT_PANEL.height}
                alt={screen.name}
                className="paper-shadow"
              />
              <div className="px-1 pt-3 pb-1">
                <h2 className="truncate text-[14px] font-medium">{screen.name}</h2>
                <p className="mt-0.5 text-[12px] text-faint">
                  {screen.widgetCount} widget{screen.widgetCount === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
