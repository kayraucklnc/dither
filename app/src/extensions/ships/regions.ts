// The waters a ship tracker can watch: a box each, under Open Waters' 100
// square-degree limit for anonymous requests. Shared with tools/coast/build.mjs,
// which clips a coastline to each one; a new region needs that run again.

import REGIONS_JSON from "./regions.json";

export interface Region {
  id: string;
  /** In a sentence: "the Bosphorus". */
  name: string;
  /** As a label: "Bosphorus". */
  label: string;
  /** Where that is, for the picker. */
  group: string;
  /** South, west, north, east, in degrees: the order Open Waters takes a `bbox`. */
  box: [number, number, number, number];
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const REGIONS: readonly Region[] = REGIONS_JSON as Region[];

/** Square degrees an anonymous request may ask about. */
export const AREA_CAP = 100;

export const regionOf = (id: string): Region | undefined => REGIONS.find((r) => r.id === id);

export const boundsOf = (r: Region): Bounds => ({ south: r.box[0], west: r.box[1], north: r.box[2], east: r.box[3] });

export const areaOf = (b: Bounds): number => (b.north - b.south) * (b.east - b.west);

export const centreOf = (b: Bounds): [number, number] => [(b.south + b.north) / 2, (b.west + b.east) / 2];

/** Whether `inner` lies wholly within `outer`. */
export const contains = (outer: Bounds, inner: Bounds): boolean =>
  inner.south >= outer.south && inner.north <= outer.north && inner.west >= outer.west && inner.east <= outer.east;

export const CUSTOM = "custom";

export const REGION_OPTIONS: readonly { value: string; label: string; hint?: string }[] = [
  ...REGIONS.map((r) => ({ value: r.id, label: r.label, hint: r.group })),
  { value: CUSTOM, label: "Around a place…", hint: "your own place and radius" },
];
