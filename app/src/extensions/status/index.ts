import { defineExtension } from "../api";

export default defineExtension({
  id: "status",
  name: "Panel status",
  description: "Battery (where the board can tell), Wi-Fi and when the panel last woke.",
  icon: "battery-medium",
  category: "device",
  size: { min: [3, 1], default: [6, 1] },
  fields: [{ key: "showTime", label: "Show the last update", kind: "toggle" }],
  defaults: () => ({ showTime: true }),
  draw(d, s) {
    const h = d.height;
    const size = d.fit(["100%  Updated 23:59"], d.width - 2 * h, h, { max: 24 });
    // Not every board can measure its battery; then the Wi-Fi mark moves left.
    const batteryW = h + 12 + d.measure("100%", size);
    d.when({ v: "device.battery", op: "present" }, () => {
      d.iconFor("device.battery", { steps: { t: [20, 50, 80], o: ["battery-low", "battery-medium", "battery-full", "battery-full"] } },
        ["battery-low", "battery-medium", "battery-full"], { x: 0, y: 0, w: h, h });
      d.text([{ v: "device.battery", f: { num: { d: 0 } } }, "%"], { x: h + 4, y: 0, w: batteryW - h - 4, h, size, valign: "middle" });
    });
    for (const [battery, x] of [["present", batteryW], ["absent", 0]] as const) {
      d.when({ all: [{ v: "device.battery", op: battery }, { v: "device.online", op: "true" }] }, () => d.icon("wifi", { x, y: 0, w: h, h }));
      d.when({ all: [{ v: "device.battery", op: battery }, { v: "device.online", op: "false" }] }, () => d.icon("wifi-off", { x, y: 0, w: h, h }));
    }
    if (s.showTime) d.text(["Updated ", d.time("HH:mm")], { x: 0, y: 0, w: d.width, h, size, align: "right", valign: "middle" });
  },
});
