#include "assets.h"

#include <algorithm>
#include <cstring>

namespace dither {
namespace {

constexpr size_t kFontHeader = 16;
constexpr size_t kGlyphRecord = 20;
constexpr size_t kBitmapHeader = 12;

size_t rowBytes(int width) {
  return static_cast<size_t>((width + 7) / 8);
}

}  // namespace

std::optional<Font> Font::parse(ByteSpan a) {
  if (a.data == nullptr || a.size < kFontHeader || std::memcmp(a.data, "DFNT", 4) != 0 || a.data[4] != 1) {
    return std::nullopt;
  }
  Font f;
  f.data_ = a;
  f.lineHeight_ = readU16(a.data + 6);
  f.ascent_ = readI16(a.data + 8);
  f.descent_ = readI16(a.data + 10);
  f.count_ = readU16(a.data + 12);
  if (!a.contains(kFontHeader, f.count_ * kGlyphRecord)) return std::nullopt;
  return f;
}

std::optional<Glyph> Font::find(uint32_t cp) const {
  uint32_t lo = 0, hi = count_;
  while (lo < hi) {
    uint32_t mid = lo + (hi - lo) / 2;
    const uint8_t* rec = data_.data + kFontHeader + mid * kGlyphRecord;
    uint32_t c = readU32(rec);
    if (c < cp) {
      lo = mid + 1;
    } else if (c > cp) {
      hi = mid;
    } else {
      Glyph g;
      g.codepoint = c;
      uint32_t offset = readU32(rec + 4);
      g.width = readU16(rec + 8);
      g.height = readU16(rec + 10);
      g.xOffset = readI16(rec + 12);
      g.yOffset = readI16(rec + 14);
      g.advance = readU16(rec + 16);
      if (data_.contains(offset, rowBytes(g.width) * static_cast<size_t>(g.height))) g.bits = data_.data + offset;
      return g;
    }
  }
  return std::nullopt;
}

std::optional<Bitmap> Bitmap::parse(ByteSpan a) {
  if (a.data == nullptr || a.size < kBitmapHeader || std::memcmp(a.data, "DBMP", 4) != 0) return std::nullopt;
  Bitmap b;
  b.width = readU16(a.data + 4);
  b.height = readU16(a.data + 6);
  b.opaque = a.data[8] == 1;
  if (!a.contains(kBitmapHeader, rowBytes(b.width) * static_cast<size_t>(b.height))) return std::nullopt;
  b.rows = a.data + kBitmapHeader;
  return b;
}

namespace {

// The rows and columns of a width x height image at (x, y) that the clip
// box can show.
struct Visible {
  int64_t row0, row1, col0, col1;
};

Visible visible(const Canvas& c, int width, int height, int64_t x, int64_t y) {
  const Box& b = c.clip();
  return {std::max<int64_t>(0, b.y0 - y), std::min<int64_t>(height, b.y1 - y), std::max<int64_t>(0, b.x0 - x),
          std::min<int64_t>(width, b.x1 - x)};
}

}  // namespace

void drawMask(const Canvas& c, const uint8_t* bits, int width, int height, int64_t x, int64_t y) {
  if (bits == nullptr) return;
  const size_t stride = rowBytes(width);
  const Visible v = visible(c, width, height, x, y);
  for (int64_t row = v.row0; row < v.row1; ++row) {
    const uint8_t* r = bits + stride * static_cast<size_t>(row);
    for (int64_t col = v.col0; col < v.col1; ++col) {
      if ((r[col / 8] >> (7 - col % 8)) & 1) c.plot(x + col, y + row);
    }
  }
}

void drawBitmap(const Canvas& c, const Bitmap& bmp, int64_t x, int64_t y) {
  if (!bmp.opaque) {
    drawMask(c, bmp.rows, bmp.width, bmp.height, x, y);
    return;
  }
  const size_t stride = rowBytes(bmp.width);
  const Visible v = visible(c, bmp.width, bmp.height, x, y);
  for (int64_t row = v.row0; row < v.row1; ++row) {
    const uint8_t* r = bmp.rows + stride * static_cast<size_t>(row);
    for (int64_t col = v.col0; col < v.col1; ++col) {
      c.plotColor(x + col, y + row, (r[col / 8] >> (7 - col % 8)) & 1);
    }
  }
}

}  // namespace dither
