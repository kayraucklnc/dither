import { chromium } from "playwright";

const [url, out, height] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: Number(height ?? 900) } });

const errors: string[] = [];
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: out, fullPage: true });
await browser.close();

if (errors.length) console.log("CONSOLE ERRORS:\n  " + errors.join("\n  "));
else console.log("no console errors");
