import { writeFile } from "node:fs/promises";

/**
 * The e-ink icon set.
 *
 * Drawn rather than imported: an icon on a 1-bit panel needs a heavier stroke
 * than a screen icon or the dither eats it, and it needs to be geometric
 * enough to stay legible at 20px. Everything here is a 24x24 box with a 2.4
 * stroke, round joins, no fills that would flatten into a blob.
 *
 * Delivered as CSS masks so an icon takes the ink colour of whatever it sits
 * in, which is what lets the same markup work on an inverted screen.
 */

const S = (body, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;

const CLOUD = "M6.5 18a4.5 4.5 0 0 1-.4-8.98 6 6 0 0 1 11.6 1.48A3.75 3.75 0 0 1 17.5 18Z";

const ICONS = {
  /* Weather ------------------------------------------------------------- */
  sun: S(`<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>`),
  moon: S(`<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>`),
  cloud: S(`<path d="${CLOUD}"/>`),
  "cloud-sun": S(`<circle cx="7.5" cy="6.5" r="2.6"/><path d="M7.5 1.6v1.2M3.2 3.2l.9.9M2 8h1.2M11.8 3.2l-.9.9"/><path d="M9 19a4 4 0 0 1-.3-7.98 5.4 5.4 0 0 1 10.4 1.3A3.4 3.4 0 0 1 18.6 19Z"/>`),
  rain: S(`<path d="${CLOUD}"/><path d="M8.5 20.5 7.5 23M12.5 20.5 11.5 23M16.5 20.5 15.5 23"/>`),
  drizzle: S(`<path d="${CLOUD}"/><path d="M9 20.8v1.4M13 20.8v1.4M17 20.8v1.4"/>`),
  showers: S(`<path d="${CLOUD}"/><path d="M9 20v3M15 20v3M12 20.5v2"/>`),
  snow: S(`<path d="${CLOUD}"/><path d="M9 21h.01M12.5 22.5h.01M16 21h.01M12.5 19.8h.01"/>`),
  thunder: S(`<path d="${CLOUD}"/><path d="m13.5 19-3 4h4l-2.5 4"/>`),
  fog: S(`<path d="${CLOUD}"/><path d="M5 21h5M13 21h6"/>`),
  wind: S(`<path d="M3 8h10a3 3 0 1 0-3-3M3 16h13a3 3 0 1 1-3 3M3 12h16"/>`),
  thermometer: S(`<path d="M14 14.8V4.5a2.5 2.5 0 0 0-5 0v10.3a5 5 0 1 0 5 0Z"/>`),
  umbrella: S(`<path d="M12 3v1M3 13a9 9 0 0 1 18 0Z"/><path d="M12 13v6a2.5 2.5 0 0 0 5 0"/>`),
  sunrise: S(`<path d="M12 3v4M5.6 9.6 4.2 8.2M18.4 9.6l1.4-1.4M3 17h18M6 17a6 6 0 0 1 12 0"/><path d="m8.5 5.5 3.5-3.5 3.5 3.5"/>`),
  sunset: S(`<path d="M12 7V3M5.6 9.6 4.2 8.2M18.4 9.6l1.4-1.4M3 17h18M6 17a6 6 0 0 1 12 0"/><path d="m8.5 3.5 3.5 3.5 3.5-3.5"/>`),
  droplet: S(`<path d="M12 2.5 6.8 9.4a7 7 0 1 0 10.4 0Z"/>`),

  /* Time and calendar --------------------------------------------------- */
  clock: S(`<circle cx="12" cy="12" r="9"/><path d="M12 6.6V12l3.6 2.2"/>`),
  calendar: S(`<rect x="3" y="5" width="18" height="16" rx="2.2"/><path d="M3 10h18M8 3v4M16 3v4"/>`),
  "calendar-check": S(`<rect x="3" y="5" width="18" height="16" rx="2.2"/><path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4"/>`),
  hourglass: S(`<path d="M6.5 3h11M6.5 21h11M7.5 3v3.5L12 12l4.5-5.5V3M7.5 21v-3.5L12 12l4.5 5.5V21"/>`),

  /* Transit -------------------------------------------------------------- */
  train: S(`<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14M8.5 20l-2 2M15.5 20l2 2M7 16.5h.01M17 16.5h.01M9 20h6"/>`),
  bus: S(`<rect x="4" y="3" width="16" height="13" rx="2.4"/><path d="M4 11h16M7.5 19.5v2M16.5 19.5v2M7 16h.01M17 16h.01"/>`),
  tram: S(`<rect x="5" y="4" width="14" height="12" rx="2.4"/><path d="M5 10h14M12 4V1.5M9 20l-1.5 2.5M15 20l1.5 2.5M8 16h8"/>`),
  walk: S(`<circle cx="13" cy="4" r="2"/><path d="M11 21.5 12.5 15l-3-2.5 1-5 3.5 2 2.5 1.5M12.5 15l3 3 .5 3.5M9.5 12.5 7 15"/>`),
  "arrow-right": S(`<path d="M4 12h15M13 6l6 6-6 6"/>`),
  "arrow-up": S(`<path d="M12 20V5M6 11l6-6 6 6"/>`),
  "arrow-down": S(`<path d="M12 4v15M6 13l6 6 6-6"/>`),
  "trending-up": S(`<path d="M3 17.5 9.5 11l4 4L21 7.5"/><path d="M15 7.5h6v6"/>`),
  "trending-down": S(`<path d="M3 6.5 9.5 13l4-4L21 16.5"/><path d="M15 16.5h6v-6"/>`),

  /* Status ---------------------------------------------------------------- */
  alert: S(`<path d="M12 3.5 1.8 20.5h20.4Z"/><path d="M12 9.5v5M12 18h.01"/>`),
  info: S(`<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`),
  check: S(`<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>`),
  close: S(`<path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5"/>`),
  dot: S(`<circle cx="12" cy="12" r="5" fill="black"/>`),
  battery: S(`<rect x="2" y="7" width="17" height="10" rx="2.2"/><path d="M22 10.5v3"/>`),
  wifi: S(`<path d="M2.5 8.5a15 15 0 0 1 19 0M6 12.5a10 10 0 0 1 12 0M9.5 16.5a5 5 0 0 1 5 0M12 20h.01"/>`),
  bolt: S(`<path d="M13.5 2 4 13.5h6.5L10 22l9.5-11.5H13Z"/>`),
  refresh: S(`<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M21 4v5h-5"/>`),

  /* Places and people ------------------------------------------------------ */
  pin: S(`<path d="M12 22s7.5-6.3 7.5-12A7.5 7.5 0 0 0 4.5 10c0 5.7 7.5 12 7.5 12Z"/><circle cx="12" cy="10" r="2.8"/>`),
  video: S(`<rect x="2.5" y="6" width="13" height="12" rx="2.4"/><path d="m15.5 10.5 6-3.5v10l-6-3.5Z"/>`),
  users: S(`<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 5.6M18 14.4a6.5 6.5 0 0 1 3.5 5.6"/>`),
  home: S(`<path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.2V20h13V9.2"/><path d="M10 20v-5.5h4V20"/>`),
  laptop: S(`<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19.5h20"/>`),

  /* Money ------------------------------------------------------------------ */
  currency: S(`<circle cx="12" cy="12" r="9"/><path d="M15 9.2a3.2 3.2 0 0 0-3-1.7c-1.8 0-3 .9-3 2.3 0 3.2 6.2 1.6 6.2 4.8 0 1.5-1.4 2.4-3.2 2.4a3.4 3.4 0 0 1-3.2-1.9M12 5.5v13"/>`),
  card: S(`<rect x="2.5" y="5" width="19" height="14" rx="2.4"/><path d="M2.5 10h19"/>`),
  chart: S(`<path d="M3 21V3M3 21h18"/><path d="M7.5 17v-5M12 17V7M16.5 17v-8"/>`),
  receipt: S(`<path d="M5 2.5v19l2.5-1.6 2.5 1.6 2-1.6 2 1.6 2.5-1.6L19 21.5v-19Z"/><path d="M9 8h6M9 12h6"/>`),
};

const encode = (svg) =>
  svg
    .replace(/\s+/g, " ")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/"/g, "'");

const rules = Object.entries(ICONS)
  .map(([name, svg]) => `  .i-${name} { --i: url("data:image/svg+xml,${encode(svg)}"); }`)
  .join("\n");

const css = `/* Generated by scripts/build-icons.mjs. Edit that, not this. */

/* An icon takes the ink colour of whatever it sits in, so the same markup
   works on an inverted screen. Sized in em so it tracks its neighbouring
   type without a second class. */
.i {
  background: currentColor;
  display: inline-block;
  flex: none;
  height: 1em;
  vertical-align: -0.14em;
  width: 1em;
  -webkit-mask: var(--i) center / contain no-repeat;
  mask: var(--i) center / contain no-repeat;
}

.i-xs { font-size: 14px; }
.i-sm { font-size: 20px; }
.i-md { font-size: 32px; }
.i-lg { font-size: 56px; }
.i-xl { font-size: 88px; }
.i-xxl { font-size: 132px; }

${rules}
`;

await writeFile(new URL("../src/lib/render/icons.css", import.meta.url), css);
console.log(`${Object.keys(ICONS).length} icons written`);
