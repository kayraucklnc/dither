import { chromium } from "playwright";

import { scratch } from "./scratch.mts";

/**
 * Change a screen, walk back to a device that shows it, and the tree has to
 * be showing the screen as it is now.
 *
 * The picture is an `<img src>` whose URL does not move when the screen does,
 * so whether it is current is the browser's decision. Told the copy is fresh
 * for a while, the browser does not ask, and the node draws the screen from
 * before the edit; told to revalidate, it asks and the ETag settles it. This
 * walks the actual route a person takes, because the failure only exists once
 * something is in the cache to be served.
 */
const base = process.env.DITHER_URL ?? "http://localhost:3000";
const { screenId, deviceId } = await scratch();

/**
 * The scratch screen, with its one widget at a given width. Both widths are
 * ones the departure board has a design for; a size it cannot draw is refused
 * rather than saved.
 */
async function widthOf(columns: number) {
  const response = await fetch(`${base}/api/screens/${screenId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      widgets: [{
        extension: "public_transport",
        label: "Cadorna to Saronno",
        settings: {
          country: "it", city: "milan", provider: "trenord",
          origin: "Milano Cadorna", destination: "Saronno",
        },
        column: 1, row: 1, columnSpan: columns, rowSpan: 6,
      }],
    }),
  });

  if (!response.ok) throw new Error(`could not resize the scratch screen: ${await response.text()}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Whether the browser asked at all is the diagnosis; what it drew is the test.
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
let cached = false;
cdp.on("Network.responseReceived", (event: { response: { url: string; fromDiskCache: boolean } }) => {
  if (event.response.url.includes(`/api/preview/screen/${screenId}?`)) {
    cached = event.response.fromDiskCache;
  }
});

/** What the node is drawing, read off the decoded image rather than the URL. */
async function onTheNode() {
  const drawn = await page.evaluate((id) => {
    const image = document.querySelector(`img[src*="/api/preview/screen/${id}"]`) as HTMLImageElement;
    if (!image?.naturalWidth) return null;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas.toDataURL();
  }, screenId);

  if (!drawn) throw new Error("the node is not showing a picture");
  return drawn;
}

const node = () => page.locator(`img[src*="/api/preview/screen/${screenId}"]`).first();

await widthOf(4);
await page.goto(`${base}/devices/${deviceId}`, { waitUntil: "domcontentloaded" });
await node().waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
const before = await onTheNode();

// Elsewhere in the app while the screen changes under it, exactly as someone
// editing the screen would be.
await page.getByRole("link", { name: "Screens" }).click();
await page.waitForURL("**/screens");
await widthOf(8);
await page.waitForTimeout(1000);

await page.getByRole("link", { name: "Devices" }).click();
await page.waitForURL("**/devices");
await page.locator(`a[href="/devices/${deviceId}"]`).first().click();
await page.waitForURL(`**/devices/${deviceId}`);
await node().waitFor({ timeout: 30_000 });
await page.waitForTimeout(2500);
const after = await onTheNode();

console.log(`the picture came ${cached ? "from the browser's cache" : "from the server"}`);
console.log(
  before === after
    ? "!! the node is still showing the screen as it was before the edit"
    : "ok: the node caught up with the screen",
);

await browser.close();
process.exit(before === after ? 1 : 0);
