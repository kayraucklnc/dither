import { chromium } from "playwright";

/**
 * Walk every page, report console errors and anything that looks broken.
 *
 * Green unit tests have never once caught a layout bug in this codebase. This
 * loads each page for real, watches the console, and checks a few things that
 * only show up in a browser: images that failed, horizontal overflow, and
 * elements spilling out of the viewport.
 */
const PAGES = [
  ["/devices", "Devices"],
  ["/devices/8", "A device"],
  ["/screens", "Screens"],
  ["/screens/12", "The screen editor"],
  ["/extensions", "Extensions"],
  ["/extensions/weather", "An extension"],
  ["/sources", "Sources"],
  ["/connections", "Connections"],
  ["/settings", "Settings"],
];

const browser = await chromium.launch();
let bad = 0;

for (const [path, name] of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 140)}`);
  });
  page.on("pageerror", (error) => problems.push(`threw: ${String(error).slice(0, 140)}`));
  page.on("requestfailed", (request) =>
    problems.push(`failed request: ${request.url().slice(0, 90)}`),
  );

  await page.goto(`http://localhost:3000${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(4000);

  const checks = await page.evaluate(`
    (function () {
      var out = [];
      if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        out.push("page scrolls sideways (" + document.documentElement.scrollWidth + "px)");
      }
      Array.from(document.images).forEach(function (image) {
        if (image.complete && image.naturalWidth === 0) out.push("broken image: " + image.alt);
      });
      if (!document.body.innerText.trim()) out.push("nothing rendered");
      return out;
    })()
  `);

  const all = [...problems, ...(checks as string[])];
  if (all.length) bad += 1;

  console.log(`${all.length ? "!!" : "ok"}  ${name.padEnd(20)} ${path}`);
  all.forEach((problem) => console.log(`      ${problem}`));

  await page.close();
}

await browser.close();
console.log(`\n${PAGES.length} pages, ${bad} with something to look at.`);
process.exit(bad ? 1 : 0);
