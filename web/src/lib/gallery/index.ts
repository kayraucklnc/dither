import { environment } from "@/lib/settings";

import { collections, pictures, resolve, root, type Picture } from "./library";
import { holdSeconds, turnOf } from "./pick";

/**
 * What the gallery answers when it is asked.
 *
 * It is a `kind` of its own rather than a `poll` at some URL because the
 * pictures are on this machine: there is nothing to fetch, only a directory to
 * read and a decision to make about which of it is up. That makes it the
 * second built-in provider after transit, and it is answered the same way -
 * `ask` routes to it, the answer is filed under the question, and two widgets
 * showing the same collection with the same rotation share one row.
 *
 * The answer deliberately holds no clock. A countdown to the next picture, or
 * a "fetched at", would be a different payload on every refresh, and the
 * render fingerprint is taken over the payload - so a panel that is meant to
 * change once an hour would be handed a new file, and a redraw, every time it
 * woke. Everything here is either a fact about the directory or a function of
 * which hold we are in.
 */

export interface Shelf {
  collection: string;
  collection_label: string;
  count: number;
  picture: { id: string; title: string };
  next: { id: string; title: string };
  /** Where the current picture sits in the collection, counting from one. */
  position: number;
  /** The collection, for a design that shows more than one at once. */
  sheet: { id: string; title: string }[];
}

/** How many a contact sheet can conceivably show. Beyond this they are dots. */
const SHEET_LIMIT = 24;

const brief = (picture: Picture) => ({ id: picture.id, title: picture.title });

export async function shelf(
  settings: Record<string, unknown>,
  now = new Date(),
): Promise<Record<string, unknown>> {
  const wanted = String(settings.collection ?? "").trim();
  const found = await collections();

  if (!found.length) {
    throw new Error(
      `There are no pictures yet. Put some in ${root()}, or run ` +
        "scripts/gallery-add.mts to fetch them. See docs/gallery.md.",
    );
  }

  // A collection that has been deleted or renamed is named plainly rather than
  // quietly replaced by whichever one sorts first - a wall showing the wrong
  // pictures is a bug nobody reports because it looks like a decision.
  const collection = wanted ? found.find((one) => one.id === wanted) : undefined;
  if (wanted && !collection) {
    throw new Error(`There is no collection called "${wanted}" any more.`);
  }

  const held = await pictures(collection?.id);
  if (!held.length) {
    throw new Error(`${collection?.label ?? "The gallery"} has no pictures in it.`);
  }

  const hold = holdSeconds(String(settings.hold ?? "hour"));
  const { timezone } = await environment();

  /**
   * One picture, chosen once and left alone.
   *
   * Pinning is not a degenerate rotation - it is the other thing people want
   * a gallery for, which is one print on one wall. So it names a picture, and
   * a name that no longer resolves is refused rather than falling through to
   * the rotation: silently showing something else is how you find out months
   * later that the picture you chose has not been up since June.
   */
  const pinned = hold === 0 ? String(settings.pinned ?? "").trim() : "";

  if (pinned) {
    const one = await resolve(pinned);
    if (!one) throw new Error(`The picture chosen for this widget is no longer there.`);

    return {
      source_1: {
        collection: collection?.id ?? "",
        collection_label: collection?.label ?? "Everything",
        count: held.length,
        picture: brief(one),
        next: brief(one),
        position: held.findIndex((candidate) => candidate.id === one.id) + 1,
        sheet: held.slice(0, SHEET_LIMIT).map(brief),
      } satisfies Shelf,
    };
  }

  const turn = turnOf(
    held,
    now,
    {
      order: String(settings.order ?? "shuffle"),
      hold,
      // Two collections of the same size would otherwise shuffle into step
      // with each other, and two gallery widgets on one screen would turn
      // over together like a departure board.
      seed: collection?.id ?? "everything",
    },
    timezone,
  )!;

  return {
    source_1: {
      collection: collection?.id ?? "",
      collection_label: collection?.label ?? "Everything",
      count: held.length,
      picture: brief(turn.now),
      next: brief(turn.next),
      position: turn.position,
      sheet: held.slice(0, SHEET_LIMIT).map(brief),
    } satisfies Shelf,
  };
}
