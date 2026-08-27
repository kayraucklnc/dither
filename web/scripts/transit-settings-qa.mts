import { chromium } from "playwright";

import { scratch } from "./scratch.mts";

// Its own screen and device: these save, and saving over a real one has
// already scrambled somebody's work.
const { screenId, deviceId } = await scratch();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const problems: string[] = [];
page.on("pageerror", (error) => problems.push(String(error)));
page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 140)));

await page.goto(`http://localhost:3000/screens/${screenId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);

// Select the transit widget by clicking its area on the canvas.
await page.locator(".paper-shadow").first().click({ position: { x: 120, y: 200 } });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/transit-settings.png" });

const pickOperator = async (name: RegExp) => {
  await page.locator("aside").getByLabel("Operator").click();
  await page.waitForTimeout(400);
  await page.getByRole("option", { name }).click();
  await page.waitForTimeout(2000);
};

// The previous run leaves whatever it chose, so start from a known operator.
await pickOperator(/Trenord/);
const beforeTo = await page.getByText("To", { exact: true }).count();

// A metro board has no destination and no platform, so both should go.
await pickOperator(/ATM/);
const afterTo = await page.getByText("To", { exact: true }).count();

// And leave it as it was found, so the next run starts from the same place.
await pickOperator(/Trenord/);

console.log(`"To" field with Trenord: ${beforeTo}, with ATM: ${afterTo}`);
await page.screenshot({ path: "/tmp/transit-atm.png" });

await browser.close();
console.log(problems.length ? "ERRORS:\n  " + problems.join("\n  ") : "no errors");
