// Asset bytes in the browser: Vite hands every file a URL, fetched on demand.

import { AssetLibrary } from "./library";

const urls = import.meta.glob(["./fonts/*.dfnt", "./icons/*.pack"], {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

async function load(path: string): Promise<Uint8Array> {
  const url = urls[`./${path}`];
  if (!url) throw new Error(`No such asset: ${path}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${path}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export const library = new AssetLibrary(load);
