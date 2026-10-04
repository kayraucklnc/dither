// DFNT fonts and DBMP bitmaps (format.md §3), read in place from the blob.
#pragma once

#include <cstdint>
#include <optional>

#include "bytes.h"
#include "framebuffer.h"

namespace dither {

struct Glyph {
  uint32_t codepoint = 0;
  const uint8_t* bits = nullptr;  // null when the record points outside the font
  int width = 0, height = 0;
  int xOffset = 0, yOffset = 0;
  int advance = 0;
};

class Font {
 public:
  static std::optional<Font> parse(ByteSpan asset);

  int lineHeight() const { return lineHeight_; }
  int ascent() const { return ascent_; }
  int descent() const { return descent_; }
  std::optional<Glyph> find(uint32_t codepoint) const;

 private:
  ByteSpan data_;
  int lineHeight_ = 0, ascent_ = 0, descent_ = 0;
  uint32_t count_ = 0;
};

struct Bitmap {
  int width = 0, height = 0;
  bool opaque = false;
  const uint8_t* rows = nullptr;
  static std::optional<Bitmap> parse(ByteSpan asset);
};

// Set bits in the canvas colour; clear bits untouched.
void drawMask(const Canvas& c, const uint8_t* bits, int width, int height, int64_t x, int64_t y);
void drawBitmap(const Canvas& c, const Bitmap& bmp, int64_t x, int64_t y);

}  // namespace dither
