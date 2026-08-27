import { writeFile, mkdir } from "node:fs/promises";

import { all, defaultSettings } from "../src/lib/extensions/registry";
import { DEFAULT_PANEL } from "../src/lib/panel";
import { renderSolo } from "../src/lib/render";
import { closeBrowser } from "../src/lib/render/browser";
import { SHAPES } from "../src/lib/shapes";

/**
 * Render every extension at every shape.
 *
 * A design that throws, comes back blank, or overflows its box is invisible
 * until someone looks. This looks, and flags anything suspiciously small - a
 * near-empty PNG compresses to almost nothing, which is the cheapest possible
 * blank-screen detector.
 */
const out = "/tmp/dither-sweep";
await mkdir(out, { recursive: true });

const rows: string[] = [];
let suspicious = 0;

for (const extension of await all()) {
  for (const shape of SHAPES) {
    if (!extension.shapes.includes(shape.id)) continue;

    const authored = extension.authored.includes(shape.id) ? "" : " (family)";

    try {
      const rendered = await renderSolo(
        extension.name,
        shape.id,
        defaultSettings(extension),
        extension.manifest.sample as Record<string, unknown>,
        DEFAULT_PANEL,
      );

      await writeFile(`${out}/${extension.name}-${shape.id}.png`, rendered.bytes);

      // Sparse designs are legitimately small; this only catches near-blank.
      const thin = rendered.bytes.length < 520;
      if (thin || rendered.problems.length) suspicious += 1;

      rows.push(
        `${thin || rendered.problems.length ? "!!" : "ok"}  ${extension.name.padEnd(17)} ` +
          `${shape.id.padEnd(19)}${String(rendered.bytes.length).padStart(6)}b${authored}` +
          (rendered.problems.length ? `  ${rendered.problems.join("; ")}` : ""),
      );
    } catch (error) {
      suspicious += 1;
      rows.push(`!!  ${extension.name.padEnd(17)} ${shape.id.padEnd(19)} THREW: ${error}`);
    }
  }
}

console.log(rows.join("\n"));
console.log(`\n${rows.length} renders, ${suspicious} worth a look. Images in ${out}`);

await closeBrowser();
process.exit(0);
