import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import { isShapeId, SHAPES, standIn, type ShapeId } from "@/lib/shapes";
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
   * Sizes this extension can be drawn at: the ones it authored, plus the rest
   * of each family it authored into. See `standIn` in lib/shapes.
   */
  shapes: ShapeId[];
  /** Sizes it has a template of its own for. */
  authored: ShapeId[];
  /** Template source per shape, already read. */
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
  const unknown: string[] = [];

  // A root template.html.liquid is the full-screen design.
  try {
    templates.full = await readFile(path.join(directory, FULL_TEMPLATE), "utf8");
  } catch {
    // Not every extension offers a full-screen design, and that is allowed.
  }

  let entries: string[] = [];
  try {
    entries = await readdir(path.join(directory, "templates"));
  } catch {
    return { templates, unknown };
  }

  for (const entry of entries) {
    if (!entry.endsWith(TEMPLATE_SUFFIX)) continue;

    const shape = entry.slice(0, -TEMPLATE_SUFFIX.length);

    // An unrecognised name is reported rather than ignored: a typo that
    // silently drops a design is the kind of bug that wastes an afternoon.
    if (!isShapeId(shape)) {
      unknown.push(entry);
      continue;
    }

    templates[shape] = await readFile(path.join(directory, "templates", entry), "utf8");
  }

  return { templates, unknown };
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

    const { templates, unknown } = await readTemplates(directory);
    const authored = (Object.keys(templates) as ShapeId[]).filter(isShapeId);
    const shapes = SHAPES.map((shape) => shape.id).filter(
      (shape) => standIn(shape, authored) !== undefined,
    );

    const extensionProblems = unknown.map(
      (file) => `templates/${file} is not a shape Dither knows; it was not loaded.`,
    );
    if (!authored.length && !parsed.data.facts.length) {
      extensionProblems.push("No templates and no facts, so it can neither be shown nor decided on.");
    }
    extensionProblems.forEach((message) => problems.push({ extension: entry.name, message }));

    const digest = createHash("sha256")
      .update(JSON.stringify(parsed.data))
      .update(Object.entries(templates).sort().map(([shape, source]) => shape + source).join(""))
      .digest("hex")
      .slice(0, 12);

    loaded.set(parsed.data.name, {
      manifest: parsed.data,
      digest,
      name: parsed.data.name,
      directory,
      shapes,
      authored,
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
    extension.manifest.fields.map((field) => [field.keyname, field.default ?? ""]),
  );
}

export function supportsShape(extension: Extension, shape: string): boolean {
  return extension.shapes.includes(shape as ShapeId);
}

/** The template that should draw `shape`, exact or the nearest in its family. */
export function templateFor(extension: Extension, shape: string): string | undefined {
  const chosen = standIn(shape as ShapeId, extension.authored);
  return chosen ? extension.templates[chosen] : undefined;
}
