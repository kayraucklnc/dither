import { defineExtension, type Draw } from "../api";

/** What an address-less widget shows until it has one. */
function needsAddress(d: Draw): void {
  d.icon("info", { x: 0, y: d.height * 0.1, w: d.width, h: Math.min(d.height * 0.45, 96) });
  d.text("Enter an address in its settings", { x: 0, y: d.height * 0.6, w: d.width, h: d.height * 0.3, size: d.fit(["Enter an address in"], d.width, 40, { max: 24 }), align: "center", wrap: true, lines: 2 });
}

const SIZES: Record<string, number> = { small: 18, medium: 24, large: 32 };

export default defineExtension({
  id: "web-page",
  name: "Web page",
  description: "The text of any web page, fetched by the panel itself — a status page, a menu, a notice.",
  icon: "file-code",
  category: "data",
  size: { min: [4, 2], default: [10, 5] },
  fields: [
    { key: "url", label: "Address", kind: "text", placeholder: "https://example.com/status", help: "The panel asks for this page and shows its text: no pictures, no styling, no scripts." },
    { key: "heading", label: "Heading", kind: "select", options: [
      { value: "title", label: "The page's title" },
      { value: "custom", label: "My own" },
      { value: "none", label: "None" },
    ] },
    { key: "label", label: "Heading text", kind: "text", placeholder: "Office menu", visible: (s) => s.heading === "custom" },
    { key: "size", label: "Text size", kind: "select", options: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
    ] },
    { key: "every", label: "Check every", kind: "number", min: 5, max: 1440, unit: "min" },
    { key: "header", label: "Header (optional)", kind: "text", placeholder: "Authorization" },
    { key: "headerValue", label: "Header value", kind: "secret", visible: (s) => Boolean(s.header) },
  ],
  defaults: () => ({ url: "", heading: "title", label: "", size: "medium", every: 60, header: "", headerValue: "" }),
  title: (s) => {
    const host = /^https?:\/\/([^/?#]+)/.exec(String(s.url ?? ""))?.[1];
    return host ? `Web page · ${host}` : "Web page";
  },
  source(s) {
    const url = String(s.url ?? "").trim();
    if (!/^https?:\/\//.test(url)) return null;
    return {
      url,
      html: true,
      every: Number(s.every) || 60,
      ...(s.header ? { headers: [[String(s.header), String(s.headerValue ?? "")]] as [string, string][] } : {}),
      values: { text: "text", title: "title" },
    };
  },
  example: { url: "https://example.com/office" },
  sample: () => ({
    title: "Today at the office",
    text: "Lunch: risotto with peas, or a lentil salad.\nThe 3rd floor printer is fixed.\nFire drill on Thursday at 11:00 — please leave by the east stairs.",
  }),
  facts: () => [{ key: "text", label: "Page text", type: "text", value: "text" }],
  draw(d, s) {
    if (!/^https?:\/\//.test(String(s.url ?? "").trim())) return needsAddress(d);
    const size = SIZES[String(s.size)] ?? SIZES.medium;
    const heading = s.heading === "custom" ? String(s.label ?? "") : s.heading === "title" ? d.value("title") : null;
    let top = 0;
    if (heading) {
      const hs = Math.round(size * 1.25);
      // A few pixels of air: some glyphs reach above the ascent.
      const hh = d.lineHeight(hs, 700) + 4;
      d.text(heading, { x: 0, y: 0, w: d.width, h: hh, size: hs, weight: 700 });
      top = hh + Math.round(size * 0.4);
    }
    const h = d.height - top;
    d.text(d.value("text"), { x: 0, y: top, w: d.width, h, size, wrap: true, lines: Math.max(1, Math.floor(h / d.lineHeight(size))) });
  },
});
