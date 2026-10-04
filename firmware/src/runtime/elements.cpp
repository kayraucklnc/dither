#include "elements.h"

#include <algorithm>
#include <cmath>
#include <vector>

#include "assets.h"
#include "noinline.h"
#include "condition.h"
#include "shapes.h"
#include "text.h"
#include "timezone.h"  // floorDiv

namespace dither {
namespace {

constexpr double kPi = 3.141592653589793;  // Math.PI
constexpr int kCoordLimit = 32767;

// Coordinates are integers; anything else falls back, and the range is
// bounded so a stray huge number cannot stall a Bresenham loop.
int64_t field(JsonView el, const char* name, int64_t fallback) {
  JsonView v = el[name];
  if (!v.isNumber() || !std::isfinite(v.number())) return fallback;
  return static_cast<int64_t>(std::clamp<double>(v.number(), -kCoordLimit, kCoordLimit));
}

const ByteSpan* asset(const RenderContext& ctx, JsonView index) {
  if (!index.isNumber() || ctx.assets == nullptr) return nullptr;
  int i = index.integer(-1);
  if (i < 0 || static_cast<size_t>(i) >= ctx.assets->size()) return nullptr;
  return &(*ctx.assets)[static_cast<size_t>(i)];
}

const Value& reference(const RenderContext& ctx, JsonView el) {
  return ctx.values->get(el["v"].string());
}

DITHER_NOINLINE void drawRect(const Canvas& c, JsonView el) {
  int64_t x = field(el, "x", 0), y = field(el, "y", 0), w = field(el, "w", 0), h = field(el, "h", 0);
  int64_t r = field(el, "r", 0);
  if (el["fill"].boolean(true)) {
    fillRoundRect(c, x, y, w, h, r);
  } else {
    strokeRoundRect(c, x, y, w, h, r, field(el, "stroke", 1));
  }
}

DITHER_NOINLINE void drawCircleElement(const Canvas& c, JsonView el) {
  int64_t x = field(el, "x", 0), y = field(el, "y", 0), r = field(el, "r", 0);
  if (el["fill"].boolean(true)) {
    fillCircle(c, x, y, r);
  } else {
    strokeCircle(c, x, y, r, field(el, "stroke", 1));
  }
}

DITHER_NOINLINE void drawLineElement(const Canvas& c, JsonView el) {
  drawLine(c, field(el, "x1", 0), field(el, "y1", 0), field(el, "x2", 0), field(el, "y2", 0), field(el, "w", 1));
}

DITHER_NOINLINE void drawHand(const Canvas& c, JsonView el, const RenderContext& ctx) {
  const Value& v = reference(ctx, el);
  double max = el["max"].number(0);
  if (!v.isNumber() || !(max > 0)) return;
  double a = 2.0 * kPi * v.asNumber() / max;
  double len = static_cast<double>(field(el, "len", 0));
  double ex = std::round(std::sin(a) * len), ey = std::round(std::cos(a) * len);
  if (!std::isfinite(ex) || !std::isfinite(ey)) return;
  int64_t x = field(el, "x", 0), y = field(el, "y", 0);
  drawLine(c, x, y, x + static_cast<int64_t>(ex), y - static_cast<int64_t>(ey), field(el, "w", 1));
}

DITHER_NOINLINE void drawBar(const Canvas& c, JsonView el, const RenderContext& ctx) {
  const Value& v = reference(ctx, el);
  JsonView minV = el["min"], maxV = el["max"];
  if (!v.isNumber() || !minV.isNumber() || !maxV.isNumber() || maxV.number() <= minV.number()) return;
  double f = std::clamp((v.asNumber() - minV.number()) / (maxV.number() - minV.number()), 0.0, 1.0);
  if (!std::isfinite(f)) return;
  int64_t x = field(el, "x", 0), y = field(el, "y", 0), w = field(el, "w", 0), h = field(el, "h", 0);
  if (el["dir"].string() == "u") {
    int64_t fh = static_cast<int64_t>(std::floor(f * static_cast<double>(h)));
    c.fillRect(x, y + h - fh, w, fh);
  } else {
    c.fillRect(x, y, static_cast<int64_t>(std::floor(f * static_cast<double>(w))), h);
  }
}

struct ChartPoint {
  int64_t x, y;
};

// The 4x4 Bayer matrix of format.md §4 "chart", area.
constexpr int kBayer[4][4] = {{0, 8, 2, 10}, {12, 4, 14, 6}, {3, 11, 1, 9}, {15, 7, 13, 5}};

// Dithered shading under the line: denser near it, fading towards `bottom`.
void shadeUnder(const Canvas& c, const std::vector<ChartPoint>& pts, int64_t x, int64_t w, int64_t bottom) {
  const Box& clip = c.clip();
  size_t seg = 0;
  for (int64_t px = x; px < x + w; ++px) {
    while (seg + 2 < pts.size() && px > pts[seg + 1].x) ++seg;  // the first segment ending at or after px
    if (px < clip.x0 || px >= clip.x1) continue;
    const ChartPoint a = pts[seg], b = pts[seg + 1];
    const int64_t ly = b.x == a.x ? a.y : a.y + floorDiv((b.y - a.y) * (px - a.x), b.x - a.x);
    const int64_t span = std::max<int64_t>(1, bottom - ly);
    for (int64_t py = std::max(ly + 1, clip.y0); py < std::min(bottom, clip.y1); ++py) {
      const int64_t level = 2 + floorDiv(8 * (bottom - py), span);
      if (kBayer[py & 3][px & 3] < level) c.plot(px, py);
    }
  }
}

DITHER_NOINLINE void drawChart(const Canvas& c, JsonView el, const RenderContext& ctx) {
  const Value& v = reference(ctx, el);
  if (!v.isSeries() || v.asSeries().empty()) return;
  const std::vector<double>& s = v.asSeries();
  const int64_t n = static_cast<int64_t>(s.size());
  double lo = el["min"].isNumber() ? el["min"].number() : *std::min_element(s.begin(), s.end());
  double hi = el["max"].isNumber() ? el["max"].number() : *std::max_element(s.begin(), s.end());
  if (hi <= lo) hi = lo + 1;
  // Finite inputs can still overflow (hi - lo); such a fraction counts as 0.
  auto frac = [&](double value) {
    double f = std::clamp((value - lo) / (hi - lo), 0.0, 1.0);
    return std::isfinite(f) ? f : 0.0;
  };

  int64_t x = field(el, "x", 0), y = field(el, "y", 0), w = field(el, "w", 0), h = field(el, "h", 0);
  std::string_view kind = el["kind"].string();
  if (kind != "line" && kind != "steps" && kind != "area") {  // bars, also for anything unknown
    int64_t gap = field(el, "gap", 1);
    for (int64_t i = 0; i < n; ++i) {
      int64_t x0 = x + floorDiv(i * w, n);
      int64_t x1 = x + floorDiv((i + 1) * w, n) - gap;
      int64_t bh = std::max<int64_t>(1, static_cast<int64_t>(std::floor(frac(s[static_cast<size_t>(i)]) * h)));
      c.fillRect(x0, y + h - bh, x1 - x0, bh);
    }
    return;
  }
  std::vector<ChartPoint> pts;
  for (int64_t i = 0; i < n; ++i) {
    pts.push_back({x + floorDiv(i * (w - 1), std::max<int64_t>(1, n - 1)),
                   y + (h - 1) - static_cast<int64_t>(std::floor(frac(s[static_cast<size_t>(i)]) * (h - 1)))});
  }
  const int64_t lw = field(el, "lw", 2);
  if (kind == "steps") {
    for (size_t i = 0; i < pts.size(); ++i) {
      const bool last = i + 1 == pts.size();
      const int64_t nx = last ? x + w - 1 : pts[i + 1].x;
      drawLine(c, pts[i].x, pts[i].y, nx, pts[i].y, lw);
      if (!last) drawLine(c, nx, pts[i].y, nx, pts[i + 1].y, lw);
    }
    return;
  }
  if (kind == "area" && pts.size() > 1) shadeUnder(c, pts, x, w, y + h);
  for (size_t i = 1; i < pts.size(); ++i) drawLine(c, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, lw);
}

DITHER_NOINLINE void drawBitmapElement(const Canvas& c, JsonView el, const RenderContext& ctx) {
  const ByteSpan* a = asset(ctx, el["a"]);
  if (!a) return;
  if (auto bmp = Bitmap::parse(*a)) drawBitmap(c, *bmp, field(el, "x", 0), field(el, "y", 0));
}

DITHER_NOINLINE void drawIcon(const Canvas& c, JsonView el, const RenderContext& ctx) {
  std::string name = formatValue(reference(ctx, el), el["f"], ctx.format);
  const ByteSpan* a = asset(ctx, el["set"][name]);
  if (!a) return;
  auto bmp = Bitmap::parse(*a);
  if (!bmp) return;
  int64_t x = field(el, "x", 0), y = field(el, "y", 0), w = field(el, "w", 0), h = field(el, "h", 0);
  Canvas clipped = c.withClip({x, y, x + w, y + h});
  drawBitmap(clipped, *bmp, x + floorDiv(w - bmp->width, 2), y + floorDiv(h - bmp->height, 2));
}

DITHER_NOINLINE void drawText(const Canvas& c, JsonView el, const RenderContext& ctx) {
  const ByteSpan* a = asset(ctx, el["font"]);
  if (!a) return;
  auto font = Font::parse(*a);
  if (!font) return;
  TextBox box;
  box.x = field(el, "x", 0);
  box.y = field(el, "y", 0);
  box.w = field(el, "w", 0);
  box.h = field(el, "h", 0);
  std::string_view align = el["a"].string(), valign = el["va"].string();
  box.align = align == "c" || align == "r" ? align[0] : 'l';
  box.valign = valign == "m" || valign == "b" ? valign[0] : 't';
  box.wrap = el["wrap"].boolean(false);
  box.maxLines = std::max(0, el["lines"].integer(0));
  auto lines = layoutText(*font, buildText(el["parts"], ctx), box);
  drawTextLines(c, *font, lines, box);
}

}  // namespace

std::string buildText(JsonView parts, const RenderContext& ctx) {
  std::string out;
  for (JsonView p = parts.first(); p.exists(); p = p.next()) {
    if (p.isString()) {
      out += p.string();
    } else if (p["v"].isString()) {
      out += formatValue(ctx.values->get(p["v"].string()), p["f"], ctx.format);
    } else if (p["k"].exists()) {
      out += formatValue(valueFromJsonScalar(p["k"]), p["f"], ctx.format);
    }
  }
  return out;
}

void drawElement(Framebuffer& fb, JsonView el, const RenderContext& ctx, int groupDepth) {
  if (!evalCondition(el["when"], *ctx.values, ctx.format)) return;
  std::string_view t = el["t"].string();
  if (t == "group") {
    // Groups nest at most kMaxGroupDepth deep; a deeper one is empty.
    if (groupDepth >= kMaxGroupDepth) return;
    for (JsonView child = el["els"].first(); child.exists(); child = child.next()) {
      drawElement(fb, child, ctx, groupDepth + 1);
    }
    return;
  }
  const bool black = !(el["c"].isNumber() && el["c"].number() == 0);
  const Canvas c(fb, black);
  if (t == "rect") drawRect(c, el);
  else if (t == "circle") drawCircleElement(c, el);
  else if (t == "line") drawLineElement(c, el);
  else if (t == "hand") drawHand(c, el, ctx);
  else if (t == "text") drawText(c, el, ctx);
  else if (t == "bitmap") drawBitmapElement(c, el, ctx);
  else if (t == "icon") drawIcon(c, el, ctx);
  else if (t == "bar") drawBar(c, el, ctx);
  else if (t == "chart") drawChart(c, el, ctx);
}

void renderElements(Framebuffer& fb, JsonView elements, const RenderContext& ctx) {
  fb.clear();
  for (JsonView el = elements.first(); el.exists(); el = el.next()) drawElement(fb, el, ctx);
}

}  // namespace dither
