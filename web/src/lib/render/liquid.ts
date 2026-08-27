import { Liquid } from "liquidjs";

import type { Extension } from "@/lib/extensions/registry";

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

const engine = new Liquid({
  cache: process.env.NODE_ENV === "production",
  strictFilters: false,
  // A missing value renders empty rather than throwing. A template that
  // half-renders while a provider is down beats a screen that goes blank.
  strictVariables: false,
  jsTruthy: true,
});

// `date: "%s"` and friends: Liquid's strftime is already supported, but the
// Ruby templates lean on "now" as a date input, which liquidjs spells the same.

const DOCUMENT = /<body[^>]*>([\s\S]*)<\/body>/i;

/** Unwrap a full document, in case a template renders one. */
function fragment(html: string): string {
  return DOCUMENT.exec(html)?.[1] ?? html;
}

export interface RenderContext {
  extension: Extension;
  settings: Record<string, unknown>;
  data: Record<string, unknown>;
}

export async function renderTemplate(template: string, context: RenderContext): Promise<string> {
  const scope = {
    ...context.data,
    extension: {
      name: context.extension.name,
      label: context.extension.manifest.label,
      values: context.settings,
    },
  };

  return fragment(await engine.parseAndRender(template, scope));
}

/** Render a widget at a shape, or say why it cannot be rendered at that shape. */
export async function renderWidget(
  extension: Extension,
  shape: string,
  settings: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<{ html: string } | { problem: string }> {
  const template = extension.templates[shape];

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
    return { html: await renderTemplate(template, { extension, settings, data }) };
  } catch (error) {
    return { problem: `${extension.manifest.label} failed to render: ${error}` };
  }
}
