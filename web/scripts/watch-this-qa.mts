import { chromium } from "playwright";

import { scratch } from "./scratch.mts";

/**
 * "Also watch this" has to say what it did, and has to do it once.
 *
 * The click sends a question to the world and waits for the answer, so there
 * is a real gap where nothing on screen has changed yet. Left silent, the gap
 * reads as a dead button - and clicking a dead button again is how somebody
 * ends up with four identical sources.
 */
const base = process.env.DITHER_URL ?? "http://localhost:3000";
const { screenId } = await scratch();

const sources = async (): Promise<{ id: number; extension: string }[]> =>
  (await fetch(`${base}/api/sources`).then((response) => response.json())).sources;

let failures = 0;
const check = (ok: boolean, said: string) => {
  if (!ok) failures += 1;
  console.log(ok ? `ok: ${said}` : `!! ${said}`);
};

/* One question, asked with its keys in two orders. Postgres hands a stored row
 * back in its own order, so this is the shape every real second click has. */
const ask = (settings: Record<string, unknown>) =>
  fetch(`${base}/api/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extension: "weather", label: "Watch check", settings }),
  }).then((response) => response.json());

const first = await ask({ latitude: "1", longitude: "2", place: "Nowhere", units: "celsius" });
const again = await ask({ units: "celsius", place: "Nowhere", longitude: "2", latitude: "1" });

check(
  first.source?.id === again.source?.id && again.reused === true,
  "the same question in a different key order answers with the source that exists",
);

await fetch(`${base}/api/sources?id=${first.source.id}`, { method: "DELETE" });

/* And through the button, which is where a person meets it. */
const watchedBefore = await sources();
const mine = watchedBefore.filter((source) => source.extension === "public_transport");
for (const source of mine) await fetch(`${base}/api/sources?id=${source.id}`, { method: "DELETE" });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let posts = 0;
page.on("request", (request) => {
  if (request.url().endsWith("/api/sources") && request.method() === "POST") posts += 1;
});

await page.goto(`${base}/screens/${screenId}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const button = page.getByRole("button", { name: "Also watch this" });
check(await button.count() > 0, "the button is offered for a widget that reports something");

await button.click();

// The moment after the click, before the world has answered.
const working = await page.getByRole("button", { name: "Asking it now" }).count();
check(working > 0, "the button says it is working rather than sitting there");

// Three more clicks while it works. A disabled button takes none of them.
for (let attempt = 0; attempt < 3; attempt += 1) {
  await page.getByRole("button", { name: /Also watch this|Asking it now/ })
    .click({ timeout: 500, force: true })
    .catch(() => {});
}

await page.waitForTimeout(6000);

check(
  await page.getByText("Also watched", { exact: false }).count() > 0,
  "the box turns into a sentence saying it is watched",
);
check(await button.count() === 0, "the button is gone, so there is nothing left to click twice");

const added = (await sources()).filter((source) => source.extension === "public_transport").length;
check(added === 1, added === 1 ? "one source was filed" : `${added} sources were filed`);
check(posts === 1, posts === 1 ? "one request was sent" : `${posts} requests were sent`);

await browser.close();
process.exit(failures ? 1 : 0);
