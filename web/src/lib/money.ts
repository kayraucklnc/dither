/**
 * Money, as Stripe hands it over and as a panel has to show it.
 *
 * Stripe counts in the currency's smallest unit, which is cents for most
 * currencies and the whole unit for a handful that have no subdivision. Divide
 * a yen amount by a hundred and every figure on the screen is wrong by two
 * orders of magnitude, so the zero-decimal list is not optional trivia.
 *
 * https://docs.stripe.com/currencies#zero-decimal
 */

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Currencies charged in hundredths but *reported* in thousandths. */
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function minorUnitsPerMajor(currency: string): number {
  const code = currency.toLowerCase();
  if (ZERO_DECIMAL.has(code)) return 1;
  if (THREE_DECIMAL.has(code)) return 1000;
  return 100;
}

/** Stripe's integer amount as a real number of pounds, euros or yen. */
export function toMajorUnits(minor: number, currency: string): number {
  return minor / minorUnitsPerMajor(currency);
}

const SYMBOLS: Record<string, string> = {
  eur: "€", usd: "$", gbp: "£", jpy: "¥", chf: "CHF", cad: "CA$", aud: "A$",
  nzd: "NZ$", sek: "kr", nok: "kr", dkk: "kr", pln: "zł", czk: "Kč", huf: "Ft",
  try: "₺", inr: "₹", brl: "R$", mxn: "MX$", zar: "R", sgd: "S$", hkd: "HK$",
  krw: "₩", cny: "¥", ils: "₪", aed: "AED", rub: "₽",
};

export function symbolFor(currency: string): string {
  return SYMBOLS[currency.toLowerCase()] ?? currency.toUpperCase();
}

/**
 * A figure sized for the box it goes in.
 *
 * A panel is 800 pixels wide and a number set at 76px runs out of room at
 * about six characters, so 74120 has to become 74.1k before it is drawn rather
 * than after it has already overflowed. `compact` is the widget's choice, not
 * ours: a full-screen ledger has room for every digit and should show them.
 */
export interface MoneyText {
  /** "3,184" or "74.1k" - no symbol, so a template can place it. */
  figure: string;
  /** "€3,184" - the whole thing, for a caption or a row. */
  text: string;
  symbol: string;
  /** The plain number, for arithmetic and for facts a check compares. */
  amount: number;
}

/** How many decimal places a currency is written with. Two, except when not. */
export function decimalsOf(currency: string): number {
  return Math.round(Math.log10(minorUnitsPerMajor(currency)));
}

export function formatMoney(
  amount: number,
  currency: string,
  locale: string,
  options: { compact?: boolean; decimals?: boolean } = {},
): MoneyText {
  const symbol = symbolFor(currency);
  const rounded = options.decimals ? amount : Math.round(amount);

  /*
   * Asked for decimals, a figure gets the currency's own - all of them, and
   * exactly them.
   *
   * An aggregate has no pennies worth showing and rounds; a single payment
   * does, and "24.5" is not a price anybody has ever written. A minimum as
   * well as a maximum is what puts the trailing zero back, and taking both
   * from the currency is what keeps a yen figure whole and a dinar's three
   * places intact.
   */
  const places = decimalsOf(currency);

  const figure = options.compact
    ? new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: Math.abs(rounded) >= 10_000 ? 1 : 0,
      }).format(rounded)
    : new Intl.NumberFormat(locale, {
        minimumFractionDigits: options.decimals ? places : 0,
        maximumFractionDigits: options.decimals ? places : 0,
      }).format(rounded);

  return { figure, text: `${symbol}${figure}`, symbol, amount: rounded };
}

/** Percentage change, guarding the case that makes it meaningless. */
export function changePercent(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}
