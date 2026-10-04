#include "rotate.h"

namespace dither {

Framebuffer rotateToPanel(Framebuffer logical, int rotation) {
  const int w = logical.width(), h = logical.height();
  if (rotation == 0) return logical;
  const bool quarter = rotation == 90 || rotation == 270;
  Framebuffer out(quarter ? h : w, quarter ? w : h);
  for (int y = 0; y < h; ++y) {
    for (int x = 0; x < w; ++x) {
      if (!logical.get(x, y)) continue;
      switch (rotation) {
        case 90: out.set(h - 1 - y, x, true); break;
        case 180: out.set(w - 1 - x, h - 1 - y, true); break;
        default: out.set(y, w - 1 - x, true); break;  // 270
      }
    }
  }
  return out;
}

}  // namespace dither
