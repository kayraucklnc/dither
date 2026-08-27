import { chromium } from "playwright";

/** Toggling an alert in Test must change the thumbnails, not only the trace. */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const seen: string[] = [];
page.on("request", (request) => {
  if (request.url().includes("/api/preview/screen/")) seen.push(request.url());
});

await page.goto("http://localhost:3000/devices/8", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const plain = seen.filter((url) => !url.includes("sim=")).length;
seen.length = 0;

await page.getByRole("button", { name: "Test", exact: true }).click();
await page.waitForTimeout(500);
await page.locator("aside").getByText("Try a different moment").locator("xpath=../..").locator("button").last().click();
await page.waitForTimeout(2500);

const simulated = seen.filter((url) => url.includes("sim=")).length;
console.log(`previews before simulating: ${plain}, re-requested with the pretence: ${simulated}`);
console.log(simulated > 0 ? "ok: thumbnails follow the simulation" : "!! thumbnails ignore it");

await browser.close();
