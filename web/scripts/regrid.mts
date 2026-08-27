import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { widgets } from "../src/lib/db/schema";
import { COLUMNS, ROWS } from "../src/lib/shapes";

/**
 * Move every placed widget from the old 6x6 grid onto the 12x12 one.
 *
 *   npx tsx --env-file=.env.local scripts/regrid.mts
 *
 * A doubling, so every screen looks exactly as it did: a widget at column 4
 * spanning 3 becomes column 7 spanning 6, which is the same half of the panel.
 * Nothing moves and nothing resizes - the grid underneath just got twice as
 * fine, which is the whole point.
 *
 * Idempotent by inspection rather than by a flag: a screen already on the
 * twelfth grid has at least one widget that would overflow if doubled again,
 * and any screen whose widgets all fit in the top-left quarter was already
 * only using a quarter of the panel. So it refuses unless *every* widget on
 * the screen fits the old grid, and says which screens it left alone.
 */
const rows = await db.select().from(widgets);

if (!rows.length) {
  console.log("No widgets to move.");
  process.exit(0);
}

const screens = new Map<number, typeof rows>();
for (const widget of rows) {
  screens.set(widget.screenId, [...(screens.get(widget.screenId) ?? []), widget]);
}

const OLD_COLUMNS = COLUMNS / 2;
const OLD_ROWS = ROWS / 2;

const onOldGrid = (widget: (typeof rows)[number]) =>
  widget.column + widget.columnSpan - 1 <= OLD_COLUMNS &&
  widget.row + widget.rowSpan - 1 <= OLD_ROWS;

let moved = 0;
const skipped: string[] = [];

for (const [screenId, placed] of screens) {
  if (!placed.every(onOldGrid)) {
    skipped.push(
      `screen ${screenId}: ${placed.filter((widget) => !onOldGrid(widget)).length} of ` +
        `${placed.length} widgets already use more than the top-left ${OLD_COLUMNS}x${OLD_ROWS}`,
    );
    continue;
  }

  for (const widget of placed) {
    await db
      .update(widgets)
      .set({
        column: (widget.column - 1) * 2 + 1,
        row: (widget.row - 1) * 2 + 1,
        columnSpan: widget.columnSpan * 2,
        rowSpan: widget.rowSpan * 2,
      })
      .where(eq(widgets.id, widget.id));

    moved += 1;
  }
}

console.log(`Moved ${moved} widget${moved === 1 ? "" : "s"} onto the ${COLUMNS}x${ROWS} grid.`);

if (skipped.length) {
  console.log(`\nLeft alone, because they are already on the finer grid:`);
  skipped.forEach((line) => console.log(`  ${line}`));
}

process.exit(0);
