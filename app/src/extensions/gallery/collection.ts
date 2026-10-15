// Pictures that ship with the app: public-domain prints, already cut to the
// panel and levelled for dithering by tools/gallery/build.py. A project names
// one as `gallery:<id>` and never carries its bytes — the app serves them.

import prints from "./collection.json";

export interface Print {
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Its page on Wikimedia Commons. */
  source: string;
  licence: string;
}

export const COLLECTION: readonly Print[] = prints;

const PREFIX = "gallery:";

export const collectionId = (print: Print): string => `${PREFIX}${print.id}`;

export function isCollected(imageId: string): boolean {
  return imageId.startsWith(PREFIX);
}

/** Image id → where to load it, for every picture in the collection. */
export const COLLECTION_IMAGES: Readonly<Record<string, string>> = Object.fromEntries(
  COLLECTION.map((p) => [collectionId(p), `${import.meta.env.BASE_URL}gallery/${p.id}.jpg`]),
);

export function printOf(imageId: string): Print | undefined {
  return COLLECTION.find((p) => collectionId(p) === imageId);
}
