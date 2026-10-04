// Text layout and drawing (format.md §4 "Text").
#pragma once

#include <cstdint>
#include <string_view>
#include <vector>

#include "assets.h"
#include "framebuffer.h"

namespace dither {

using GlyphRun = std::vector<Glyph>;

struct TextLine {
  GlyphRun glyphs;
  int64_t width = 0;
};

struct TextBox {
  int64_t x = 0, y = 0, w = 0, h = 0;
  char align = 'l';   // l c r
  char valign = 't';  // t m b
  bool wrap = false;
  int maxLines = 0;  // 0: no limit
};

int64_t runWidth(const GlyphRun& run);

// Steps 2-4: codepoints to glyphs, then lines.
std::vector<TextLine> layoutText(const Font& font, std::string_view utf8, const TextBox& box);

// Steps 5-7: places the lines and draws them clipped to the box.
void drawTextLines(const Canvas& c, const Font& font, const std::vector<TextLine>& lines, const TextBox& box);

}  // namespace dither
