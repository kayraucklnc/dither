import { Liquid } from "liquidjs";

import { templateFor, type Extension } from "@/lib/extensions/registry";
import { shape } from "@/lib/shapes";

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

/** The larger of two numbers, so a chart can find its own scale in Liquid. */

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
  /** The shape actually being drawn, which may differ from the one authored. */
  shape?: string;
}

export async function renderTemplate(template: string, context: RenderContext): Promise<string> {
  const environment = context.environment ?? DEFAULT_ENVIRONMENT;
  const box = context.shape ? shape(context.shape) : undefined;

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
    },
    /**
     * The box this template is actually drawing into.
     *
     * A design authored for a wide band may be asked to fill a taller one, and
     * knowing which lets it show a fifth departure or an hourly strip instead
     * of leaving the extra room empty. Columns and rows are out of six.
     */
    shape: box
      ? { id: box.id, label: box.label, columns: box.columns, rows: box.rows }
      : { id: "full", label: "Full screen", columns: 6, rows: 6 },
    extension: {
      name: context.extension.name,
      label: context.extension.manifest.label,
      values: context.settings,
    },
  };

  return fragment(await engineFor(environment).parseAndRender(template, scope));
}

/** Render a widget at a shape, or say why it cannot be rendered at that shape. */
export async function renderWidget(
  extension: Extension,
  shape: string,
  settings: Record<string, unknown>,
  data: Record<string, unknown>,
  notices: { icon: string; text: string; level: string }[] = [],
  environment: Environment = DEFAULT_ENVIRONMENT,
): Promise<{ html: string } | { problem: string }> {
  const template = templateFor(extension, shape);

  if (!template) {
    // Refusing is the point. Scaling a full-screen design into a corner is
    // how a display ends up with six-point type nobody can read.
    return {
      problem:
        `${extension.manifest.label} has no ${shape.replace(/_/g, " ")} design. ` +
        `It can be placed as: ${extension.shapes.map((s) => s.replace(/_/g, " ")).join(", ")}.`,
    };
  }

  try {
    return {
      html: await renderTemplate(template, {
        extension,
        settings,
        data,
        notices,
        environment,
        shape,
      }),
    };
  } catch (error) {
    return { problem: `${extension.manifest.label} failed to render: ${error}` };
  }
}
