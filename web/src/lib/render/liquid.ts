import { Liquid } from "liquidjs";

import { refusal } from "@/lib/designs";
import { DEFAULT_LOOK, prepareById } from "@/lib/gallery/prepare";
import { isScreen, type Screen } from "@/lib/gallery/screen";
import { daysInWords, partOfDay, spanInWords, throughDay, timeInWords } from "@/lib/timewords";
import { templateFor, type Extension } from "@/lib/extensions/registry";
import { COLUMNS, ROWS, sizeLabel, type Size } from "@/lib/shapes";

/**
 * Extension templates are Liquid, the same dialect TRMNL uses, so designs
 * written for that ecosystem keep working and anything written here stays
 * portable.
 *
 * The context a template sees:
 *
 *   extension.values.<field>   what the widget was configured with
 *   extension.label            the extension's name, for headings
 *   source_1, source_2, ...    whatever each declared exchange answered
 *   <anything a provider adds> e.g. `departures` for transit
 */

/**
 * One engine per locale and offset.
 *
 * The date filter needs both, and they come from installation settings rather
 * than from the server's own environment - a box running in Istanbul should
 * not put Turkish month names on a panel in Milan. Engines are cached because
 * building one parses nothing but registering the filters is not free.
 */
const engines = new Map<string, Liquid>();

/**
 * What a panel does when nobody has said otherwise, in seconds.
 *
 * Shared by the previews, which have no device to ask, so a design tuned
 * against a thumbnail is tuned against the case it will actually meet.
 */
export const DEFAULT_REFRESH_SECONDS = 900;

export interface Environment {
  locale: string;
  timezone: string;
  timezoneOffset: number;
}

export const DEFAULT_ENVIRONMENT: Environment = {
  locale: "en-GB",
  timezone: "UTC",
  timezoneOffset: 0,
};

function engineFor(environment: Environment): Liquid {
  const key = `${environment.locale}|${environment.timezoneOffset}`;
  const existing = engines.get(key);
  if (existing) return existing;

  const built = new Liquid({
    cache: process.env.NODE_ENV === "production",
    strictFilters: false,
    // A missing value renders empty rather than throwing. A template that
    // half-renders while a provider is down beats a screen that goes blank.
    strictVariables: false,
    jsTruthy: true,
    locale: environment.locale,
    // Liquid counts minutes *west* of UTC, the way Date.getTimezoneOffset does.
    // Environment.timezoneOffset counts minutes east, which is how anyone
    // reading "UTC+2" thinks about it, so it is negated here rather than
    // stored backwards everywhere else.
    timezoneOffset: -environment.timezoneOffset,
  });

  register(built);
  engines.set(key, built);

  return built;
}

/**
 * Filters an extension author would otherwise write by hand in every template.
 *
 * These exist so a weather design is a layout problem rather than a hundred
 * lines of `{% case %}` mapping WMO codes to words.
 */

// WMO weather codes, the vocabulary Open-Meteo and most free forecast APIs use.
const WEATHER: Record<number, { icon: string; label: string; short: string }> = {
  0: { icon: "sun", label: "Clear", short: "Clear" },
  1: { icon: "cloud-sun", label: "Mainly clear", short: "Mostly clear" },
  2: { icon: "cloud-sun", label: "Partly cloudy", short: "Partly cloudy" },
  3: { icon: "cloud", label: "Overcast", short: "Overcast" },
  45: { icon: "fog", label: "Fog", short: "Fog" },
  48: { icon: "fog", label: "Freezing fog", short: "Fog" },
  51: { icon: "drizzle", label: "Light drizzle", short: "Drizzle" },
  53: { icon: "drizzle", label: "Drizzle", short: "Drizzle" },
  55: { icon: "drizzle", label: "Heavy drizzle", short: "Drizzle" },
  56: { icon: "drizzle", label: "Freezing drizzle", short: "Drizzle" },
  57: { icon: "drizzle", label: "Freezing drizzle", short: "Drizzle" },
  61: { icon: "rain", label: "Light rain", short: "Rain" },
  63: { icon: "rain", label: "Rain", short: "Rain" },
  65: { icon: "rain", label: "Heavy rain", short: "Heavy rain" },
  66: { icon: "rain", label: "Freezing rain", short: "Rain" },
  67: { icon: "rain", label: "Freezing rain", short: "Rain" },
  71: { icon: "snow", label: "Light snow", short: "Snow" },
  73: { icon: "snow", label: "Snow", short: "Snow" },
  75: { icon: "snow", label: "Heavy snow", short: "Heavy snow" },
  77: { icon: "snow", label: "Snow grains", short: "Snow" },
  80: { icon: "showers", label: "Light showers", short: "Showers" },
  81: { icon: "showers", label: "Showers", short: "Showers" },
  82: { icon: "showers", label: "Heavy showers", short: "Showers" },
  85: { icon: "snow", label: "Snow showers", short: "Snow" },
  86: { icon: "snow", label: "Heavy snow showers", short: "Snow" },
  95: { icon: "thunder", label: "Thunderstorm", short: "Storm" },
  96: { icon: "thunder", label: "Thunderstorm with hail", short: "Storm" },
  99: { icon: "thunder", label: "Thunderstorm with hail", short: "Storm" },
};

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];


/** "in 24 min", "in 2h 10m", "now". */

/** Just the hour of an ISO timestamp or "HH:MM", for compact strips. */

/** "HH:MM" out of an ISO timestamp, for sunrise, sunset and departure times. */

/** Clamp a number into a 0-100 percentage, for bars that must not overflow. */

/** The larger, and the smaller, of two numbers - for type that fits its box. */

function register(engine: Liquid): void {
  engine.registerFilter("weather_icon", (code: unknown) => WEATHER[Number(code)]?.icon ?? "cloud");
  engine.registerFilter("weather_label", (code: unknown) => WEATHER[Number(code)]?.label ?? "—");
  engine.registerFilter("weather_short", (code: unknown) => WEATHER[Number(code)]?.short ?? "—");

  /** Compass point from a bearing in degrees. */
  engine.registerFilter("compass", (degrees: unknown) => {
    const value = Number(degrees);
    return Number.isFinite(value) ? COMPASS[Math.round(((value % 360) / 22.5)) % 16] : "";
  });
  engine.registerFilter("in_words", (minutes: unknown) => {
    const value = Number(minutes);
    if (!Number.isFinite(value)) return "";
    if (value <= 0) return "now";
    if (value < 60) return `in ${Math.round(value)} min`;

    const hours = Math.floor(value / 60);
    const rest = Math.round(value % 60);
    return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
  });
  engine.registerFilter("hour_of", (value: unknown) => {
    const match = /(\d{1,2}):(\d{2})/.exec(String(value));
    return match ? `${match[1].padStart(2, "0")}` : String(value);
  });
  engine.registerFilter("clock_of", (value: unknown) => {
    const match = /(\d{1,2}):(\d{2})/.exec(String(value));
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : String(value ?? "");
  });
  engine.registerFilter("as_percent", (value: unknown, max: unknown = 100) => {
    const number = Number(value);
    const ceiling = Number(max) || 100;
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, Math.round((number / ceiling) * 100)));
  });
  engine.registerFilter("at_least", (value: unknown, floor: unknown) =>
    Math.max(Number(value) || 0, Number(floor) || 0),
  );
  /**
   * A ceiling, which `at_least` alone cannot express.
   *
   * Type that sizes itself to its box needs both ends: the floor stops a
   * figure vanishing in a small tile, and this stops it running off the edge
   * of a wide one. Sizes are free now, so every design has to survive a range
   * rather than one box, and clamping in Liquid is how it does that without a
   * template per size.
   */
  engine.registerFilter("at_most", (value: unknown, ceiling: unknown) =>
    Math.min(Number(value) || 0, Number(ceiling) || 0),
  );

  /**
   * Saying the time in a way that survives being on a wall.
   *
   * A panel is redrawn every quarter of an hour at best, so a design that
   * draws the clock is drawing something that has to still be true when the
   * device next wakes. These take minutes since local midnight and the window
   * the drawing has to last - `dither.window_minutes` - and hedge accordingly.
   * See lib/timewords.ts.
   */
  engine.registerFilter("time_in_words", (minutes: unknown, window: unknown = 15) =>
    timeInWords(Number(minutes) || 0, Number(window) || 15),
  );
  engine.registerFilter("part_of_day", (minutes: unknown) => partOfDay(Number(minutes) || 0));
  engine.registerFilter("span_in_words", (minutes: unknown) => spanInWords(Number(minutes) || 0));
  engine.registerFilter("days_in_words", (days: unknown) => daysInWords(Number(days) || 0));
  /** How far through a stretch of the day, as a percentage. For arcs and bars. */
  engine.registerFilter("through_day", (minutes: unknown, start: unknown, end: unknown) =>
    throughDay(Number(minutes) || 0, Number(start) || 0, Number(end) || 0),
  );
  /**
   * Sine and cosine of an angle in degrees, measured the way a clock face is:
   * zero at twelve, increasing clockwise.
   *
   * A template can rotate a shape about a point without any of this, which is
   * how the hands are drawn. What it cannot do is find a *point* on a circle,
   * and that is what a filled wedge needs - two corners and an arc between
   * them. Rather than approximate a slice with a thick stroked arc, which is a
   * ring segment and reads as one, the geometry is offered honestly.
   */
  // Rounded, and never handed back as negative zero: "-0" in the middle of a
  // path is legal and unreadable.
  const place = (value: number) => (Math.round(value * 10_000) / 10_000) || 0;
  const radians = (degrees: unknown) => ((Number(degrees) || 0) - 90) * (Math.PI / 180);

  engine.registerFilter("sin_of", (degrees: unknown) => place(Math.sin(radians(degrees))));
  engine.registerFilter("cos_of", (degrees: unknown) => place(Math.cos(radians(degrees))));
  /** "07:30" as minutes since midnight, so a time setting can be arithmetic. */
  engine.registerFilter("minutes_of", (value: unknown) => {
    const match = /(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  });

  /**
   * A picture from the gallery, cropped to the box asking for it.
   *
   * The only filter here that touches the disk, and the only asynchronous one.
   * It exists because cropping is a decision that cannot be made any earlier:
   * a design covers a range of sizes, and the rectangle worth taking out of a
   * photograph for a 12x12 wallpaper is not the one worth taking for a 2x12
   * strip. The template is the first thing that knows which it is.
   *
   * What comes back is a data URI. A screenshotted page has no origin, so a
   * URL - even our own - has nothing to resolve against; the same reason the
   * brand mark is inlined into the empty panel.
   *
   *   {{ shot.id | as_image: width: shape.width, height: shape.height,
   *                             contrast: 40, screen: "halftone" }}
   *
   * `width` and `height` are not optional in spirit even though they default:
   * a chosen screen comes back already reduced to the panel's two values, and
   * that only survives if the design places it one pixel for one. Ask for a
   * size other than the box and the browser resamples the marks back into
   * greys for the page dither to find, which is the moire this avoids.
   *
   * An id that no longer resolves renders as empty, which templates test for.
   * A missing folder should leave a gap in a gallery, not take a screen down.
   */
  engine.registerFilter("as_image", async (id: unknown, ...args: unknown[]) => {
    const wanted = String(id ?? "").trim();
    if (!wanted) return "";

    // liquidjs hands keyword arguments over as [key, value] pairs and
    // positional ones as bare values, so both spellings are accepted: the
    // keyword form because five positional arguments is a puzzle, and
    // `width, height` because that is all most calls need.
    const named: Record<string, unknown> = {};
    const loose: unknown[] = [];

    for (const argument of args) {
      if (Array.isArray(argument) && argument.length === 2 && typeof argument[0] === "string") {
        named[argument[0]] = argument[1];
      } else {
        loose.push(argument);
      }
    }

    const prepared = await prepareById(wanted, {
      ...DEFAULT_LOOK,
      width: Number(named.width ?? loose[0] ?? 0) || 0,
      height: Number(named.height ?? loose[1] ?? 0) || 0,
      fit: named.fit === "whole" ? "whole" : "fill",
      turn: Number(named.turn ?? 0) || 0,
      focus: String(named.focus ?? "auto"),
      brightness: Number(named.brightness ?? 0) || 0,
      contrast: Number(named.contrast ?? 0) || 0,
      screen: isScreen(String(named.screen)) ? (String(named.screen) as Screen) : "panel",
      marks: Number(named.marks ?? 0) || DEFAULT_LOOK.marks,
      invert: named.invert === true || named.invert === "true",
    });

    return prepared?.source ?? "";
  });
}

const DOCUMENT = /<body[^>]*>([\s\S]*)<\/body>/i;

/** Unwrap a full document, in case a template renders one. */
function fragment(html: string): string {
  return DOCUMENT.exec(html)?.[1] ?? html;
}

export interface RenderContext {
  extension: Extension;
  settings: Record<string, unknown>;
  data: Record<string, unknown>;
  /** Things another extension wants said here. Empty unless this widget hosts them. */
  notices?: { icon: string; text: string; level: string }[];
  environment?: Environment;
  /** The box being drawn into, in grid cells. */
  size?: Size;
  /** Pixel size of that box, when the caller knows the panel. */
  pixels?: { width: number; height: number };
  /** The design doing the drawing, which may not be the one authored for this size. */
  design?: { key: string; label: string };
  /**
   * How long this picture has to last, in seconds - the device's own refresh
   * rate. A design that draws the clock needs it to know how much it may
   * honestly claim; everything else can ignore it.
   */
  refreshSeconds?: number;
}

export async function renderTemplate(template: string, context: RenderContext): Promise<string> {
  const environment = context.environment ?? DEFAULT_ENVIRONMENT;
  const box = context.size ?? { columns: COLUMNS, rows: ROWS };
  // A quarter of an hour is what a panel does unless it is told otherwise, and
  // a preview has no device to ask - so it previews the common case.
  const refresh = context.refreshSeconds ?? DEFAULT_REFRESH_SECONDS;

  const scope = {
    ...context.data,
    notices: context.notices ?? [],
    // Installation-wide facts a template may want without being configured
    // for them twice - the clock's offset, most obviously.
    dither: {
      locale: environment.locale,
      timezone: environment.timezone,
      offset_hours: Math.round(environment.timezoneOffset / 60),
      offset_seconds: environment.timezoneOffset * 60,
      /**
       * How long this drawing has to survive before the device wakes again.
       *
       * The panel is painted once and then left alone, so anything drawn from
       * the clock is a claim about the *next* quarter of an hour rather than
       * about this instant. A design that draws the time reads this and hedges
       * by it - which is the difference between a clock that is wrong for
       * fourteen minutes in every fifteen and one that is never wrong at all.
       */
      refresh_seconds: refresh,
      window_minutes: Math.max(1, Math.round(refresh / 60)),
    },
    /**
     * The box this template is actually drawing into.
     *
     * Sizes are free now, so a design covers a *range* and has to cope with
     * every size in it: knowing the box lets a wide band show a fifth
     * departure when it is tall enough instead of leaving the room empty.
     *
     * Columns and rows are out of twelve. `wide`, `tall`, `band` and `roomy`
     * exist because a template asking "am I full width" should say so rather
     * than hard-coding a number that changes when the grid does.
     */
    shape: {
      id: context.design?.key ?? "full",
      label: context.design?.label ?? sizeLabel(box),
      columns: box.columns,
      rows: box.rows,
      max_columns: COLUMNS,
      max_rows: ROWS,
      width: context.pixels?.width ?? 0,
      height: context.pixels?.height ?? 0,
      wide: box.columns >= COLUMNS * 0.66,
      tall: box.rows >= ROWS * 0.66,
      band: box.columns >= COLUMNS * 0.66 && box.rows <= ROWS * 0.42,
      roomy: box.columns * box.rows >= COLUMNS * ROWS * 0.4,
    },
    extension: {
      name: context.extension.name,
      label: context.extension.manifest.label,
      values: context.settings,
    },
  };

  return fragment(await engineFor(environment).parseAndRender(template, scope));
}

export interface WidgetRender {
  extension: Extension;
  size: Size;
  settings: Record<string, unknown>;
  data: Record<string, unknown>;
  /** The style asked for. Ignored when it cannot draw this size. */
  style?: string;
  notices?: { icon: string; text: string; level: string }[];
  environment?: Environment;
  pixels?: { width: number; height: number };
  /** How long the picture has to last. See RenderContext. */
  refreshSeconds?: number;
}

/** Render a widget at a size, or say why that size cannot be drawn. */
export async function renderWidget(
  request: WidgetRender,
): Promise<{ html: string; design: string } | { problem: string }> {
  const { extension, size, settings, data } = request;
  const chosen = templateFor(extension, size, request.style);

  if (!chosen) {
    // Refusing is the point. Scaling a full-screen design into a corner is
    // how a display ends up with six-point type nobody can read.
    return { problem: refusal(extension.manifest.label, size, extension.designs) };
  }

  try {
    return {
      design: chosen.design.key,
      html: await renderTemplate(chosen.source, {
        extension,
        settings,
        data,
        notices: request.notices ?? [],
        environment: request.environment ?? DEFAULT_ENVIRONMENT,
        size,
        pixels: request.pixels,
        design: chosen.design,
        refreshSeconds: request.refreshSeconds,
      }),
    };
  } catch (error) {
    return { problem: `${extension.manifest.label} failed to render: ${error}` };
  }
}
