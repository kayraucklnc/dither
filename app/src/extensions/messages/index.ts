import { defineExtension, type Draw } from "../api";

function sizeFor(d: Draw, texts: string[]): number {
  for (const size of [96, 80, 64, 48, 40, 32, 28, 24, 20, 16, 14, 12]) {
    if (texts.every((t) => d.linesFor(t, size, d.width) * d.lineHeight(size) <= d.height)) return size;
  }
  return 12;
}

export default defineExtension({
  id: "messages",
  name: "Messages",
  description: "A different line every day or every hour, from a list you write.",
  icon: "quote",
  category: "text",
  size: { min: [3, 2], default: [10, 3] },
  fields: [
    { key: "messages", label: "Messages", kind: "list", placeholder: "Drink some water", help: "One per line." },
    { key: "change", label: "Change", kind: "select", options: [{ value: "day", label: "Every day" }, { value: "hour", label: "Every hour" }] },
  ],
  defaults: () => ({ messages: ["Have a lovely day.", "Drink some water.", "Call someone you miss."], change: "day" }),
  refresh: (s) => (s.change === "hour" ? 60 : 24 * 60),
  draw(d, s) {
    const list = (Array.isArray(s.messages) ? s.messages : []).map(String).filter((m) => m.trim() !== "");
    if (list.length === 0) return;
    const byHour = s.change === "hour";
    const keys = byHour ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 31 }, (_, i) => i + 1);
    const o = keys.map((k) => list[(byHour ? k : k - 1) % list.length]);
    d.text({ v: byHour ? "clock.hour" : "clock.day", f: { map: { k: keys, o } } }, {
      x: 0, y: 0, w: d.width, h: d.height, size: sizeFor(d, list), wrap: true, align: "center", valign: "middle",
    });
  },
});
