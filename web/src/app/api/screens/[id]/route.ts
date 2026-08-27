import { and, eq, inArray, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { screens, widgets } from "@/lib/db/schema";
import { find as findExtension, supportsSize } from "@/lib/extensions/registry";
import { refusal } from "@/lib/designs";
import { COLUMNS, ROWS, fits, overlaps, sizeOf } from "@/lib/shapes";

const widgetSchema = z.object({
  id: z.number().optional(),
  extension: z.string().min(1),
  label: z.string().default(""),
  settings: z.record(z.string(), z.unknown()).default({}),
  column: z.number().int().min(1).max(COLUMNS),
  row: z.number().int().min(1).max(ROWS),
  columnSpan: z.number().int().min(1).max(COLUMNS),
  rowSpan: z.number().int().min(1).max(ROWS),
  /** Which of the extension's designs draws it. Empty means "whichever fits". */
  design: z.string().default(""),
  /** Pinned as the screen's alert area. */
  hostsNotices: z.boolean().default(false),
});

const body = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  widgets: z.array(widgetSchema),
});

/**
 * Validate a whole arrangement before any of it is written.
 *
 * The editor already refuses these, but a client is not a place to enforce a
 * rule. A widget at a size its extension cannot draw would render as a gap on
 * a real device, hours later, with nothing to explain it.
 */
async function problemsIn(incoming: z.infer<typeof widgetSchema>[]): Promise<string[]> {
  const problems: string[] = [];

  for (const [index, widget] of incoming.entries()) {
    const name = widget.label || widget.extension;

    if (!fits(widget)) {
      problems.push(`${name} does not fit on the grid.`);
      continue;
    }

    const extension = await findExtension(widget.extension);
    if (!extension) {
      problems.push(`${widget.extension} is not installed.`);
      continue;
    }

    if (!supportsSize(extension, sizeOf(widget))) {
      problems.push(refusal(extension.manifest.label, sizeOf(widget), extension.designs));
    }

    const collision = incoming
      .slice(index + 1)
      .find((other) => overlaps(widget, other));

    if (collision) {
      problems.push(`${name} overlaps ${collision.label || collision.extension}.`);
    }
  }

  return problems;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const parsed = body.safeParse(await request.json());

  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  }

  const [screen] = await db.select().from(screens).where(eq(screens.id, id));
  if (!screen) return NextResponse.json({ error: "No such screen." }, { status: 404 });

  const problems = await problemsIn(parsed.data.widgets);
  if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 422 });

  const saved = await db.transaction(async (tx) => {
    if (parsed.data.name !== undefined || parsed.data.description !== undefined) {
      await tx
        .update(screens)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
          updatedAt: new Date(),
        })
        .where(eq(screens.id, id));
    }

    // Existing widgets are updated rather than replaced, so the data already
    // fetched for them survives an edit to the layout.
    const keep: number[] = [];

    for (const widget of parsed.data.widgets) {
      const values = {
        screenId: id,
        extension: widget.extension,
        label: widget.label,
        settings: widget.settings,
        column: widget.column,
        row: widget.row,
        columnSpan: widget.columnSpan,
        rowSpan: widget.rowSpan,
        design: widget.design,
        hostsNotices: widget.hostsNotices,
        updatedAt: new Date(),
      };

      if (widget.id && widget.id > 0) {
        await tx
          .update(widgets)
          .set(values)
          .where(and(eq(widgets.id, widget.id), eq(widgets.screenId, id)));
        keep.push(widget.id);
      } else {
        const [created] = await tx.insert(widgets).values(values).returning();
        keep.push(created.id);
      }
    }

    await tx
      .delete(widgets)
      .where(
        keep.length
          ? and(eq(widgets.screenId, id), notInArray(widgets.id, keep))
          : eq(widgets.screenId, id),
      );

    return tx.select().from(widgets).where(inArray(widgets.id, keep.length ? keep : [-1]));
  });

  return NextResponse.json({ widgets: saved });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  await db.delete(screens).where(eq(screens.id, id));
  return NextResponse.json({ ok: true });
}
