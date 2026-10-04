#pragma once

#include "framebuffer.h"

namespace dither {

// The panel image is the logical one turned `rotation` degrees clockwise
// (like Adafruit GFX setRotation): logical (x, y) at rotation 90 lands on
// panel (H - 1 - y, x), where H is the logical height.
// Takes the frame by value so rotation 0 is a move, not a 48 KB copy.
Framebuffer rotateToPanel(Framebuffer logical, int rotation);

}  // namespace dither
