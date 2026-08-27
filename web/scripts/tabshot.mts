import { chromium } from "playwright";

import { scratch } from "./scratch.mts";

// Its own screen and device: these save, and saving over a real one has
// already scrambled somebody's work.
const { screenId, deviceId } = await scratch();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:3000/devices/${deviceId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

for (const tab of ["Notices", "Device"]) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/tab-${tab.toLowerCase()}.png` });
}
await browser.close();
console.log("done");
