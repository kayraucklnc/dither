import type { Panel } from "@/lib/render";

/**
 * The panel a preview is drawn for when no device has been chosen yet.
 * og_plus is the common TRMNL screen and the one worth designing against.
 */
export const DEFAULT_PANEL: Panel = {
  width: 800,
  height: 480,
  bitDepth: 1,
  colors: 2,
  colorCodes: [],
  mode: "dither",
  rotation: 0,
};

export function panelFor(model: {
  width: number;
  height: number;
  bitDepth: number;
  colors: number;
  colorCodes: string[];
  mode: string;
  rotation: number;
}): Panel {
  return {
    width: model.width,
    height: model.height,
    bitDepth: model.bitDepth,
    colors: model.colors,
    colorCodes: model.colorCodes,
    mode: model.mode,
    rotation: model.rotation,
  };
}
