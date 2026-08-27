import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { screens, widgets } from "@/lib/db/schema";

/**
 * Copy a screen and everything on it.
 *
 * Widget settings come along; fetched data does not, because the copy will
 * fetch its own - two copies of a weather widget are two widgets asking their
 * own question, which is the whole point of settings living on a placement.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const [source] = await db.select().from(screens).where(eq(screens.id, id));
  if (!source) return NextResponse.json({ error: "No such screen." }, { status: 404 });

  const rows = await db.select().from(widgets).where(eq(widgets.screenId, id));

  const copy = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(screens)
      .values({ name: `${source.name} copy`, description: source.description })
      .returning();

    if (rows.length) {
      await tx.insert(widgets).values(
        rows.map((row) => ({
          screenId: created.id,
          extension: row.extension,
          label: row.label,
          settings: row.settings,
          column: row.column,
          row: row.row,
          columnSpan: row.columnSpan,
          rowSpan: row.rowSpan,
        })),
      );
    }

    return created;
  });

  return NextResponse.json({ screen: copy });
}
