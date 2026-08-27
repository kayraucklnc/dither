import { chromium } from "playwright";

const [url, out, height] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: Number(height ?? 900) } });

const errors: string[] = [];
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
// networkidle never settles on pages that poll; wait for paint instead.
await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 3500));
await page.screenshot({ path: out, fullPage: true });
await browser.close();

if (errors.length) console.log("CONSOLE ERRORS:\n  " + errors.join("\n  "));
else console.log("no console errors");
