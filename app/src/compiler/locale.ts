// Day and month names for the panel, in the project's language, from Intl.

import type { Locale } from "@/runtime/types";

function names(language: string, options: Intl.DateTimeFormatOptions, dates: Date[]): string[] {
  const f = new Intl.DateTimeFormat(language, { ...options, timeZone: "UTC" });
  return dates.map((d) => f.format(d));
}

export function localeFor(language: string): Locale {
  // 2023-01-01 was a Sunday.
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)));
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2023, i, 15)));
  return {
    days: names(language, { weekday: "long" }, days),
    daysShort: names(language, { weekday: "short" }, days),
    months: names(language, { month: "long" }, months),
    monthsShort: names(language, { month: "short" }, months),
  };
}

export const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Nederlands" },
  { value: "pt", label: "Português" },
];
