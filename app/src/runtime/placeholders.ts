// `{{now}}`-style placeholders in source URLs and headers: docs/format.md
// "Sources". The browser expands them for the simulator; the panel does the
// same each time it fetches.

import { formatTime, type FormatContext } from "./format";
import { fromLocal, toLocal } from "./tz";

// `{{now}}`, or `{{now|PATTERN}}` with an optional offset; `{{now+N}}` alone is not one.
const PLACEHOLDER = /\{\{now(?:(?:([+-])(\d+))?\|([^}]*))?\}\}/g;

/** Percent-encode everything but RFC 3986's unreserved characters. */
function encode(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => {
    const c = String.fromCharCode(b);
    return /[A-Za-z0-9\-._~]/.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }).join("");
}

const TODAY = /\{\{today(?:([+-])(\d+))?\}\}/g;

export function hasPlaceholders(text: string): boolean {
  return new RegExp(PLACEHOLDER.source).test(text) || new RegExp(TODAY.source).test(text);
}

/** Unix seconds of local midnight on the day of `now`. */
function midnight(ctx: FormatContext): number {
  const l = toLocal(ctx.zone, ctx.now);
  return fromLocal(ctx.zone, { year: l.year, month: l.month, day: l.day, hour: 0, minute: 0, second: 0 });
}

export function expand(text: string, ctx: FormatContext, inUrl: boolean): string {
  return text.replace(TODAY, (_, sign: string | undefined, n: string | undefined) =>
    String(midnight(ctx) + (sign ? (sign === "-" ? -1 : 1) * Number(n) : 0)),
  ).replace(PLACEHOLDER, (_, sign: string | undefined, n: string | undefined, pattern: string | undefined) => {
    const t = ctx.now + (sign ? (sign === "-" ? -1 : 1) * Number(n) : 0);
    const out = pattern === undefined ? String(t) : formatTime(pattern, toLocal(ctx.zone, t), ctx.locale);
    return inUrl ? encode(out) : out;
  });
}
