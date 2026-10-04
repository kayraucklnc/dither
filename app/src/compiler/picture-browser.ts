// Project pictures, drawn to exactly the widget's box and dithered.

import type { PictureOptions } from "@/extensions/api";
import { encodeBitmap } from "@/runtime/assets";
import { adjust, dither } from "./dither";

const decoded = new Map<string, Promise<ImageBitmap>>();

function bitmapOf(dataUrl: string): Promise<ImageBitmap> {
  let hit = decoded.get(dataUrl);
  if (!hit) {
    hit = fetch(dataUrl).then((r) => r.blob()).then((b) => createImageBitmap(b));
    decoded.set(dataUrl, hit);
  }
  return hit;
}

export function browserPicture(images: Readonly<Record<string, string>>) {
  return async (imageId: string, w: number, h: number, o: PictureOptions): Promise<Uint8Array | null> => {
    const src = images[imageId];
    if (!src || w <= 0 || h <= 0) return null;
    const img = await bitmapOf(src);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    const scale = o.fit === "contain" ? Math.min(w / img.width, h / img.height) : Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const grey = new Float32Array(w * h);
    for (let i = 0; i < grey.length; i++) grey[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    adjust(grey, o.brightness ?? 0, o.contrast ?? 0);
    const ink = dither(grey, w, h, o.dither ?? "floyd");
    return encodeBitmap(w, h, true, (x, y) => ink[y * w + x] === 1);
  };
}

/** A picture the user chose, shrunk to something worth keeping in a project. */
export async function importPicture(file: File, maxSide = 800): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot read pictures.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
