#include "shapes.h"

#include <algorithm>
#include <cmath>
#include <vector>

#include "timezone.h"  // floorDiv

namespace dither {
namespace {

int64_t clampRadius(int64_t w, int64_t h, int64_t r) {
  return std::max<int64_t>(0, std::min(r, std::min(w, h) / 2));
}

// Largest d with d*d <= n, for n >= 0.
int64_t isqrt(int64_t n) {
  int64_t d = static_cast<int64_t>(std::sqrt(static_cast<double>(n)));
  while (d * d > n) --d;
  while ((d + 1) * (d + 1) <= n) ++d;
  return d;
}

// Half-width of a filled circle's row at vertical distance dy, or -1.
int64_t circleHalfWidth(int64_t r, int64_t dy) {
  int64_t rhs = r * r + r - dy * dy;
  return rhs < 0 ? -1 : isqrt(rhs);
}

// The kept columns of one row of a filled rounded rect: [x0, x1). The radius
// must already be clamped. Returns false when the row is outside the rect.
// In a corner row, the kept pixels are those with (2(r-u)-1)^2 <= 4r^2 - dv^2;
// t = 2(r-u)-1 is odd, so the first kept u comes from the largest odd t
// within that bound.
bool roundRectRow(int64_t x, int64_t y, int64_t w, int64_t h, int64_t r, int64_t py, int64_t& x0,
                  int64_t& x1) {
  if (w <= 0 || h <= 0 || py < y || py >= y + h) return false;
  const int64_t v = std::min(py - y, y + h - 1 - py);
  int64_t u0 = 0;
  if (v < r) {
    const int64_t dv = 2 * (r - v) - 1;
    const int64_t limit = 4 * r * r - dv * dv;
    int64_t t = limit < 1 ? 0 : std::min(isqrt(limit), 2 * r - 1);
    if (t % 2 == 0) --t;
    u0 = t < 1 ? r : r - (t + 1) / 2;
  }
  x0 = x + u0;
  x1 = x + w - u0;
  return x0 < x1;
}

// Rows [y0, y1) of the clip box that a shape spanning [top, bottom) touches.
void visibleRows(const Canvas& c, int64_t top, int64_t bottom, int64_t& y0, int64_t& y1) {
  y0 = std::max(top, c.clip().y0);
  y1 = std::min(bottom, c.clip().y1);
}

}  // namespace

void fillRoundRect(const Canvas& c, int64_t x, int64_t y, int64_t w, int64_t h, int64_t r) {
  if (w <= 0 || h <= 0) return;
  r = clampRadius(w, h, r);
  int64_t y0 = 0, y1 = 0;
  visibleRows(c, y, y + h, y0, y1);
  for (int64_t py = y0; py < y1; ++py) {
    int64_t x0 = 0, x1 = 0;
    if (roundRectRow(x, y, w, h, r, py, x0, x1)) c.span(py, x0, x1);
  }
}

void strokeRoundRect(const Canvas& c, int64_t x, int64_t y, int64_t w, int64_t h, int64_t r, int64_t s) {
  if (w <= 0 || h <= 0) return;
  r = clampRadius(w, h, r);
  const int64_t ix = x + s, iy = y + s, iw = w - 2 * s, ih = h - 2 * s;
  const bool inner = iw > 0 && ih > 0;
  const int64_t ir = inner ? clampRadius(iw, ih, std::max<int64_t>(0, r - s)) : 0;
  int64_t y0 = 0, y1 = 0;
  visibleRows(c, y, y + h, y0, y1);
  for (int64_t py = y0; py < y1; ++py) {
    int64_t x0 = 0, x1 = 0;
    if (!roundRectRow(x, y, w, h, r, py, x0, x1)) continue;
    int64_t i0 = 0, i1 = 0;
    if (inner && roundRectRow(ix, iy, iw, ih, ir, py, i0, i1)) {
      c.span(py, x0, std::min(x1, i0));
      c.span(py, std::max(x0, i1), x1);
    } else {
      c.span(py, x0, x1);
    }
  }
}

void fillCircle(const Canvas& c, int64_t cx, int64_t cy, int64_t r) {
  if (r < 0) return;
  int64_t y0 = 0, y1 = 0;
  visibleRows(c, cy - r, cy + r + 1, y0, y1);
  for (int64_t dy = y0 - cy; dy < y1 - cy; ++dy) {
    int64_t d = circleHalfWidth(r, dy);
    if (d >= 0) c.span(cy + dy, cx - d, cx + d + 1);
  }
}

void strokeCircle(const Canvas& c, int64_t cx, int64_t cy, int64_t r, int64_t s) {
  if (r < 0) return;
  const int64_t ri = r - s;
  int64_t y0 = 0, y1 = 0;
  visibleRows(c, cy - r, cy + r + 1, y0, y1);
  for (int64_t dy = y0 - cy; dy < y1 - cy; ++dy) {
    int64_t d = circleHalfWidth(r, dy);
    if (d < 0) continue;
    int64_t di = ri >= 0 && dy >= -ri && dy <= ri ? circleHalfWidth(ri, dy) : -1;
    if (di < 0) {
      c.span(cy + dy, cx - d, cx + d + 1);
    } else {
      c.span(cy + dy, cx - d, cx - di);
      c.span(cy + dy, cx + di + 1, cx + d + 1);
    }
  }
}

void drawLine(const Canvas& c, int64_t x1, int64_t y1, int64_t x2, int64_t y2, int64_t w) {
  if (w <= 0 || c.clip().empty()) return;
  // Each Bresenham point stamps a w x w square at (px - k, py - k). The line
  // is monotonic in x and in y and moves at most one pixel per step, so the
  // points touching any one row form a contiguous run and their squares
  // cover [min px - k, max px - k + w) of it. So: note the px where each
  // visible row's run starts and ends, then fill one span per row. The work
  // is bounded by the line length plus the clip height, whatever w is.
  const int64_t k = floorDiv(w - 1, 2);
  const Box& clip = c.clip();
  const size_t rows = static_cast<size_t>(clip.y1 - clip.y0);
  std::vector<int64_t> first(rows), last(rows);
  std::vector<bool> touched(rows, false);
  auto rangeOf = [&](int64_t py, int64_t& a, int64_t& b) {
    a = std::max(py - k, clip.y0);
    b = std::min(py - k + w, clip.y1);
  };
  auto index = [&](int64_t row) { return static_cast<size_t>(row - clip.y0); };

  const int64_t dx = x2 > x1 ? x2 - x1 : x1 - x2;
  const int64_t dy = -(y2 > y1 ? y2 - y1 : y1 - y2);
  const int64_t sx = x1 < x2 ? 1 : -1;
  const int64_t sy = y1 < y2 ? 1 : -1;
  int64_t err = dx + dy;
  int64_t x = x1, y = y1;
  int64_t a = 0, b = 0;
  rangeOf(y, a, b);
  for (int64_t row = a; row < b; ++row) first[index(row)] = x, touched[index(row)] = true;
  while (!(x == x2 && y == y2)) {
    const int64_t px = x;
    const int64_t e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    int64_t na = 0, nb = 0;
    rangeOf(y, na, nb);
    for (int64_t row = a; row < b; ++row) {  // rows leaving: at most one
      if (row >= na && row < nb) {
        row = std::max(row, nb - 1);  // skip the rows that stay
        continue;
      }
      last[index(row)] = px;
    }
    for (int64_t row = na; row < nb; ++row) {  // rows entering: at most one
      if (row >= a && row < b) {
        row = std::max(row, b - 1);
        continue;
      }
      first[index(row)] = x, touched[index(row)] = true;
    }
    a = na, b = nb;
  }
  for (int64_t row = a; row < b; ++row) last[index(row)] = x;
  for (size_t i = 0; i < rows; ++i) {
    if (!touched[i]) continue;
    const int64_t lo = std::min(first[i], last[i]), hi = std::max(first[i], last[i]);
    c.span(clip.y0 + static_cast<int64_t>(i), lo - k, hi - k + w);
  }
}

}  // namespace dither
