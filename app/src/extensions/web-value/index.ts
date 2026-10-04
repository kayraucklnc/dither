import { defineExtension } from "../api";

export default defineExtension({
  id: "web-value",
  name: "Number from the web",
  description: "Any value from a JSON address — a sensor, a counter, a price.",
  icon: "globe",
  category: "data",
  size: { min: [3, 2], default: [5, 3] },
  fields: [
    { key: "label", label: "Label", kind: "text", placeholder: "Followers" },
    { key: "url", label: "Address", kind: "text", placeholder: "https://api.example.com/stats.json" },
    { key: "path", label: "Value at", kind: "text", placeholder: "data.count", help: "Dots between keys; numbers pick from lists, e.g. items.0.price." },
    { key: "prefix", label: "Before", kind: "text", placeholder: "$" },
    { key: "suffix", label: "After", kind: "text", placeholder: " km" },
    { key: "decimals", label: "Decimals", kind: "number", min: 0, max: 4 },
    { key: "every", label: "Check every", kind: "number", min: 5, max: 1440, unit: "min" },
    { key: "header", label: "Header (optional)", kind: "text", placeholder: "Authorization" },
    { key: "headerValue", label: "Header value", kind: "secret", visible: (s) => Boolean(s.header) },
  ],
  defaults: () => ({ label: "Value", url: "", path: "", prefix: "", suffix: "", decimals: 0, every: 30, header: "", headerValue: "" }),
  title: (s) => String(s.label || "Number from the web"),
  source(s) {
    const url = String(s.url ?? "").trim();
    if (!/^https?:\/\//.test(url) || !s.path) return null;
    return {
      url,
      every: Number(s.every) || 30,
      ...(s.header ? { headers: [[String(s.header), String(s.headerValue ?? "")]] as [string, string][] } : {}),
      values: { value: String(s.path) },
    };
  },
  sample: () => ({ value: 1234 }),
  facts: (s) => [{ key: "value", label: String(s.label || "Value"), type: "number", value: "value" }],
  draw(d, s) {
    const labelH = s.label ? Math.round(d.height * 0.28) : 0;
    const shown = `${s.prefix ?? ""}8,888,888${s.suffix ?? ""}`;
    const size = d.fit([shown], d.width, d.height - labelH, { weight: 700 });
    const format = { num: { d: Number(s.decimals) || 0, sep: "," } };
    d.text([String(s.prefix ?? ""), d.value("value", format), String(s.suffix ?? "")],
      { x: 0, y: 0, w: d.width, h: d.height - labelH, size, weight: 700, valign: "middle" });
    if (labelH) {
      d.text(String(s.label), { x: 0, y: d.height - labelH, w: d.width, h: labelH, size: d.fit([String(s.label)], d.width, labelH) });
    }
  },
});
