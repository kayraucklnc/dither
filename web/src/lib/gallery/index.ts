import { environment } from "@/lib/settings";

import { collections, pictures, resolve, root, type Orientation, type Picture } from "./library";
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

  const inside = await pictures(collection?.id);
  if (!inside.length) {
    throw new Error(`${collection?.label ?? "The gallery"} has no pictures in it.`);
  }

  /**
   * One picture, chosen once and left alone, or a rotation.
   *
   * Its own question rather than a "never" hidden at the top of the rotation
   * menu, which is where it used to live and where nobody found it.
   */
  const one = String(settings.pick ?? "rotate") === "one";

  /**
   * Only the pictures that are the right shape for this panel.
   *
   * The single most useful filter there is, because almost everything in this
   * visual idiom was made portrait for a phone and a panel is widescreen. A
   * rotation of portrait pins on a landscape wallpaper is a rotation of crops,
   * and the honest answer is not a cleverer crop - it is not showing them.
   *
   * It only applies to a rotation. Naming one picture is a stronger statement
   * than naming a shape, so a pinned portrait is shown; the alternative was a
   * widget that reported one eligible picture and drew a different one.
   *
   * A filter that leaves nothing says so rather than quietly falling back to
   * the whole collection - a wallpaper showing the pictures you excluded is
   * worse than one that has stopped and told you why.
   */
  const wantedShape = String(settings.orientation ?? "any") as Orientation;
  const held =
    one || wantedShape === "any"
      ? inside
      : inside.filter((candidate) => candidate.orientation === wantedShape);

  if (!held.length) {
    const shapes = [...new Set(inside.map((candidate) => candidate.orientation))];

    throw new Error(
      `Nothing in ${collection?.label ?? "the gallery"} is ${wantedShape}. ` +
        `It holds ${inside.length} picture${inside.length === 1 ? "" : "s"}, ` +
        `${inside.length === 1 ? "and it is" : "all of them"} ${shapes.join(" or ")}.`,
    );
  }

  const { timezone } = await environment();

  /**
   * A name that no longer resolves is refused rather than falling through to
   * the rotation. Silently showing something else is how you find out months
   * later that the picture you chose has not been up since June.
   */
  if (one) {
    const wanted = String(settings.pinned ?? "").trim();
    const chosen = wanted ? await resolve(wanted) : held[0];

    if (!chosen) throw new Error("The picture chosen for this widget is no longer there.");

    return {
      source_1: {
        collection: collection?.id ?? "",
        collection_label: collection?.label ?? "Everything",
        count: held.length,
        picture: brief(chosen),
        next: brief(chosen),
        position: held.findIndex((candidate) => candidate.id === chosen.id) + 1,
        sheet: held.slice(0, SHEET_LIMIT).map(brief),
      } satisfies Shelf,
    };
  }

  const turn = turnOf(
    held,
    now,
    {
      order: String(settings.order ?? "shuffle"),
      hold: holdSeconds(String(settings.hold ?? "hour")),
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
