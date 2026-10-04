// The 1-bit framebuffer (format.md §4): row-major, rows padded to whole bytes,
// most significant bit first, 1 = black - the same layout as a P4 PBM.
#pragma once

#include <cstdint>
#include <vector>

namespace dither {

class Framebuffer {
 public:
  Framebuffer() = default;
  Framebuffer(int width, int height);

  int width() const { return width_; }
  int height() const { return height_; }
  int stride() const { return (width_ + 7) / 8; }
  const std::vector<uint8_t>& bytes() const { return bytes_; }
  std::vector<uint8_t>& bytes() { return bytes_; }

  void clear();  // all white
  bool get(int x, int y) const;
  void set(int x, int y, bool black);
  void fillSpan(int y, int x0, int x1, bool black);  // [x0, x1), already clipped

 private:
  int width_ = 0, height_ = 0;
  std::vector<uint8_t> bytes_;
};

// Half-open box [x0, x1) x [y0, y1).
struct Box {
  int64_t x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  Box intersect(const Box& o) const;
  bool empty() const { return x0 >= x1 || y0 >= y1; }
};

// Where an element draws: the framebuffer, its colour and its clip box.
// Coordinates are 64-bit so out-of-range JSON numbers cannot overflow.
class Canvas {
 public:
  Canvas(Framebuffer& fb, bool black);
  Canvas withClip(const Box& box) const;
  bool black() const { return black_; }
  const Box& clip() const { return clip_; }

  void plot(int64_t x, int64_t y) const;
  void span(int64_t y, int64_t x0, int64_t x1) const;  // [x0, x1)
  void fillRect(int64_t x, int64_t y, int64_t w, int64_t h) const;
  void plotColor(int64_t x, int64_t y, bool black) const;

 private:
  Framebuffer* fb_;
  bool black_;
  Box clip_;
};

}  // namespace dither
