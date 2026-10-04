import { defineExtension, type Draw } from "../api";

const SIZES: Record<string, number> = { small: 20, medium: 32, large: 48, huge: 80 };

function autoSize(d: Draw, text: string, bold: boolean): number {
  const weight = bold ? 700 : 400;
  for (const size of [128, 96, 80, 64, 48, 40, 32, 28, 24, 20, 16, 14, 12]) {
    if (d.linesFor(text, size, d.width, weight) * d.lineHeight(size, weight) <= d.height) return size;
  }
  return 12;
}

export default defineExtension({
  id: "text",
  name: "Text",
  description: "A heading, a note, anything you type.",
  icon: "type",
  category: "text",
  size: { min: [2, 1], default: [8, 2] },
  fields: [
    { key: "text", label: "Text", kind: "text", multiline: true, placeholder: "Hello" },
    {
      key: "size", label: "Size", kind: "select",
      options: [
        { value: "auto", label: "Fill the box" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" },
        { value: "large", label: "Large" }, { value: "huge", label: "Huge" },
      ],
    },
    { key: "bold", label: "Bold", kind: "toggle" },
    { key: "align", label: "Align", kind: "select", options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
  ],
  defaults: () => ({ text: "Hello", size: "auto", bold: true, align: "left" }),
  draw(d, s) {
    const text = String(s.text ?? "");
    const bold = s.bold === true;
    const size = s.size === "auto" ? autoSize(d, text, bold) : SIZES[String(s.size)] ?? 32;
    d.text(text, {
      x: 0, y: 0, w: d.width, h: d.height, size, weight: bold ? 700 : 400, wrap: true,
      align: (s.align as "left" | "center" | "right") ?? "left", valign: "middle",
    });
  },
});
