// An event on the panel, as references and conditions.
//
// Every account's calendar is fetched on its own (sources c0, c1, …) and the
// panel merges them into lists (see `merges` in index.ts). A list's record n is
// `<list>/<field><n>`: title t, start s, all-day date a, end e, place w, and
// `from<n>` — which account. A timed record has `s`; an all-day one only `a`.
//
// Nothing here knows what the values are: the layout is fixed when the project
// is compiled, and these conditions choose what shows when the panel wakes.

import type { Condition, Format } from "@/runtime/types";

/** One merged list, and whether it holds all-day records as well as timed ones. */
export interface List {
  name: string;
  mixed: boolean;
}

/** The merge of timed events only: what facts and "Next up" read. */
export const TIMED: List = { name: "agenda", mixed: false };
/** Timed and all-day events in one order. (Kept under its old merge name.) */
export const MIXED: List = { name: "allday", mixed: true };

export const ref = (l: List, field: string, n: number): string => `${l.name}/${field}${n}`;

export const not = (c: Condition): Condition => ({ not: c });
export const and = (...c: Condition[]): Condition => ({ all: c });
export const or = (...c: Condition[]): Condition => ({ any: c });

/**
 * Calendar days from today, as text: "0" today (or earlier — an event that
 * began yesterday and is still on), "1" tomorrow, … "7" a week or more away.
 */
const DAY: Format = { days: true, steps: { t: [1, 2, 3, 4, 5, 6, 7], o: ["0", "1", "2", "3", "4", "5", "6", "7"] } };

/** The fields a record's date can be read from. */
const dateFields = (l: List) => (l.mixed ? ["s", "a"] : ["s"]);

export const exists = (l: List, n: number): Condition => ({ v: ref(l, "t", n), op: "present" });
export const timed = (l: List, n: number): Condition => ({ v: ref(l, "s", n), op: "present" });

/** On today (`"0"`) or tomorrow (`"1"`). */
export const dayIs = (l: List, n: number, day: "0" | "1"): Condition =>
  or(...dateFields(l).map((f): Condition => ({ v: ref(l, f, n), f: DAY, op: "eq", x: day })));

/** Two records fall on the same day. */
export const sameDay = (l: List, n: number, m: number): Condition =>
  or(...dateFields(l).flatMap((f) => dateFields(l).map((g): Condition => ({ v: ref(l, f, n), f: DAY, op: "eq", vs: ref(l, g, m) }))));

/** Present, and within the days the widget looks ahead. */
export const within = (l: List, n: number, ahead: number): Condition =>
  and(exists(l, n), or(...dateFields(l).map((f): Condition => ({ v: ref(l, f, n), f: { days: true }, op: "le", x: ahead }))));

const started = (l: List, n: number): Condition => ({ v: ref(l, "s", n), f: { until: true }, op: "absent" });

/** Begun and not yet over. */
export const ongoing = (l: List, n: number): Condition =>
  and(timed(l, n), started(l, n), { v: ref(l, "e", n), f: { until: true }, op: "present" });

/** Starting within the hour. */
export const soon = (l: List, n: number): Condition => ({ v: ref(l, "s", n), f: { until: true }, op: "lt", x: 60 });

/** Minutes until it starts, as a whole number. */
export const MINUTES: Format = { until: true, num: { d: 0 } };
