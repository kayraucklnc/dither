import { defineExtension } from "../api";

export default defineExtension({
  id: "picture",
  name: "Picture",
  description: "A photo or drawing, dithered for e-ink.",
  icon: "image",
  category: "picture",
  size: { min: [2, 2], default: [8, 6] },
  fields: [
    { key: "image", label: "Picture", kind: "image" },
    { key: "fit", label: "Fit", kind: "select", options: [{ value: "cover", label: "Fill the box" }, { value: "contain", label: "Show it whole" }] },
    {
      key: "dither", label: "Shading", kind: "select",
      options: [{ value: "floyd", label: "Smooth (Floyd–Steinberg)" }, { value: "atkinson", label: "Crisp (Atkinson)" }, { value: "threshold", label: "Black and white" }],
    },
    { key: "contrast", label: "Contrast", kind: "number", min: -100, max: 100, step: 10 },
    { key: "brightness", label: "Brightness", kind: "number", min: -100, max: 100, step: 10 },
  ],
  defaults: () => ({ image: "", fit: "cover", dither: "floyd", contrast: 0, brightness: 0 }),
  draw(d, s) {
    const id = String(s.image ?? "");
    if (!id) {
      d.rect({ x: 0, y: 0, w: d.width, h: d.height }, { fill: false, stroke: 2, radius: 8 });
      d.icon("sparkles", { x: 0, y: 0, w: d.width, h: Math.round(d.height * 0.7) });
      d.text("Choose a picture", { x: 0, y: Math.round(d.height * 0.65), w: d.width, h: Math.round(d.height * 0.3), size: 20, align: "center", valign: "top" });
      return;
    }
    d.image(id, { x: 0, y: 0, w: d.width, h: d.height }, {
      fit: s.fit === "contain" ? "contain" : "cover",
      dither: (s.dither as "floyd" | "atkinson" | "threshold") ?? "floyd",
      contrast: Number(s.contrast) || 0,
      brightness: Number(s.brightness) || 0,
    });
  },
});
