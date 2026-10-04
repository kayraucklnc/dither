import type { Format } from "@/runtime/types";
import { defineExtension } from "../api";

// Whole days to go, rounded up: tonight at 23:00, tomorrow is "1 day" away.
const DAYS: Format = { until: true, scale: 1 / 1440, add: 0.4999, num: { d: 0 }, fallback: "0" };

export default defineExtension({
  id: "countdown",
  name: "Countdown",
  description: "Days until something you are looking forward to.",
  icon: "gift",
  category: "time",
  size: { min: [3, 2], default: [5, 4] },
  fields: [
    { key: "label", label: "What", kind: "text", placeholder: "Holiday" },
    { key: "date", label: "When", kind: "date" },
  ],
  defaults: () => {
    const d = new Date(Date.now() + 30 * 86400000);
    return { label: "Holiday", date: d.toISOString().slice(0, 10) };
  },
  refresh: () => 60,
  draw(d, s) {
    const date = String(s.date ?? "");
    const labelH = Math.round(d.height * 0.28);
    const numSize = d.fit(["888"], d.width, d.height - labelH, { weight: 700 });
    d.text(d.constant(date, DAYS), { x: 0, y: 0, w: d.width, h: d.height - labelH, size: numSize, weight: 700, align: "center", valign: "bottom" });
    const label = `days until ${String(s.label ?? "")}`;
    const size = d.fit([label], d.width, labelH);
    d.text(label, { x: 0, y: d.height - labelH, w: d.width, h: labelH, size, align: "center", valign: "top" });
  },
});
