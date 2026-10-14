#include "framebuffer.h"

#include <algorithm>

namespace dither {

Framebuffer::Framebuffer(int width, int height)
    : width_(std::max(width, 0)),
      height_(std::max(height, 0)),
      bytes_(static_cast<size_t>(stride()) * static_cast<size_t>(height_), 0) {}

void Framebuffer::clear() {
  std::fill(bytes_.begin(), bytes_.end(), 0);
}

bool Framebuffer::get(int x, int y) const {
  if (x < 0 || y < 0 || x >= width_ || y >= height_) return false;
  return (bytes_[static_cast<size_t>(y * stride() + x / 8)] >> (7 - x % 8)) & 1;
}

void Framebuffer::set(int x, int y, bool black) {
  if (x < 0 || y < 0 || x >= width_ || y >= height_) return;
  uint8_t& b = bytes_[static_cast<size_t>(y * stride() + x / 8)];
  uint8_t mask = static_cast<uint8_t>(0x80 >> (x % 8));
  b = black ? (b | mask) : (b & ~mask);
}

void Framebuffer::fillSpan(int y, int x0, int x1, bool black) {
  uint8_t* row = bytes_.data() + static_cast<size_t>(y * stride());
  for (int x = x0; x < x1;) {
    if (x % 8 == 0 && x + 8 <= x1) {
      row[x / 8] = black ? 0xFF : 0x00;
      x += 8;
      continue;
    }
    uint8_t mask = static_cast<uint8_t>(0x80 >> (x % 8));
    row[x / 8] = black ? (row[x / 8] | mask) : (row[x / 8] & ~mask);
    ++x;
  }
}

Box Box::intersect(const Box& o) const {
  return {std::max(x0, o.x0), std::max(y0, o.y0), std::min(x1, o.x1), std::min(y1, o.y1)};
}

Canvas::Canvas(Framebuffer& fb, bool black, int64_t dx, int64_t dy)
    : fb_(&fb), black_(black), dx_(dx), dy_(dy), clip_{-dx, -dy, fb.width() - dx, fb.height() - dy} {}

Canvas Canvas::withClip(const Box& box) const {
  Canvas c = *this;
  c.clip_ = clip_.intersect(box);
  return c;
}

Canvas Canvas::withColor(bool black) const {
  Canvas c = *this;
  c.black_ = black;
  return c;
}

void Canvas::plotColor(int64_t x, int64_t y, bool black) const {
  if (x < clip_.x0 || x >= clip_.x1 || y < clip_.y0 || y >= clip_.y1) return;
  fb_->set(static_cast<int>(x + dx_), static_cast<int>(y + dy_), black);
}

void Canvas::plot(int64_t x, int64_t y) const {
  plotColor(x, y, black_);
}

void Canvas::span(int64_t y, int64_t x0, int64_t x1) const {
  if (y < clip_.y0 || y >= clip_.y1) return;
  x0 = std::max(x0, clip_.x0);
  x1 = std::min(x1, clip_.x1);
  if (x0 >= x1) return;
  fb_->fillSpan(static_cast<int>(y + dy_), static_cast<int>(x0 + dx_), static_cast<int>(x1 + dx_), black_);
}

void Canvas::fillRect(int64_t x, int64_t y, int64_t w, int64_t h) const {
  if (w <= 0 || h <= 0) return;
  int64_t y0 = std::max(y, clip_.y0), y1 = std::min(y + h, clip_.y1);
  for (int64_t row = y0; row < y1; ++row) span(row, x, x + w);
}

}  // namespace dither
