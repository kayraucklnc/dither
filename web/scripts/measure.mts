import { chromium } from "playwright";
import { composeSolo } from "../src/lib/render/compose";

const { html } = await composeSolo(
  { id: 0, extension: "weather", label: "w",
    settings: { place: "Milan", units: "celsius", style: "rich", show_hours: 12 },
    data: (await import("../src/lib/extensions/registry")
      .then((m) => m.find("weather")))!.manifest.sample as Record<string, unknown>,
    column: 1, row: 1, columnSpan: 6, rowSpan: 6 },
  "full", 800, 480,
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
await page.setContent(html, { waitUntil: "load" });

// A string, not a closure: tsx's transform injects a __name helper that does
// not exist inside the page.
const boxes = await page.evaluate(`
  [".screen", ".content", ".hero", ".hero .i", ".bars", ".bars .bar", ".bars .bar .fill"]
    .flatMap(function (sel) {
      return Array.from(document.querySelectorAll(sel)).slice(0, 2).map(function (el) {
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        return { sel: sel, cls: el.className, parent: el.parentElement ? el.parentElement.className : "",
                 x: Math.round(r.x), y: Math.round(r.y),
                 w: Math.round(r.width), h: Math.round(r.height), display: cs.display };
      });
    })
`);

console.table(boxes);
await browser.close();
