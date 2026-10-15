import type { Condition } from "@/runtime/types";
import { defineExtension } from "../api";
import { COLLECTION, collectionId } from "./collection";

/** Minutes each picture stays up. Each divides a day, so every day starts again at the first picture. */
const EVERY = [
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "180", label: "Every 3 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "1440", label: "Every day" },
];
const DAY = 1440;

/** The prints a new gallery starts with: dark, graphic, and all of them landscape at heart. */
const STARTERS = ["great-wave", "the-shower", "satan", "bats", "red-fuji", "sleep-of-reason", "raven", "the-demonstration"];

/**
 * When picture `i` of `count` is up, changing every `every` minutes. Within a
 * day, slot k (from midnight) shows picture k mod count; a daily change goes by
 * the day of the month. Picture 0 also stands in while the clock is unknown.
 */
export function shows(i: number, count: number, every: number): Condition | null {
  if (count <= 1) return null;
  if (every >= DAY) {
    const days = Array.from({ length: 31 }, (_, d) => d + 1).filter((d) => (d - 1) % count === i);
    return i === 0 ? { any: [{ v: "clock.day", op: "in", x: days }, { v: "clock.day", op: "absent" }] } : { v: "clock.day", op: "in", x: days };
  }
  const slots = Math.floor(DAY / every);
  const ranges: Condition[] = [];
  for (let k = i; k < slots; k += count) ranges.push({ v: "clock.minutes", op: "between", x: [k * every, (k + 1) * every] });
  if (i === 0) ranges.push({ v: "clock.minutes", op: "absent" });
  return ranges.length === 1 ? ranges[0] : { any: ranges };
}

export const everyOf = (s: Record<string, unknown>): number => {
  const n = Number(s.every);
  return EVERY.some((o) => Number(o.value) === n) ? n : 60;
};

const imagesOf = (s: Record<string, unknown>): string[] =>
  Array.isArray(s.images) ? s.images.filter((x): x is string => typeof x === "string" && x !== "") : [];

export default defineExtension({
  id: "gallery",
  name: "Gallery",
  description: "Pictures that take turns — your own, or prints from the collection.",
  icon: "images",
  category: "picture",
  size: { min: [2, 2], default: [20, 12] },
  fields: [
    {
      key: "images", label: "Pictures", kind: "images",
      help: "Each whole-screen picture takes about 47 KB of the panel's 1 MB.",
    },
    {
      key: "every", label: "Change", kind: "select", options: EVERY,
      help: "Each day starts again at the first picture, so with more pictures than changes in a day the last ones never show.",
    },
    { key: "fit", label: "Fit", kind: "select", options: [{ value: "cover", label: "Fill the box" }, { value: "contain", label: "Show it whole" }] },
    {
      key: "dither", label: "Shading", kind: "select",
      options: [{ value: "floyd", label: "Smooth (Floyd–Steinberg)" }, { value: "atkinson", label: "Crisp (Atkinson)" }, { value: "threshold", label: "Black and white" }],
    },
    { key: "contrast", label: "Contrast", kind: "number", min: -100, max: 100, step: 10 },
    { key: "brightness", label: "Brightness", kind: "number", min: -100, max: 100, step: 10 },
  ],
  defaults: () => ({
    images: COLLECTION.filter((p) => STARTERS.includes(p.id)).map(collectionId),
    every: "60", fit: "cover", dither: "floyd", contrast: 0, brightness: 0,
  }),
  refresh: (s) => (everyOf(s) < DAY ? everyOf(s) : Infinity),
  title: (s) => {
    const n = imagesOf(s).length;
    return `Gallery · ${n} ${n === 1 ? "picture" : "pictures"}`;
  },
  draw(d, s) {
    const images = imagesOf(s);
    const box = { x: 0, y: 0, w: d.width, h: d.height };
    if (images.length === 0) {
      d.rect(box, { fill: false, stroke: 2, radius: 8 });
      d.icon("sparkles", { x: 0, y: 0, w: d.width, h: Math.round(d.height * 0.7) });
      d.text("Choose some pictures", { x: 0, y: Math.round(d.height * 0.65), w: d.width, h: Math.round(d.height * 0.3), size: 20, align: "center", valign: "top" });
      return;
    }
    const options = {
      fit: s.fit === "contain" ? "contain" : "cover",
      dither: (s.dither as "floyd" | "atkinson" | "threshold") ?? "floyd",
      contrast: Number(s.contrast) || 0,
      brightness: Number(s.brightness) || 0,
    } as const;
    const every = everyOf(s);
    images.forEach((id, i) => {
      const when = shows(i, images.length, every);
      if (when) d.when(when, () => d.image(id, box, options));
      else d.image(id, box, options);
    });
  },
});
