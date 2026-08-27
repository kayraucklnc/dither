import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { ScreenEditor, type PaletteEntry } from "@/components/composer/editor";
import { db } from "@/lib/db";
import { models, screens, widgets } from "@/lib/db/schema";
import { all, defaultSettings, rendersNotices } from "@/lib/extensions/registry";
import { summarise } from "@/lib/extensions/summary";

export const dynamic = "force-dynamic";

export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [screen] = await db.select().from(screens).where(eq(screens.id, id));
  if (!screen) notFound();

  const rows = await db
    .select()
    .from(widgets)
    .where(eq(widgets.screenId, id))
    .orderBy(asc(widgets.row), asc(widgets.column));

  // og_plus is the panel most people have; the editor draws for it until a
  // device says otherwise.
  const [panel] = await db.select().from(models).where(eq(models.name, "og_plus"));

  const extensions = await all();
  const palette: PaletteEntry[] = extensions
    .filter((extension) => extension.shapes.length > 0)
    .map((extension) => ({
      name: extension.name,
      label: extension.manifest.label,
      shapes: extension.shapes,
      fields: extension.manifest.fields,
      defaults: defaultSettings(extension),
      headline: summarise(extension).headline,
      noticeShapes: extension.shapes.filter((shape) => rendersNotices(extension, shape)),
      capabilitiesFrom: extension.manifest.capabilities_from,
    }));

  return (
    <ScreenEditor
      screenId={screen.id}
      modelId={panel?.id ?? 0}
      panel={{ width: panel?.width ?? 800, height: panel?.height ?? 480 }}
      palette={palette}
      initialName={screen.name}
      initialWidgets={rows.map((row) => ({
        id: row.id,
        extension: row.extension,
        label: row.label,
        settings: row.settings,
        column: row.column,
        row: row.row,
        columnSpan: row.columnSpan,
        rowSpan: row.rowSpan,
        hostsNotices: row.hostsNotices,
      }))}
    />
  );
}
