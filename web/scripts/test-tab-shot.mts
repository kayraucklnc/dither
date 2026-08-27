import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto("http://localhost:3000/devices/8", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

await page.getByRole("button", { name: "Test", exact: true }).click();
await page.waitForTimeout(500);

// Turn simulation on, then pretend it is raining hard.
await page.locator("aside button").filter({ hasText: "" }).nth(0);
await page.locator('aside >> text=Try a different moment').locator("xpath=../..").locator("button").last().click();
await page.waitForTimeout(800);

const rain = page.locator('aside input[placeholder="15"]').first();
if (await rain.count()) {
  await rain.fill("85");
  await page.waitForTimeout(1600);
}

await page.screenshot({ path: "/tmp/tab-test.png" });
await browser.close();
console.log(errors.length ? "ERRORS: " + errors.join("; ") : "no page errors");
