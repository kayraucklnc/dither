import { chromium } from "playwright";

import { scratch } from "./scratch.mts";

// Its own screen and device: these save, and saving over a real one has
// already scrambled somebody's work.
const { screenId, deviceId } = await scratch();

/** A drag has to move the node *while* the mouse is down, not on release. */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:3000/devices/${deviceId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const node = page.locator(".react-flow__node").first();
const start = (await node.boundingBox())!;

await page.mouse.move(start.x + 60, start.y + 12);
await page.mouse.down();
await page.mouse.move(start.x + 200, start.y + 120, { steps: 8 });
await page.waitForTimeout(150);

const during = (await node.boundingBox())!;
await page.mouse.up();
await page.waitForTimeout(400);
const after = (await node.boundingBox())!;

const movedDuring = Math.round(during.x - start.x);
const movedAfter = Math.round(after.x - start.x);

console.log(`moved during drag: ${movedDuring}px, after release: ${movedAfter}px`);
console.log(movedDuring > 60 ? "ok: it follows the cursor" : "!! it only jumps on release");

await browser.close();
