// Geometric primitives (format.md §4). Each one is defined pixel by pixel in
// the spec; these produce exactly that set, a row span at a time.
#pragma once

#include <cstdint>

#include "framebuffer.h"

namespace dither {

void fillRoundRect(const Canvas& c, int64_t x, int64_t y, int64_t w, int64_t h, int64_t r);
void strokeRoundRect(const Canvas& c, int64_t x, int64_t y, int64_t w, int64_t h, int64_t r, int64_t s);
void fillCircle(const Canvas& c, int64_t cx, int64_t cy, int64_t r);
void strokeCircle(const Canvas& c, int64_t cx, int64_t cy, int64_t r, int64_t s);
void drawLine(const Canvas& c, int64_t x1, int64_t y1, int64_t x2, int64_t y2, int64_t w);

}  // namespace dither
