// What drawing needs from the settings, and the few text helpers every part shares.

import type { Format, Part } from "@/runtime/types";
import type { Draw } from "../api";
import { ref, type List } from "./events";

/** Everything drawing needs from the settings, worked out once. */
export interface Opt {
  /** Clock times, "09:30" or "9:30 AM". */
  hm: Format;
  /** Every shape a time can take, with `#` for any digit — to size columns for the widest. */
  hmShapes: string[];
  /** Account names per merge position; empty when tags are off or there is one account. */
  labels: string[];
  places: boolean;
  ends: boolean;
  /** Days beyond today to show: 0 today only. */
  ahead: number;
  dense: boolean;
  /** Ongoing events inverted, the next one counted down. */
  emphasis: boolean;
}

export type Content = string | Part | (string | Part)[];
export type Weight = 400 | 700;

/** Text with its baseline at `baseline`. */
export function at(
  d: Draw, content: Content, x: number, baseline: number, w: number, size: number, weight: Weight,
  o: { white?: boolean; align?: "left" | "right" | "center" } = {},
): void {
  const m = d.metrics(size, weight);
  // A little air above the ascent: some glyphs (Å, |) reach past it.
  d.text(content, { x, y: baseline - m.ascent - 3, w, h: m.lineHeight + 3, size, weight, white: o.white, align: o.align, valign: "bottom" });
}

/** "Room 4.2 · Work": where, and which account when there is more than one. */
export function detail(d: Draw, l: List, n: number, o: Opt, x: number, baseline: number, w: number, size: number, white = false): void {
  const who: Format = { map: { k: o.labels.map((_, i) => i), o: o.labels } };
  const account = o.labels.length ? d.value(ref(l, "from", n), who) : null;
  if (!o.places) {
    if (account) at(d, account, x, baseline, w, size, 400, { white });
    return;
  }
  const place = d.value(ref(l, "w", n));
  const placeKey = ref(l, "w", n);
  d.when({ v: placeKey, op: "present" }, () => at(d, account ? [place, "  ·  ", account] : place, x, baseline, w, size, 400, { white }));
  if (account) d.when({ v: placeKey, op: "absent" }, () => at(d, account, x, baseline, w, size, 400, { white }));
}

/** The widest `prefix` + a time can be at this size: every digit tried in every place. */
export function timeWidth(d: Draw, o: Opt, size: number, weight: Weight = 400, prefix = ""): number {
  let widest = 0;
  for (const shape of o.hmShapes) {
    for (let digit = 0; digit <= 9; digit++) widest = Math.max(widest, d.measure(prefix + shape.replaceAll("#", String(digit)), size, weight));
  }
  return widest;
}

/** Whether a row has a second line at all. */
export const hasDetail = (o: Opt): boolean => o.places || o.ends || o.labels.length > 0;

/** "Nothing else today", "… this week": the end of what the widget looks at. */
export function horizon(ahead: number, short = false): string {
  if (ahead <= 0) return "today";
  if (ahead === 1) return short ? "through tomorrow" : "today or tomorrow";
  return short ? "this week" : `in the next ${ahead + 1} days`;
}
