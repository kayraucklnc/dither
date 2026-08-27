import { startOfDay } from "@/lib/clock";

/**
 * Which picture is up, and when the next one is.
 *
 * The whole of the rotation is a pure function of the clock, which is not a
 * stylistic preference - it is what stops the panel redrawing for nothing.
 *
 * A widget's data is refetched whenever it has aged out, and the fingerprint
 * that decides whether the device gets a new file is taken over that data. So
 * if choosing a picture involved any memory at all - a cursor, a last-shown
 * column, a random number - every refetch would produce a different answer,
 * every answer would be a new fingerprint, and a panel that is meant to change
 * once an hour would redraw every five minutes for as long as it hung there.
 *
 * Derived from the clock instead, the answer is *identical* on every fetch
 * inside a hold, so the fetch is free and the picture moves exactly when it
 * was asked to. That is the same bargain a design's `tick` makes, arrived at
 * from the other side: there, the clock is quantised into the key; here, the
 * data is quantised by the clock before it ever reaches one.
 */

/** How long one picture stays up. `0` is "never change". */
export const HOLDS: Record<string, number> = {
  never: 0,
  quarter: 15 * 60,
  hour: 60 * 60,
  half_day: 12 * 60 * 60,
  day: 24 * 60 * 60,
};

export function holdSeconds(hold: string | undefined): number {
  return HOLDS[hold ?? "hour"] ?? HOLDS.hour;
}

/**
 * Which hold we are in.
 *
 * Anything shorter than a day is counted from the epoch, which divides the
 * clock into equal blocks everywhere. A day is not: "a new picture each day"
 * means one at breakfast, so it has to turn over at local midnight, and local
 * midnight is 23 or 25 hours after the last one twice a year. See lib/clock.ts.
 */
export function slotOf(at: Date, hold: number, timezone: string): number {
  if (hold <= 0) return 0;
  if (hold < 24 * 60 * 60) return Math.floor(at.getTime() / (hold * 1000));

  // Days since the epoch, counted by local midnights rather than by dividing.
  return Math.round(startOfDay(at, timezone).getTime() / 86_400_000);
}

/** A small, stable integer hash. Not a digest - just a well-mixed seed. */
function seedOf(text: string): number {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/** xorshift32, so a seed gives the same sequence on every machine and run. */
function shuffled<Item>(items: Item[], seed: number): Item[] {
  const output = [...items];
  let state = seed || 1;

  for (let index = output.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    const swap = state % (index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }

  return output;
}

export interface Rotation {
  /** `order`: "shuffle" or "sequence". */
  order?: string;
  hold: number;
  /** Keeps two collections holding the same number of pictures out of step. */
  seed: string;
}

/**
 * The order the collection is walked in during the cycle containing `slot`.
 *
 * Shuffling per *cycle* rather than per slot is the difference between a
 * shuffle and a dice roll. Picking `hash(slot) % count` each time shows the
 * same picture twice in a row about as often as you would expect, and skips
 * others for days; drawing a fresh permutation every time the collection has
 * been through once means every picture appears exactly once per cycle, in an
 * order that is different each time round.
 */
function orderFor<Item>(items: Item[], slot: number, rotation: Rotation): Item[] {
  if (rotation.order === "sequence" || items.length < 2) return items;

  const cycle = Math.floor(slot / items.length);
  return shuffled(items, seedOf(`${rotation.seed}:${cycle}`));
}

export interface Turn<Item> {
  now: Item;
  next: Item;
  /** Where in the collection this is, counting from one. For a caption. */
  position: number;
}

/** What is up now and what is up next, out of a collection that does not move. */
export function turnOf<Item>(
  items: Item[],
  at: Date,
  rotation: Rotation,
  timezone: string,
): Turn<Item> | undefined {
  if (!items.length) return undefined;

  const slot = slotOf(at, rotation.hold, timezone);
  const position = ((slot % items.length) + items.length) % items.length;

  const order = orderFor(items, slot, rotation);
  // The next slot may fall in the next cycle, and the next cycle is a
  // different permutation - so it is looked up rather than assumed to be the
  // one after this in the order we happen to be holding.
  const after = orderFor(items, slot + 1, rotation)[
    ((slot + 1) % items.length + items.length) % items.length
  ];

  return { now: order[position], next: after, position: position + 1 };
}
