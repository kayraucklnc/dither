import { useEffect, useRef } from "react";
import type { Framebuffer } from "@/runtime/framebuffer";

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PanelCanvasProps {
  fb: Framebuffer | null;
  className?: string;
  crop?: Crop;
}

// E-ink paper and ink, slightly warm so the preview reads as a panel, not a PNG.
const PAPER = [235, 232, 224];
const INK = [28, 28, 30];

export function PanelCanvas({ fb, className, crop }: PanelCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !fb) return;
    const c = crop ?? { x: 0, y: 0, w: fb.width, h: fb.height };
    canvas.width = c.w;
    canvas.height = c.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(c.w, c.h);
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const sx = x + c.x;
        const sy = y + c.y;
        const ink = sx >= 0 && sy >= 0 && sx < fb.width && sy < fb.height && fb.get(sx, sy);
        const px = ink ? INK : PAPER;
        const i = (y * c.w + x) * 4;
        img.data[i] = px[0];
        img.data[i + 1] = px[1];
        img.data[i + 2] = px[2];
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [fb, crop]);

  return <canvas ref={ref} className={className} style={{ imageRendering: "pixelated" }} />;
}
