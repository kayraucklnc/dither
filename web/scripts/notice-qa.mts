import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems: string[] = [];
page.on("pageerror", (error) => problems.push(String(error)));
page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 120)));

await page.goto("http://localhost:3000/devices/8", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

await page.getByRole("button", { name: "Notices", exact: true }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/notices2.png" });

await page.getByRole("button", { name: "Test", exact: true }).click();
await page.waitForTimeout(600);
// Turn simulation on.
await page.locator("aside").getByText("Try a different moment").locator("xpath=../..").locator("button").last().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/test2.png" });

await browser.close();
console.log(problems.length ? "ERRORS:\n  " + problems.join("\n  ") : "no errors");
