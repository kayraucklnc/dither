// Built-in screens drawn with a compiled-in 5x7 font, for when there is no
// usable blob to draw from.
#pragma once

#include <string_view>

#include "framebuffer.h"

namespace dither {

constexpr int kBuiltinAdvance = 6;  // 5 columns + 1 gap, before scaling
constexpr int kBuiltinHeight = 7;

int builtinTextWidth(std::string_view ascii, int scale);
void drawBuiltinText(const Canvas& c, int x, int y, int scale, std::string_view ascii);

// Title, one line of instructions and a small detail line, centred.
void drawNoticeScreen(Framebuffer& fb, std::string_view title, std::string_view body, std::string_view detail);

// "Not set up - open Dither and flash a configuration".
void drawNotSetUp(Framebuffer& fb, std::string_view detail);

}  // namespace dither
