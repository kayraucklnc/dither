#include "notice_screen.h"

#include <cstdint>

namespace dither {
namespace {

const uint8_t kFont[] = {
#include "builtin_font_data.inc"
};

// The Dither mark, the same grid as app/src/ui/Mark.tsx (row 0 first, # = ink).
const char* const kMark[16] = {
    "####.#.#.#.#.#.#",
    "#########.###.#.",
    "##.###.#.#.#.#.#",
    "###########.#.#.",
    ".#.#.#.#.#.#...#",
    "#####.###.#.#.#.",
    "##.#.#.#.#.#.#..",
    "#######.#.#.#.#.",
    ".#.#.#.#...#....",
    "#.###.#.#.#.#.#.",
    ".#.#.#.#.#......",
    "###.#.#.#.#.#.#.",
    ".#.#...#........",
    "#.#.#.#.#.#...#.",
    ".#.#.#..........",
    "#.#.#.#.#.#.#...",
};

void drawMark(const Canvas& c, int x, int y, int scale) {
  for (int row = 0; row < 16; ++row) {
    for (int col = 0; col < 16; ++col) {
      if (kMark[row][col] == '#') c.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

void drawChar(const Canvas& c, int x, int y, int scale, char ch) {
  if (ch < 0x20 || ch > 0x7E) ch = '?';
  const uint8_t* cols = kFont + (ch - 0x20) * 5;
  for (int col = 0; col < 5; ++col) {
    for (int row = 0; row < kBuiltinHeight; ++row) {
      if ((cols[col] >> row) & 1) c.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

void drawCentred(const Canvas& c, int width, int y, int scale, std::string_view text) {
  drawBuiltinText(c, (width - builtinTextWidth(text, scale)) / 2, y, scale, text);
}

}  // namespace

int builtinTextWidth(std::string_view ascii, int scale) {
  return ascii.empty() ? 0 : (static_cast<int>(ascii.size()) * kBuiltinAdvance - 1) * scale;
}

void drawBuiltinText(const Canvas& c, int x, int y, int scale, std::string_view ascii) {
  for (char ch : ascii) {
    drawChar(c, x, y, scale, ch);
    x += kBuiltinAdvance * scale;
  }
}

void drawNoticeScreen(Framebuffer& fb, std::string_view title, std::string_view body, std::string_view detail) {
  fb.clear();
  const Canvas ink(fb, true);
  const int w = fb.width(), h = fb.height();
  constexpr int kMarkScale = 8, kTitleScale = 6, kBodyScale = 3, kDetailScale = 2;
  constexpr int kMarkSize = 16 * kMarkScale;
  constexpr int kGap = 28;
  // Mark, title and body as one block, centred a little above the middle.
  const int block = kMarkSize + kGap + kBuiltinHeight * kTitleScale + kGap + kBuiltinHeight * kBodyScale;
  const int top = (h - block) / 2 - 16;
  drawMark(ink, (w - kMarkSize) / 2, top, kMarkScale);
  const int titleY = top + kMarkSize + kGap;
  drawCentred(ink, w, titleY, kTitleScale, title);
  drawCentred(ink, w, titleY + kBuiltinHeight * kTitleScale + kGap, kBodyScale, body);
  drawCentred(ink, w, h - 24 - kBuiltinHeight * kDetailScale, kDetailScale, detail);
}

void drawNotSetUp(Framebuffer& fb, std::string_view detail) {
  drawNoticeScreen(fb, "Not set up", "Open Dither and flash a configuration", detail);
}

}  // namespace dither
