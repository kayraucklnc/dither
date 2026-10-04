// Where a project lives between visits: the browser (always, automatically)
// and a file (when asked). The panel holds a third copy; see device/.

import { extensionFor } from "@/compiler/widgets";
import { parseProject, type Project, type Widget } from "@/project/schema";

const KEY = "dither.project.v1";

export function loadLocal(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseProject(JSON.parse(raw)) : null;
  } catch {
    return null; // A broken or foreign entry is the same as none: start fresh.
  }
}

export function saveLocal(project: Project): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
    return true;
  } catch {
    return false; // Full or blocked storage; the file and the panel still work.
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

function blankSecrets(w: Widget): Widget {
  const keys = (extensionFor(w.type)?.fields ?? []).filter((f) => f.kind === "secret" && f.key in w.settings).map((f) => f.key);
  return keys.length ? { ...w, settings: { ...w.settings, ...Object.fromEntries(keys.map((k) => [k, ""])) } } : w;
}

/** The project with Wi-Fi passwords, linked accounts and every secret widget setting blanked. */
export function withoutSecrets(project: Project): Project {
  return {
    ...project,
    wifi: project.wifi.map((n) => ({ ...n, password: "" })),
    // A linked account is a client secret and a refresh token: it goes whole or not at all.
    accounts: { google: null, stripe: null },
    screens: project.screens.map((s) => ({ ...s, widgets: s.widgets.map(blankSecrets) })),
  };
}

/** The project without the pictures no widget uses any more. The same object when nothing is dropped. */
export function pruneImages(project: Project): Project {
  const used = new Set<string>();
  for (const s of project.screens) {
    for (const w of s.widgets) for (const v of Object.values(w.settings)) if (typeof v === "string") used.add(v);
  }
  const ids = Object.keys(project.images);
  if (ids.every((id) => used.has(id))) return project;
  return { ...project, images: Object.fromEntries(ids.filter((id) => used.has(id)).map((id) => [id, project.images[id]])) };
}

/** The project as a file, secrets left out unless asked for. */
export function projectFile(project: Project, includeSecrets: boolean): Blob {
  const pruned = pruneImages(project);
  const copy = includeSecrets ? pruned : withoutSecrets(pruned);
  return new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" });
}

export function fileName(project: Project): string {
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "panel";
  return `${slug}.dither.json`;
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readProjectFile(file: File): Promise<Project> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not a Dither project file.`);
  }
  return parseProject(json);
}

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Unpack gzip, stopping with a RangeError once the output passes `maxBytes`. */
export async function gunzip(bytes: Uint8Array, maxBytes = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError(`Unpacks to more than ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
