/**
 * Checks the wire contract stock TRMNL firmware depends on.
 *
 * Not a unit test: it runs against a live server, because what matters is the
 * bytes on the wire, not that a function returns the right object. Run with
 * the dev server up. See docs/device-api-contract.md.
 */
const base = process.env.DITHER_URL ?? "http://localhost:3000";

const DISPLAY_KEYS = [
  "filename", "firmware_url", "firmware_version", "image_url", "image_url_timeout",
  "maximum_compatibility", "refresh_rate", "reset_firmware", "special_function",
  "temperature_profile", "touchbar_mode", "update_firmware",
].sort();

const SETUP_KEYS = ["api_key", "image_url", "message", "status"].sort();

const failures: string[] = [];
const check = (name: string, pass: boolean, detail = "") =>
  pass ? console.log(`  ok   ${name}`) : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

const firmwareHeaders = (token: string) => ({
  "access-token": token,
  id: "A1:B2:C3:D4:E5:F6",
  model: "og",
  "fw-version": "1.2.3",
  width: "800",
  height: "480",
  "battery-voltage": "4.74",
  "percent-charged": "85",
  rssi: "-54",
  "wifi-band": "2.4",
  "usb-connected": "false",
  "refresh-rate": "25",
  "image-cached": "false",
  "user-agent": "ESP32HTTPClient",
});

console.log("setup");
const mac = `AA:BB:CC:DD:EE:${Math.floor(Math.random() * 90 + 10)}`;
const setup = await fetch(`${base}/api/setup`, { headers: { id: mac, model: "og", "fw-version": "1.2.3" } });
const setupBody = await setup.json();

check("answers 200", setup.status === 200, String(setup.status));
check("has exactly the contract keys", JSON.stringify(Object.keys(setupBody).sort()) === JSON.stringify(SETUP_KEYS), Object.keys(setupBody).sort().join(","));
check("hands out an api key for a new device", typeof setupBody.api_key === "string" && setupBody.api_key.length > 0);
check("answers status 200 in the body too", setupBody.status === 200);

const again = await fetch(`${base}/api/setup`, { headers: { id: mac, model: "og" } });
check("answers an empty key for a device it already knows", (await again.json()).api_key === "");

console.log("\ndisplay");
const display = await fetch(`${base}/api/display`, { headers: firmwareHeaders(setupBody.api_key) });
const body = await display.json();

check("answers 200", display.status === 200, String(display.status));
check("has exactly the contract keys", JSON.stringify(Object.keys(body).sort()) === JSON.stringify(DISPLAY_KEYS), Object.keys(body).sort().join(","));
check("refresh_rate is a positive integer of seconds", Number.isInteger(body.refresh_rate) && body.refresh_rate > 0, String(body.refresh_rate));
check("image_url_timeout is a number", typeof body.image_url_timeout === "number");
check("special_function defaults to none", body.special_function === "none");
check("touchbar_mode defaults to tap", body.touchbar_mode === "tap");
check("temperature_profile defaults to default", body.temperature_profile === "default");
check("firmware fields are null when there is nothing to update to", body.firmware_url === null && body.firmware_version === null);
check("update_firmware is false when firmware is null", body.update_firmware === false);

console.log("\nimage");
const image = await fetch(body.image_url);
const bytes = new Uint8Array(await image.arrayBuffer());

check("the image is reachable without any headers", image.status === 200, String(image.status));
check("is served as image/png", image.headers.get("content-type") === "image/png");
check("really is a PNG", bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47);

const width = new DataView(bytes.buffer).getUint32(16);
const height = new DataView(bytes.buffer).getUint32(20);
check("matches the panel size", width === 800 && height === 480, `${width}x${height}`);

console.log("\ncaching");
const second = await fetch(`${base}/api/display`, { headers: firmwareHeaders(setupBody.api_key) });
const secondBody = await second.json();
check(
  "filename is stable while the picture is unchanged, so the device does not redraw",
  secondBody.filename === body.filename,
  `${body.filename} then ${secondBody.filename}`,
);

console.log("\nauthentication");
const noToken = await fetch(`${base}/api/display`);
check("refuses a request with no token", noToken.status === 401, String(noToken.status));
const badToken = await fetch(`${base}/api/display`, { headers: firmwareHeaders("not-a-real-key") });
check("refuses an unknown token", badToken.status === 404, String(badToken.status));

if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log("\nthe device contract holds.");
