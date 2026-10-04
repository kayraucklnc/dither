import { defineExtension } from "../api";

export default defineExtension({
  id: "clock",
  name: "Clock",
  description: "The time, as digits or a dial.",
  icon: "clock",
  category: "time",
  size: { min: [3, 2], default: [8, 4] },
  fields: [
    { key: "style", label: "Style", kind: "select", options: [{ value: "digital", label: "Digits" }, { value: "analog", label: "Dial" }] },
    { key: "hours", label: "Hours", kind: "select", options: [{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }], visible: (s) => s.style === "digital" },
    { key: "showDate", label: "Show the date", kind: "toggle", visible: (s) => s.style === "digital" },
    {
      key: "every", label: "Update every", kind: "select",
      options: [{ value: "1", label: "Minute" }, { value: "5", label: "5 minutes" }, { value: "15", label: "15 minutes" }],
      help: "Each update redraws the panel. Less often saves battery.",
    },
  ],
  defaults: () => ({ style: "digital", hours: "24", showDate: true, every: "1" }),
  refresh: (s) => Number(s.every) || 1,
  draw(d, s) {
    if (s.style === "analog") {
      const r = Math.floor(Math.min(d.width, d.height) / 2) - 2;
      const cx = Math.floor(d.width / 2);
      const cy = Math.floor(d.height / 2);
      const thick = Math.max(2, Math.round(r / 30));
      d.circle(cx, cy, r, { fill: false, stroke: thick });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        const inner = i % 3 === 0 ? r * 0.8 : r * 0.88;
        d.line(
          cx + Math.round(Math.sin(a) * inner), cy - Math.round(Math.cos(a) * inner),
          cx + Math.round(Math.sin(a) * (r - thick * 2)), cy - Math.round(Math.cos(a) * (r - thick * 2)),
          { width: i % 3 === 0 ? thick * 2 : thick },
        );
      }
      d.hand(cx, cy, r * 0.5, "clock.minutes", 720, { width: Math.max(4, thick * 3) });
      d.hand(cx, cy, r * 0.78, "clock.minute", 60, { width: Math.max(3, thick * 2) });
      d.circle(cx, cy, Math.max(4, thick * 2));
      return;
    }
    const pattern = s.hours === "12" ? "h:mm" : "HH:mm";
    const dateH = s.showDate ? Math.max(16, Math.round(d.height * 0.2)) : 0;
    const timeH = d.height - dateH;
    const size = d.fit([s.hours === "12" ? "12:00" : "00:00"], d.width, timeH, { weight: 700 });
    const lh = d.lineHeight(size, 700);
    const block = lh + (dateH ? d.lineHeight(d.fit(["Wednesday, 30 September"], d.width, dateH), 400) : 0);
    const top = Math.max(0, Math.floor((d.height - block) / 2));
    d.text(d.time(pattern), { x: 0, y: top, w: d.width, h: lh, size, weight: 700, align: "center" });
    if (dateH) {
      const ds = d.fit(["Wednesday, 30 September"], d.width, dateH);
      d.text(d.time("dddd, D MMMM"), { x: 0, y: top + lh, w: d.width, h: d.lineHeight(ds), size: ds, align: "center" });
    }
  },
});
