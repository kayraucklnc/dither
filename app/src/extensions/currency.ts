// Currencies a widget can show money in, and the rates between them: the
// European Central Bank's daily reference rates through Frankfurter, which
// the panel fetches itself (no key, a reply of a few dozen bytes).

import type { SourceSpec } from "./api";

/** `decimals` matters: Stripe counts in minor units, and yen has none. */
export const CURRENCIES = [
  { value: "eur", label: "Euro", sign: "€", decimals: 2 },
  { value: "usd", label: "US dollar", sign: "$", decimals: 2 },
  { value: "gbp", label: "Pound", sign: "£", decimals: 2 },
  { value: "try", label: "Turkish lira", sign: "₺", decimals: 2 },
  { value: "chf", label: "Swiss franc", sign: "CHF ", decimals: 2 },
  { value: "jpy", label: "Yen", sign: "¥", decimals: 0 },
];

export type Currency = (typeof CURRENCIES)[number];

/** How many `to` one `from` buys today, as the value `rate`. */
export function rateSource(from: string, to: string): SourceSpec {
  const f = from.toUpperCase(), t = to.toUpperCase();
  return { url: `https://api.frankfurter.dev/v1/latest?base=${f}&symbols=${t}`, every: 360, values: { rate: `rates.${t}` } };
}
