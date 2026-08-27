import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { ScreenEditor, type PaletteEntry } from "@/components/composer/editor";
import { db } from "@/lib/db";
import { models, screens, widgets } from "@/lib/db/schema";
import { all, defaultSettings, headlineSize, rendersNotices } from "@/lib/extensions/registry";

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
    .filter((extension) => extension.designs.length > 0)
    .map((extension) => ({
      name: extension.name,
      label: extension.manifest.label,
      designs: extension.designs,
      fields: extension.manifest.fields,
      defaults: defaultSettings(extension),
      headline: headlineSize(extension),
      // Whether a design has an alert strip is a fact about its template, and
      // templates never reach the browser - so it is settled here and sent as
      // a list of keys.
      noticeDesigns: extension.designs
        .filter((design) => rendersNotices(extension, design.nominal, design.key))
        .map((design) => design.key),
      capabilitiesFrom: extension.manifest.capabilities_from,
      factCount: extension.manifest.facts.length,
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
        design: row.design,
        hostsNotices: row.hostsNotices,
      }))}
    />
  );
}
