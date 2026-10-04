// Builders for synthetic fonts, bitmaps and blobs, plus framebuffer dumps.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "../src/runtime/crc32.h"
#include "../src/runtime/framebuffer.h"

namespace testutil {

inline void putU16(std::vector<uint8_t>& b, size_t at, uint32_t v) {
  b[at] = static_cast<uint8_t>(v);
  b[at + 1] = static_cast<uint8_t>(v >> 8);
}

inline void putU32(std::vector<uint8_t>& b, size_t at, uint32_t v) {
  for (int i = 0; i < 4; ++i) b[at + static_cast<size_t>(i)] = static_cast<uint8_t>(v >> (8 * i));
}

struct GlyphSpec {
  uint32_t cp;
  int width, height, xOffset, yOffset, advance;
  // Rows of '#'/'.' characters; empty means solid ink.
  std::vector<std::string> rows;
};

// A DFNT asset. Glyphs must be given sorted by codepoint.
inline std::vector<uint8_t> makeFont(int lineHeight, int ascent, int descent, const std::vector<GlyphSpec>& glyphs) {
  std::vector<uint8_t> b(16 + 20 * glyphs.size(), 0);
  b[0] = 'D', b[1] = 'F', b[2] = 'N', b[3] = 'T', b[4] = 1;
  putU16(b, 6, static_cast<uint32_t>(lineHeight));
  putU16(b, 8, static_cast<uint32_t>(ascent));
  putU16(b, 10, static_cast<uint32_t>(descent));
  putU16(b, 12, static_cast<uint32_t>(glyphs.size()));
  for (size_t i = 0; i < glyphs.size(); ++i) {
    const GlyphSpec& g = glyphs[i];
    size_t rec = 16 + 20 * i;
    putU32(b, rec, g.cp);
    putU32(b, rec + 4, static_cast<uint32_t>(b.size()));
    putU16(b, rec + 8, static_cast<uint32_t>(g.width));
    putU16(b, rec + 10, static_cast<uint32_t>(g.height));
    putU16(b, rec + 12, static_cast<uint32_t>(static_cast<uint16_t>(g.xOffset)));
    putU16(b, rec + 14, static_cast<uint32_t>(static_cast<uint16_t>(g.yOffset)));
    putU16(b, rec + 16, static_cast<uint32_t>(g.advance));
    size_t stride = static_cast<size_t>((g.width + 7) / 8);
    for (int y = 0; y < g.height; ++y) {
      std::vector<uint8_t> row(stride, 0);
      for (int x = 0; x < g.width; ++x) {
        bool ink = g.rows.empty() || (static_cast<size_t>(y) < g.rows.size() &&
                                      static_cast<size_t>(x) < g.rows[static_cast<size_t>(y)].size() &&
                                      g.rows[static_cast<size_t>(y)][static_cast<size_t>(x)] == '#');
        if (ink) row[static_cast<size_t>(x / 8)] |= static_cast<uint8_t>(0x80 >> (x % 8));
      }
      b.insert(b.end(), row.begin(), row.end());
    }
  }
  return b;
}

// A DBMP asset from rows of '#'/'.'.
inline std::vector<uint8_t> makeBitmap(const std::vector<std::string>& rows, bool opaque) {
  int w = rows.empty() ? 0 : static_cast<int>(rows[0].size());
  std::vector<uint8_t> b(12, 0);
  b[0] = 'D', b[1] = 'B', b[2] = 'M', b[3] = 'P';
  putU16(b, 4, static_cast<uint32_t>(w));
  putU16(b, 6, static_cast<uint32_t>(rows.size()));
  b[8] = opaque ? 1 : 0;
  for (const auto& r : rows) {
    std::vector<uint8_t> row(static_cast<size_t>((w + 7) / 8), 0);
    for (int x = 0; x < w; ++x) {
      if (r[static_cast<size_t>(x)] == '#') row[static_cast<size_t>(x / 8)] |= static_cast<uint8_t>(0x80 >> (x % 8));
    }
    b.insert(b.end(), row.begin(), row.end());
  }
  return b;
}

inline void align4(std::vector<uint8_t>& b) {
  while (b.size() % 4) b.push_back(0);
}

// A valid blob. `runtimeJson` may contain "@ASSETS@", replaced by the
// assets' [offset, length] list.
inline std::vector<uint8_t> makeBlob(std::string runtimeJson, const std::vector<std::vector<uint8_t>>& assets = {}) {
  std::vector<uint8_t> b(48, 0);
  std::string table = "[";
  size_t assetsStart = b.size();
  for (size_t i = 0; i < assets.size(); ++i) {
    table += (i ? "," : "") + std::string("[") + std::to_string(b.size()) + "," + std::to_string(assets[i].size()) + "]";
    b.insert(b.end(), assets[i].begin(), assets[i].end());
    align4(b);
  }
  table += "]";
  size_t assetsLength = b.size() - assetsStart;
  size_t at = runtimeJson.find("@ASSETS@");
  if (at != std::string::npos) runtimeJson.replace(at, 8, table);
  size_t runtimeOffset = b.size();
  b.insert(b.end(), runtimeJson.begin(), runtimeJson.end());
  align4(b);
  b[0] = 'D', b[1] = 'T', b[2] = 'H', b[3] = 'R';
  putU16(b, 4, 1);
  putU16(b, 6, 48);
  putU32(b, 8, static_cast<uint32_t>(b.size()));
  putU32(b, 16, static_cast<uint32_t>(runtimeOffset));
  putU32(b, 20, static_cast<uint32_t>(runtimeJson.size()));
  putU32(b, 32, assets.empty() ? 0 : static_cast<uint32_t>(assetsStart));
  putU32(b, 36, static_cast<uint32_t>(assetsLength));
  putU32(b, 40, 1767225600);
  putU32(b, 12, dither::crc32(b.data() + 48, b.size() - 48));
  return b;
}

// Rows of '#'/'.' for the box [x0, x1) x [y0, y1).
inline std::vector<std::string> dump(const dither::Framebuffer& fb, int x0, int y0, int x1, int y1) {
  std::vector<std::string> rows;
  for (int y = y0; y < y1; ++y) {
    std::string r;
    for (int x = x0; x < x1; ++x) r += fb.get(x, y) ? '#' : '.';
    rows.push_back(r);
  }
  return rows;
}

inline int countInk(const dither::Framebuffer& fb) {
  int n = 0;
  for (int y = 0; y < fb.height(); ++y)
    for (int x = 0; x < fb.width(); ++x) n += fb.get(x, y);
  return n;
}

}  // namespace testutil
