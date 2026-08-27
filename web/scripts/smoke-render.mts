import { writeFile } from "node:fs/promises";

import { all } from "../src/lib/extensions/registry";
import { renderScreen, type Panel } from "../src/lib/render";
import { closeBrowser } from "../src/lib/render/browser";
import type { PlacedWidget } from "../src/lib/render/compose";

const panel: Panel = {
  width: 800,
  height: 480,
  bitDepth: 1,
  colors: 2,
  colorCodes: [],
  mode: "dither",
  rotation: 0,
};

const extensions = await all();
console.log("loaded:", extensions.map((e) => `${e.name} [${e.shapes.join(", ")}]`).join("\n        "));

const widget = (
  name: string,
  at: [number, number, number, number],
  settings: Record<string, unknown>,
): PlacedWidget => {
  const extension = extensions.find((candidate) => candidate.name === name);
  return {
    id: 0,
    extension: name,
    label: name,
    settings,
    data: (extension?.manifest.sample ?? {}) as Record<string, unknown>,
    column: at[0],
    row: at[1],
    columnSpan: at[2],
    rowSpan: at[3],
  };
};

const widgets: PlacedWidget[] = [
  widget("public_transport", [1, 1, 3, 6], {
    country: "it", city: "milan", provider: "trenord",
    origin: "Milano Cadorna", destination: "Saronno",
  }),
  widget("clock", [4, 1, 3, 3], { utc_offset_hours: "2", heading: "Milan" }),
  widget("weather", [4, 4, 3, 3], { place: "Milan", units: "celsius" }),
];

const rendered = await renderScreen(widgets, panel);
await writeFile("/tmp/dither-smoke.png", rendered.bytes);

console.log("\nrendered:", rendered.width + "x" + rendered.height, rendered.bytes.length + " bytes");
console.log("fingerprint:", rendered.fingerprint);
console.log("problems:", rendered.problems.length ? "\n  - " + rendered.problems.join("\n  - ") : "none");

await closeBrowser();
