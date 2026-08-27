import { chromium } from "playwright";

import { scratch } from "./scratch.mts";

/**
 * Backspace over a selected node has to *stay* deleted.
 *
 * React Flow deleting from its own copy of the canvas looks identical for a
 * few seconds; the node comes back on the next trace refresh, twenty seconds
 * later, because nothing ever wrote the deletion down. So the check waits out
 * a refresh and then reloads the page, which reads the tree back from the
 * database.
 */
const base = process.env.DITHER_URL ?? "http://localhost:3000";
const { deviceId } = await scratch();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems: string[] = [];
page.on("pageerror", (error) => problems.push(String(error)));
page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 140)));

await page.goto(`${base}/devices/${deviceId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

// A loose check, so the tree the device walks is not what is being deleted.
await page.locator(".react-flow__pane").click({ button: "right", position: { x: 260, y: 640 } });
await page.getByText("New check here", { exact: true }).click();
await page.waitForTimeout(2000);

const planted = await page.locator(".react-flow__node").count();

await page.locator(".react-flow__node").last().click();
await page.waitForTimeout(300);
await page.keyboard.press("Backspace");
await page.waitForTimeout(2000);

const straightAfter = await page.locator(".react-flow__node").count();

// Long enough for the twenty-second trace refresh to redraw the canvas.
await page.waitForTimeout(24_000);
const afterRefresh = await page.locator(".react-flow__node").count();

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const afterReload = await page.locator(".react-flow__node").count();

console.log(`nodes: ${planted} planted -> ${straightAfter} after backspace -> ${afterRefresh} after a refresh -> ${afterReload} after a reload`);

const expected = planted - 1;
const verdict =
  straightAfter === expected && afterRefresh === expected && afterReload === expected
    ? "gone, and stayed gone"
    : "STILL THERE";

await page.screenshot({ path: "/tmp/delete-node.png" });
await browser.close();

console.log(verdict);
console.log(problems.length ? "ERRORS:\n  " + problems.join("\n  ") : "no errors");
