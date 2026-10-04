// Render every starter to PNG: `npx vite-node scripts/preview.ts <out-dir>`.

import { mkdirSync, writeFileSync } from "node:fs";
import { loadFonts, nodeLibrary } from "../src/assets/node";
import { compile } from "../src/compiler";
import { createProject, STARTERS } from "../src/project/starters";
import { AssetStore, renderScreen } from "../src/runtime/render";
import { sampleValues } from "../src/compiler/sample";
import { toPng } from "./png";

const out = process.argv[2] ?? "preview";
mkdirSync(out, { recursive: true });
const fonts = await loadFonts();
const now = Math.floor(Date.now() / 1000);
for (const s of STARTERS) {
  const project = createProject({ starter: s.id, timezone: "Europe/Istanbul", language: "en", units: "metric", place: { name: "Istanbul", latitude: 41.01, longitude: 28.98 } });
  const c = await compile(project, { library: nodeLibrary, fonts, picture: async () => null, boardPanel: () => ({ width: 800, height: 480 }) });
  if (c.problems.length) console.error(s.id, c.problems);
  const values = sampleValues(c, now);
  const store = new AssetStore(c.blob, c.runtime.assets);
  c.runtime.screens.forEach((screen, i) => {
    const file = `${out}/${s.id}-${i}-${screen.name.toLowerCase()}.png`;
    writeFileSync(file, toPng(renderScreen(c.runtime, store, i, values, now)));
    console.log(file, `${c.blob.length} bytes`);
  });
}
