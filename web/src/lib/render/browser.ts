import { chromium, type Browser } from "playwright";

/**
 * One browser for the whole process.
 *
 * The first version launched Chromium per render, which is why the extensions
 * page took seconds to paint: three cards meant three browser launches. A
 * launch is roughly 300ms; a new page in a running browser is roughly 10.
 */

let browser: Browser | undefined;
let starting: Promise<Browser> | undefined;

export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;

  // Concurrent callers during startup must share one launch, not race to
  // start three browsers and leak two of them.
  starting ??= chromium
    .launch({ args: ["--font-render-hinting=none", "--disable-lcd-text"] })
    .then((launched) => {
      browser = launched;
      starting = undefined;
      return launched;
    });

  return starting;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = undefined;
}

/** Screenshot an HTML document at an exact panel size. */
export async function shoot(html: string, width: number, height: number): Promise<Buffer> {
  const page = await (await getBrowser()).newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  try {
    await page.setContent(html, { waitUntil: "load" });
    // Webfonts settle after load; screenshotting before they do produces a
    // render in the fallback face, which then dithers differently.
    // Fonts settle after load; screenshotting first renders in the fallback
    // face, which then dithers differently. Every widget is its own frame, so
    // every frame has to be waited on, not just the top one.
    await Promise.all(page.frames().map((frame) => frame.evaluate(() => document.fonts.ready)));

    return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
  } finally {
    await page.close();
  }
}
