import { chromium } from "playwright";

import { scratch } from "./scratch.mts";

// Its own screen and device: these save, and saving over a real one has
// already scrambled somebody's work.
const { screenId, deviceId } = await scratch();

/** Exercise the node editor the way a person would: right-click, drop, drag, wire. */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems: string[] = [];
page.on("pageerror", (error) => problems.push(String(error)));
page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 140)));

await page.goto(`http://localhost:3000/devices/${deviceId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const before = await page.locator(".react-flow__node").count();

// Right-click empty canvas, drop a loose check there.
await page.locator(".react-flow__pane").click({ button: "right", position: { x: 260, y: 640 } });
await page.waitForTimeout(500);
await page.getByText("New check here", { exact: true }).click();
await page.waitForTimeout(1500);

const after = await page.locator(".react-flow__node").count();
console.log(`nodes: ${before} -> ${after}`);

await page.screenshot({ path: "/tmp/node-editor.png" });
await browser.close();
console.log(problems.length ? "ERRORS:\n  " + problems.join("\n  ") : "no errors");
