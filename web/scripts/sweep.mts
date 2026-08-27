import { writeFile, mkdir } from "node:fs/promises";

import { all, defaultSettings } from "../src/lib/extensions/registry";
import { DEFAULT_PANEL } from "../src/lib/panel";
import { renderSolo } from "../src/lib/render";
import { closeBrowser } from "../src/lib/render/browser";
import { supportsSize } from "../src/lib/designs";
import { previewData } from "../src/lib/widget-data";
import { sizeToken, type Size } from "../src/lib/shapes";

/**
 * Render every extension in every style, at the extremes of every range.
 *
 * Sweeping the eight old shapes was enough when a shape *was* a design. Now a
 * design covers a range, and the only sizes worth rendering are the ones that
 * break it: the smallest it claims, the largest, and the two lopsided corners
 * of the range where the type-fitting arithmetic is most likely to run a
 * figure off the edge.
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
  for (const design of extension.designs) {
    const { minColumns, maxColumns, minRows, maxRows } = design.range;

    const corners: Size[] = [
      { columns: minColumns, rows: minRows },
      { columns: maxColumns, rows: maxRows },
      { columns: minColumns, rows: maxRows },
      { columns: maxColumns, rows: minRows },
      design.nominal,
    ];

    // Deduplicated, because a design with a one-cell range has one corner.
    const seen = new Set<string>();

    for (const size of corners) {
      const key = `${size.columns}x${size.rows}`;
      if (seen.has(key) || !supportsSize([design], size)) continue;
      seen.add(key);

      const label = `${design.key}@${key}`;

      try {
        const rendered = await renderSolo(
          extension.name,
          size,
          defaultSettings(extension),
          // The same data a thumbnail would draw with: real where there is
          // any, the sample where there is not. Sweeping a gallery against its
          // empty sample only ever proves the empty state fits.
          await previewData(extension, defaultSettings(extension)),
          DEFAULT_PANEL,
          [],
          design.key,
        );

        await writeFile(`${out}/${extension.name}-${design.key}-${sizeToken(size)}.png`, rendered.bytes);

        // Sparse designs are legitimately small; this only catches near-blank.
        const thin = rendered.bytes.length < 520;
        if (thin || rendered.problems.length) suspicious += 1;

        rows.push(
          `${thin || rendered.problems.length ? "!!" : "ok"}  ${extension.name.padEnd(17)} ` +
            `${label.padEnd(22)}${String(rendered.bytes.length).padStart(6)}b` +
            (rendered.problems.length ? `  ${rendered.problems.join("; ")}` : ""),
        );
      } catch (error) {
        suspicious += 1;
        rows.push(`!!  ${extension.name.padEnd(17)} ${label.padEnd(22)} THREW: ${error}`);
      }
    }
  }
}

console.log(rows.join("\n"));
console.log(`\n${rows.length} renders, ${suspicious} worth a look. Images in ${out}`);

await closeBrowser();
process.exit(0);
