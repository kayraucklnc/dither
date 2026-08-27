import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import {
  chooseDesign,
  designsFor,
  largestDrawable,
  presetDesign,
  supportsSize as sizeIsDrawable,
  type Design,
} from "@/lib/designs";
import { PRESETS, type Size } from "@/lib/shapes";
import { manifestSchema, type Manifest } from "./manifest";

/**
 * The catalogue of extensions, read from disk.
 *
 * Extensions are code, so this is the only place they come from. Nothing here
 * writes; there is no create, no update, no delete. Adding an extension means
 * adding a directory to the repository, which is what the user asked for and
 * what the previous version got wrong by offering a "new extension" button.
 */

export interface ExtensionProblem {
  extension: string;
  message: string;
}

export interface Extension {
  manifest: Manifest;
  /** Directory name, and the value stored on a widget. */
  name: string;
  directory: string;
  /**
   * The looks it offers, each with the range of sizes it draws. Assembled from
   * the templates on disk plus whatever the manifest declares about them.
   */
  designs: Design[];
  /** Template source per design key, already read. */
  templates: Record<string, string>;
  /**
   * A short hash of the manifest and every template.
   *
   * Rendered images are cached by the things that can change the picture, and
   * the design is one of those things. Without this, editing a template leaves
   * every cached render stale and the change simply does not appear.
   */
  digest: string;
  problems: string[];
}

const EXTENSIONS_DIR =
  process.env.DITHER_EXTENSIONS_DIR ?? path.join(process.cwd(), "..", "extensions");

const MANIFEST_FILE = "configuration.yml";
const FULL_TEMPLATE = "template.html.liquid";
const TEMPLATE_SUFFIX = ".html.liquid";

let cache: Map<string, Extension> | undefined;
let problems: ExtensionProblem[] = [];

async function readTemplates(directory: string) {
  const templates: Record<string, string> = {};

  // A root template.html.liquid is the design key `full`.
  try {
    templates.full = await readFile(path.join(directory, FULL_TEMPLATE), "utf8");
  } catch {
    // Not every extension offers a full-screen design, and that is allowed.
  }

  let entries: string[] = [];
  try {
    entries = await readdir(path.join(directory, "templates"));
  } catch {
    return templates;
  }

  for (const entry of entries) {
    if (!entry.endsWith(TEMPLATE_SUFFIX)) continue;
    templates[entry.slice(0, -TEMPLATE_SUFFIX.length)] = await readFile(
      path.join(directory, "templates", entry),
      "utf8",
    );
  }

  return templates;
}

/**
 * Turning templates on disk into designs.
 *
 * A template earns a size range one of two ways: the manifest declares one for
 * it, or its filename is one of the original shape names and it inherits that
 * shape's range. A template that is neither is reported rather than ignored,
 * because a typo that silently drops a design is the kind of bug that wastes
 * an afternoon.
 *
 * A declaration for a template that does not exist is reported too, and for
 * the same reason in reverse.
 */
function assemble(manifest: Manifest, templates: Record<string, string>) {
  const designs: Design[] = [];
  const complaints: string[] = [];
  const declared = new Map(manifest.designs.map((design) => [design.template, design]));

  for (const [key, declaration] of declared) {
    if (key in templates) continue;
    complaints.push(
      `designs declares "${key}" but there is no templates/${key}${TEMPLATE_SUFFIX}` +
        (key === "full" ? ` or ${FULL_TEMPLATE}` : "") +
        `, so "${declaration.label}" was not loaded.`,
    );
  }

  for (const key of Object.keys(templates).sort()) {
    const declaration = declared.get(key);

    if (declaration) {
      const nominal = declaration.nominal ?? [
        Math.round((declaration.columns[0] + declaration.columns[1]) / 2),
        Math.round((declaration.rows[0] + declaration.rows[1]) / 2),
      ];

      designs.push({
        key,
        label: declaration.label,
        hint: declaration.hint,
        range: {
          minColumns: Math.min(...declaration.columns),
          maxColumns: Math.max(...declaration.columns),
          minRows: Math.min(...declaration.rows),
          maxRows: Math.max(...declaration.rows),
        },
        nominal: { columns: nominal[0], rows: nominal[1] },
        declared: true,
      });
      continue;
    }

    const fallback = presetDesign(key);
    if (fallback) {
      designs.push(fallback);
      continue;
    }

    complaints.push(
      `templates/${key}${TEMPLATE_SUFFIX} is not one of the original shape names and no ` +
        `designs entry gives it a size range, so it was not loaded.`,
    );
  }

  return { designs, complaints };
}

async function load(): Promise<Map<string, Extension>> {
  const loaded = new Map<string, Extension>();
  problems = [];

  let entries: Dirent[] = [];
  try {
    entries = await readdir(EXTENSIONS_DIR, { withFileTypes: true });
  } catch {
    problems.push({ extension: "*", message: `No extensions directory at ${EXTENSIONS_DIR}.` });
    return loaded;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const directory = path.join(EXTENSIONS_DIR, entry.name);
    let raw: unknown;

    try {
      raw = parseYaml(await readFile(path.join(directory, MANIFEST_FILE), "utf8"));
    } catch (error) {
      problems.push({ extension: entry.name, message: `Cannot read ${MANIFEST_FILE}: ${error}` });
      continue;
    }

    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push({
        extension: entry.name,
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      continue;
    }

    const templates = await readTemplates(directory);
    const { designs, complaints } = assemble(parsed.data, templates);

    const extensionProblems = [...complaints];
    if (!designs.length && !parsed.data.facts.length) {
      extensionProblems.push("No designs and no facts, so it can neither be shown nor decided on.");
    }
    extensionProblems.forEach((message) => problems.push({ extension: entry.name, message }));

    const digest = createHash("sha256")
      .update(JSON.stringify(parsed.data))
      .update(Object.entries(templates).sort().map(([key, source]) => key + source).join(""))
      .digest("hex")
      .slice(0, 12);

    loaded.set(parsed.data.name, {
      manifest: parsed.data,
      digest,
      name: parsed.data.name,
      directory,
      designs,
      templates,
      problems: extensionProblems,
    });
  }

  return loaded;
}

/** In development the directory is re-read every time, so edits show up. */
export async function all(): Promise<Extension[]> {
  if (!cache || process.env.NODE_ENV !== "production") cache = await load();
  return [...cache.values()].sort((a, b) => a.manifest.label.localeCompare(b.manifest.label));
}

export async function find(name: string): Promise<Extension | undefined> {
  if (!cache || process.env.NODE_ENV !== "production") cache = await load();
  return cache.get(name);
}

export async function loadProblems(): Promise<ExtensionProblem[]> {
  if (!cache || process.env.NODE_ENV !== "production") cache = await load();
  return problems;
}

/** The defaults a new widget starts with, straight from the manifest. */
export function defaultSettings(extension: Extension): Record<string, unknown> {
  return Object.fromEntries(
    extension.manifest.fields.map((field) => [
      field.keyname,
      // A field holding several answers defaults to a list, empty or not. An
      // empty string here would reach a provider as one nameless selection.
      field.field_type === "multiselect"
        ? Array.isArray(field.default)
          ? field.default
          : field.default === undefined || field.default === ""
            ? []
            : [field.default]
        : (field.default ?? ""),
    ]),
  );
}

/** Whether this extension will draw itself at this size at all. */
export function supportsSize(extension: Extension, size: Size): boolean {
  return sizeIsDrawable(extension.designs, size);
}

/** The looks available at a size, least strained first. Empty means refused. */
export function stylesAt(extension: Extension, size: Size): Design[] {
  return designsFor(extension.designs, size);
}

/** The design that will actually draw this widget. */
export function designAt(extension: Extension, size: Size, wanted?: string): Design | undefined {
  return chooseDesign(extension.designs, size, wanted);
}

/** The template that should draw a size, honouring the style asked for. */
export function templateFor(
  extension: Extension,
  size: Size,
  wanted?: string,
): { design: Design; source: string } | undefined {
  const design = designAt(extension, size, wanted);
  if (!design) return undefined;

  const source = extension.templates[design.key];
  return source === undefined ? undefined : { design, source };
}

/**
 * The biggest size it can draw, for a catalogue thumbnail.
 *
 * Cards show the largest design, because a corner design shrunk into a card is
 * unreadable and tells you nothing about the extension.
 */
export function headlineSize(extension: Extension): Size {
  return largestDrawable(extension.designs) ?? { columns: 12, rows: 12 };
}

/** The named sizes this extension can be drawn at, for pickers and catalogues. */
export function presetsFor(extension: Extension): string[] {
  return PRESETS.filter((entry) => supportsSize(extension, entry)).map((entry) => entry.id);
}

/**
 * Whether the design that draws this size has somewhere to put a notice.
 *
 * `accepts_notices` on the manifest is the author's intent; this is whether
 * the template that will actually run renders them. The two can differ,
 * because a size may be drawn by a design authored for a different one, and
 * because an author can forget the block. What matters to a screen is the
 * second one.
 */
export function rendersNotices(extension: Extension, size: Size, wanted?: string): boolean {
  if (!extension.manifest.accepts_notices) return false;

  const chosen = templateFor(extension, size, wanted);
  return chosen !== undefined && /\bnotices\b/.test(chosen.source);
}
