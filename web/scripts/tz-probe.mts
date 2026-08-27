import { renderTemplate } from "../src/lib/render/liquid";
import { find } from "../src/lib/extensions/registry";

const extension = (await find("clock"))!;
const template = `utc={{ "now" | date: "%s" }} local={{ "now" | date: "%H:%M" }} shifted={{ "now" | date: "%s" | plus: 7200 | date: "%H:%M" }}`;

for (const offset of [0, 120]) {
  const out = await renderTemplate(template, {
    extension, settings: {}, data: {},
    environment: { locale: "en-GB", timezone: "Europe/Rome", timezoneOffset: offset },
  });
  console.log("offset", offset, "->", out);
}
console.log("system now:", new Date().toISOString());
