import { defineExtension } from "../api";

export default defineExtension({
  id: "date",
  name: "Date",
  description: "Today, like a page torn off a calendar.",
  icon: "calendar",
  category: "time",
  size: { min: [3, 3], default: [5, 6] },
  fields: [],
  defaults: () => ({}),
  draw(d) {
    const top = Math.round(d.height * 0.22);
    const daySize = d.fit(["Wednesday"], d.width, top);
    d.rect({ x: 0, y: 0, w: d.width, h: top }, { radius: 8 });
    d.text(d.time("dddd"), { x: 0, y: 0, w: d.width, h: top, size: daySize, weight: 700, align: "center", valign: "middle", white: true });
    const monthH = Math.round(d.height * 0.2);
    const numH = d.height - top - monthH;
    const numSize = d.fit(["30"], d.width, numH, { weight: 700 });
    d.text(d.time("D"), { x: 0, y: top, w: d.width, h: numH, size: numSize, weight: 700, align: "center", valign: "middle" });
    const monthSize = d.fit(["September 2026"], d.width, monthH);
    d.text(d.time("MMMM YYYY"), { x: 0, y: d.height - monthH, w: d.width, h: monthH, size: monthSize, align: "center", valign: "middle" });
  },
});
