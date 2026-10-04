// Built with -ffp-contract=off (Makefile, platformio.ini): the smoothed
// curve's Horner evaluation must round after every multiply and add, as
// JavaScript does. A fused multiply-add rounds once and can move a pixel.
#include "chart.h"

#include <algorithm>
#include <cmath>

#include "shapes.h"
#include "timezone.h"  // floorDiv

namespace dither {
namespace {

struct Point {
  int64_t x, y;
};

// The 4x4 Bayer matrix of format.md §4 "chart", area.
constexpr int kBayer[4][4] = {{0, 8, 2, 10}, {12, 4, 14, 6}, {3, 11, 1, 9}, {15, 7, 13, 5}};

// The line's row in each column, visited left to right: linear between the
// points, or the Catmull-Rom curve through them.
class Curve {
 public:
  Curve(const std::vector<Point>& pts, bool smooth, int64_t top, int64_t bottom)
      : pts_(pts), smooth_(smooth), top_(top), bottom_(bottom) {}

  int64_t at(int64_t px) {
    // The first segment that ends at or after px (columns only increase).
    while (seg_ + 2 < pts_.size() && px > pts_[seg_ + 1].x) ++seg_;
    const Point a = pts_[seg_], b = pts_[seg_ + 1];
    if (!smooth_) return b.x == a.x ? a.y : a.y + floorDiv((b.y - a.y) * (px - a.x), b.x - a.x);
    const int64_t p0 = seg_ == 0 ? a.y : pts_[seg_ - 1].y;
    const int64_t p3 = seg_ + 2 < pts_.size() ? pts_[seg_ + 2].y : b.y;
    return catmullRomRow(px, a.x, b.x, p0, a.y, b.y, p3, top_, bottom_);
  }

 private:
  const std::vector<Point>& pts_;
  bool smooth_;
  int64_t top_, bottom_;
  size_t seg_ = 0;
};

void shadeBelow(const Canvas& c, int64_t px, int64_t ly, int64_t floor) {
  const Box& clip = c.clip();
  if (px < clip.x0 || px >= clip.x1) return;
  const int64_t span = std::max<int64_t>(1, floor - ly);
  for (int64_t py = std::max(ly + 1, clip.y0); py < std::min(floor, clip.y1); ++py) {
    const int64_t level = 2 + floorDiv(8 * (floor - py), span);
    if (kBayer[py & 3][px & 3] < level) c.plot(px, py);
  }
}

void drawBars(const Canvas& c, const ChartSpec& s, const std::vector<double>& fracs) {
  const int64_t n = static_cast<int64_t>(fracs.size());
  for (int64_t i = 0; i < n; ++i) {
    const int64_t x0 = s.x + floorDiv(i * s.w, n);
    const int64_t x1 = s.x + floorDiv((i + 1) * s.w, n) - s.gap;
    const int64_t bh = std::max<int64_t>(1, static_cast<int64_t>(std::floor(fracs[static_cast<size_t>(i)] * s.h)));
    c.fillRect(x0, s.y + s.h - bh, x1 - x0, bh);
  }
}

void drawSteps(const Canvas& c, const ChartSpec& s, const std::vector<Point>& pts) {
  for (size_t i = 0; i < pts.size(); ++i) {
    const bool last = i + 1 == pts.size();
    const int64_t nx = last ? s.x + s.w - 1 : pts[i + 1].x;
    drawLine(c, pts[i].x, pts[i].y, nx, pts[i].y, s.lw);
    if (!last) drawLine(c, nx, pts[i].y, nx, pts[i + 1].y, s.lw);
  }
}

void drawSmooth(const Canvas& c, const ChartSpec& s, const std::vector<Point>& pts) {
  const bool area = s.kind == ChartSpec::Kind::Area;
  const int64_t floor = s.y + s.h;
  Curve curve(pts, true, s.y, s.y + s.h - 1);
  // Shading first, then the line over it, as for the straight area.
  if (area) {
    Curve shading(pts, true, s.y, s.y + s.h - 1);
    for (int64_t px = s.x; px < s.x + s.w; ++px) shadeBelow(c, px, shading.at(px), floor);
  }
  int64_t previous = curve.at(s.x);
  for (int64_t px = s.x + 1; px < s.x + s.w; ++px) {
    const int64_t cy = curve.at(px);
    drawLine(c, px - 1, previous, px, cy, s.lw);
    previous = cy;
  }
}

}  // namespace

int64_t catmullRomRow(int64_t px, int64_t x0, int64_t x1, int64_t p0, int64_t p1, int64_t p2, int64_t p3, int64_t top,
                      int64_t bottom) {
  if (x1 == x0) return std::clamp(p1, top, bottom);
  const double t = static_cast<double>(px - x0) / static_cast<double>(x1 - x0);
  const double a = static_cast<double>(2 * p1);
  const double b = static_cast<double>(p2 - p0);
  const double c = static_cast<double>(2 * p0 - 5 * p1 + 4 * p2 - p3);
  const double d = static_cast<double>(3 * p1 - p0 - 3 * p2 + p3);
  const double v = a + t * (b + t * (c + t * d));
  const int64_t row = static_cast<int64_t>(std::round(v / 2));  // half away from zero
  return std::clamp(row, top, bottom);
}

void drawChartSeries(const Canvas& c, const ChartSpec& s, const std::vector<double>& series) {
  if (series.empty()) return;
  double lo = s.min ? *s.min : *std::min_element(series.begin(), series.end());
  double hi = s.max ? *s.max : *std::max_element(series.begin(), series.end());
  if (hi <= lo) hi = lo + 1;
  std::vector<double> fracs;
  for (double v : series) {
    // Finite inputs can still overflow (hi - lo); such a fraction counts as 0.
    const double f = std::clamp((v - lo) / (hi - lo), 0.0, 1.0);
    fracs.push_back(std::isfinite(f) ? f : 0.0);
  }
  if (s.kind == ChartSpec::Kind::Bars) {
    drawBars(c, s, fracs);
    return;
  }
  const int64_t n = static_cast<int64_t>(series.size());
  std::vector<Point> pts;
  for (int64_t i = 0; i < n; ++i) {
    pts.push_back({s.x + floorDiv(i * (s.w - 1), std::max<int64_t>(1, n - 1)),
                   s.y + (s.h - 1) - static_cast<int64_t>(std::floor(fracs[static_cast<size_t>(i)] * (s.h - 1)))});
  }
  if (s.kind == ChartSpec::Kind::Steps) {
    drawSteps(c, s, pts);
    return;
  }
  if (pts.size() < 2) return;  // a line of one point draws nothing
  if (s.smooth) {
    drawSmooth(c, s, pts);
    return;
  }
  if (s.kind == ChartSpec::Kind::Area) {
    Curve shading(pts, false, s.y, s.y + s.h - 1);
    for (int64_t px = s.x; px < s.x + s.w; ++px) shadeBelow(c, px, shading.at(px), s.y + s.h);
  }
  for (size_t i = 1; i < pts.size(); ++i) drawLine(c, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, s.lw);
}

}  // namespace dither
