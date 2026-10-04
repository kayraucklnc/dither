// Expected pictures are worked out by hand from format.md §4.
#include "../src/runtime/elements.h"
#include "../src/runtime/shapes.h"
#include "../src/runtime/timezone.h"

#include <cstdlib>
#include "check.h"
#include "helpers.h"

using namespace dither;
using testutil::dump;

using Rows = std::vector<std::string>;

namespace {

Framebuffer drawn(int w, int h, const char* elementJson, const ValueStore& values = ValueStore()) {
  static TimeZone tz;
  static Locale locale = Locale::fromJson(JsonView());
  static const std::vector<ByteSpan> noAssets;
  Framebuffer fb(w, h);
  JsonDoc doc;
  if (!doc.parse(elementJson).ok) return fb;
  RenderContext ctx;
  ctx.values = &values;
  ctx.format.tz = &tz;
  ctx.format.locale = &locale;
  ctx.assets = &noAssets;
  drawElement(fb, doc.root(), ctx);
  return fb;
}

Rows all(const Framebuffer& fb) {
  return dump(fb, 0, 0, fb.width(), fb.height());
}

}  // namespace

TEST(rect_filled_and_clipped) {
  CHECK_EQ(all(drawn(5, 4, R"({"t":"rect","x":1,"y":1,"w":3,"h":2})")),
           (Rows{".....", ".###.", ".###.", "....."}));
  CHECK_EQ(all(drawn(4, 4, R"({"t":"rect","x":-2,"y":-2,"w":4,"h":4})")),
           (Rows{"##..", "##..", "....", "...."}));
  CHECK_EQ(testutil::countInk(drawn(4, 4, R"({"t":"rect","x":0,"y":0,"w":0,"h":3})")), 0);
  CHECK_EQ(testutil::countInk(drawn(4, 4, R"({"t":"rect","x":0,"y":0,"w":3,"h":-1})")), 0);
}

TEST(rect_rounded_corners) {
  // r = 3 on 6x6: only the very corner pixel of each corner fails the test.
  CHECK_EQ(all(drawn(6, 6, R"({"t":"rect","x":0,"y":0,"w":6,"h":6,"r":3})")),
           (Rows{".####.", "######", "######", "######", "######", ".####."}));
  // r = 9 is clamped to min(6, 6) / 2 = 3.
  CHECK_EQ(all(drawn(6, 6, R"({"t":"rect","x":0,"y":0,"w":6,"h":6,"r":9})")),
           all(drawn(6, 6, R"({"t":"rect","x":0,"y":0,"w":6,"h":6,"r":3})")));
  CHECK_EQ(all(drawn(8, 8, R"({"t":"rect","x":0,"y":0,"w":8,"h":8,"r":4})")),
           (Rows{"..####..", ".######.", "########", "########", "########", "########", ".######.",
                 "..####.."}));
  // Clamp uses integer division: 5x3 allows r = 1.
  CHECK_EQ(all(drawn(5, 3, R"({"t":"rect","x":0,"y":0,"w":5,"h":3,"r":2})")),
           (Rows{"#####", "#####", "#####"}));  // r=1: (2*1-1)^2*2 = 2 <= 4 keeps everything
}

TEST(rect_outline) {
  CHECK_EQ(all(drawn(5, 4, R"({"t":"rect","x":0,"y":0,"w":5,"h":4,"fill":false})")),
           (Rows{"#####", "#...#", "#...#", "#####"}));
  CHECK_EQ(all(drawn(6, 6, R"({"t":"rect","x":0,"y":0,"w":6,"h":6,"fill":false,"stroke":2})")),
           (Rows{"######", "######", "##..##", "##..##", "######", "######"}));
  // Inner rect with no area removes nothing.
  CHECK_EQ(all(drawn(4, 4, R"({"t":"rect","x":0,"y":0,"w":4,"h":4,"fill":false,"stroke":2})")),
           (Rows{"####", "####", "####", "####"}));
  CHECK_EQ(all(drawn(8, 8, R"({"t":"rect","x":0,"y":0,"w":8,"h":8,"r":4,"fill":false})")),
           (Rows{"..####..", ".#....#.", "#......#", "#......#", "#......#", "#......#", ".#....#.",
                 "..####.."}));
  CHECK_EQ(testutil::countInk(drawn(4, 4, R"({"t":"rect","x":0,"y":0,"w":4,"h":4,"fill":false,"stroke":0})")), 0);
}

TEST(circle_filled_and_outline) {
  CHECK_EQ(all(drawn(5, 5, R"({"t":"circle","x":2,"y":2,"r":2})")),
           (Rows{".###.", "#####", "#####", "#####", ".###."}));
  CHECK_EQ(all(drawn(3, 3, R"({"t":"circle","x":1,"y":1,"r":1})")), (Rows{"###", "###", "###"}));
  CHECK_EQ(all(drawn(3, 3, R"({"t":"circle","x":1,"y":1,"r":0})")), (Rows{"...", ".#.", "..."}));
  CHECK_EQ(testutil::countInk(drawn(3, 3, R"({"t":"circle","x":1,"y":1,"r":-1})")), 0);
  CHECK_EQ(all(drawn(5, 5, R"({"t":"circle","x":2,"y":2,"r":2,"fill":false})")),
           (Rows{".###.", "#...#", "#...#", "#...#", ".###."}));
  CHECK_EQ(all(drawn(5, 5, R"({"t":"circle","x":2,"y":2,"r":2,"fill":false,"stroke":2})")),
           (Rows{".###.", "#####", "##.##", "#####", ".###."}));
  CHECK_EQ(all(drawn(5, 5, R"({"t":"circle","x":2,"y":2,"r":2,"fill":false,"stroke":3})")),
           (Rows{".###.", "#####", "#####", "#####", ".###."}));
  CHECK_EQ(all(drawn(3, 3, R"({"t":"circle","x":0,"y":0,"r":1})")), (Rows{"##.", "##.", "..."}));
}

TEST(line_bresenham_variant) {
  CHECK_EQ(all(drawn(5, 3, R"({"t":"line","x1":0,"y1":0,"x2":4,"y2":2})")),
           (Rows{"#....", ".##..", "...##"}));
  // Same endpoints reversed take the variant's own path, not a mirror.
  CHECK_EQ(all(drawn(5, 3, R"({"t":"line","x1":4,"y1":2,"x2":0,"y2":0})")),
           (Rows{"##...", "..##.", "....#"}));
  CHECK_EQ(all(drawn(3, 3, R"({"t":"line","x1":1,"y1":1,"x2":1,"y2":1})")), (Rows{"...", ".#.", "..."}));
  CHECK_EQ(all(drawn(4, 4, R"({"t":"line","x1":0,"y1":3,"x2":3,"y2":0})")),
           (Rows{"...#", "..#.", ".#..", "#..."}));
}

TEST(line_thickness_squares) {
  // w = 2: k = 0, square [px, px+2)
  CHECK_EQ(all(drawn(6, 4, R"({"t":"line","x1":0,"y1":1,"x2":3,"y2":1,"w":2})")),
           (Rows{"......", "#####.", "#####.", "......"}));
  // w = 3: k = 1, square [px-1, px+2)
  CHECK_EQ(all(drawn(6, 4, R"({"t":"line","x1":1,"y1":1,"x2":3,"y2":1,"w":3})")),
           (Rows{"#####.", "#####.", "#####.", "......"}));
  CHECK_EQ(testutil::countInk(drawn(4, 4, R"({"t":"line","x1":0,"y1":0,"x2":3,"y2":3,"w":0})")), 0);
}

TEST(hand_angles) {
  ValueStore v;
  v.set("clock.minute", Value::number(15));
  Framebuffer fb = drawn(20, 20, R"({"t":"hand","x":10,"y":10,"len":5,"v":"clock.minute","max":60})", v);
  CHECK_EQ(dump(fb, 9, 9, 17, 12), (Rows{"........", ".######.", "........"}));
  v.set("clock.minute", Value::number(5));
  // sin(30deg) * 5 = 2.4999999999999996 -> 2; cos * 5 = 4.33 -> 4: end (12, 6)
  fb = drawn(20, 20, R"({"t":"hand","x":10,"y":10,"len":5,"v":"clock.minute","max":60})", v);
  CHECK(fb.get(12, 6));
  CHECK(!fb.get(13, 5));
  CHECK(fb.get(10, 10));
  v.set("clock.minute", Value::string("x"));
  CHECK_EQ(testutil::countInk(drawn(20, 20, R"({"t":"hand","x":10,"y":10,"len":5,"v":"clock.minute","max":60})", v)), 0);
  v.set("clock.minute", Value::number(5));
  CHECK_EQ(testutil::countInk(drawn(20, 20, R"({"t":"hand","x":10,"y":10,"len":5,"v":"clock.minute","max":0})", v)), 0);
}

TEST(bar_directions) {
  ValueStore v;
  v.set("s.x", Value::number(5));
  CHECK_EQ(all(drawn(10, 2, R"({"t":"bar","x":0,"y":0,"w":10,"h":2,"v":"s.x","min":0,"max":10})", v)),
           (Rows{"#####.....", "#####....."}));
  v.set("s.x", Value::number(3.3));
  CHECK_EQ(all(drawn(2, 10, R"({"t":"bar","x":0,"y":0,"w":2,"h":10,"v":"s.x","min":0,"max":10,"dir":"u"})", v)),
           (Rows{"..", "..", "..", "..", "..", "..", "..", "##", "##", "##"}));
  v.set("s.x", Value::number(-5));
  CHECK_EQ(testutil::countInk(drawn(10, 2, R"({"t":"bar","x":0,"y":0,"w":10,"h":2,"v":"s.x","min":0,"max":10})", v)), 0);
  v.set("s.x", Value::number(50));
  CHECK_EQ(testutil::countInk(drawn(10, 2, R"({"t":"bar","x":0,"y":0,"w":10,"h":2,"v":"s.x","min":0,"max":10})", v)), 20);
  CHECK_EQ(testutil::countInk(drawn(10, 2, R"({"t":"bar","x":0,"y":0,"w":10,"h":2,"v":"s.x","min":5,"max":5})", v)), 0);
}

TEST(chart_bars_and_line) {
  ValueStore v;
  v.set("s.h", Value::series({0, 5, 10}));
  CHECK_EQ(all(drawn(10, 4, R"({"t":"chart","x":0,"y":0,"w":10,"h":4,"v":"s.h","kind":"bars"})", v)),
           (Rows{"......###.", "......###.", "...##.###.", "##.##.###."}));
  CHECK_EQ(all(drawn(5, 3, R"({"t":"chart","x":0,"y":0,"w":5,"h":3,"v":"s.h","kind":"line","lw":1})", v)),
           (Rows{"...##", ".##..", "#...."}));
  v.set("s.l", Value::series({0, 10, 5}));
  CHECK_EQ(all(drawn(5, 3, R"({"t":"chart","x":0,"y":0,"w":5,"h":3,"v":"s.l","kind":"line","lw":1})", v)),
           (Rows{"..#..", ".#.##", "#...."}));
  // Explicit min/max clamp; equal values get hi = lo + 1.
  v.set("s.flat", Value::series({7, 7}));
  CHECK_EQ(all(drawn(4, 2, R"({"t":"chart","x":0,"y":0,"w":4,"h":2,"v":"s.flat","gap":0})", v)),
           (Rows{"....", "####"}));
  CHECK_EQ(all(drawn(4, 2, R"({"t":"chart","x":0,"y":0,"w":4,"h":2,"v":"s.flat","gap":0,"min":0,"max":7})", v)),
           (Rows{"####", "####"}));
  v.set("s.one", Value::series({3}));
  CHECK_EQ(testutil::countInk(drawn(5, 3, R"({"t":"chart","x":0,"y":0,"w":5,"h":3,"v":"s.one","kind":"line"})", v)), 0);
  v.set("s.none", Value::series({}));
  CHECK_EQ(testutil::countInk(drawn(5, 3, R"({"t":"chart","x":0,"y":0,"w":5,"h":3,"v":"s.none"})", v)), 0);
}

TEST(element_colour_and_when) {
  Framebuffer fb(4, 1);
  ValueStore values;
  values.set("d.on", Value::boolean(true));
  static TimeZone tz;
  static Locale locale = Locale::fromJson(JsonView());
  std::vector<ByteSpan> assets;
  RenderContext ctx;
  ctx.values = &values;
  ctx.format.tz = &tz;
  ctx.format.locale = &locale;
  ctx.assets = &assets;
  JsonDoc doc;
  CHECK(doc.parse(R"([{"t":"rect","x":0,"y":0,"w":4,"h":1},
                      {"t":"rect","x":1,"y":0,"w":1,"h":1,"c":0},
                      {"t":"rect","x":2,"y":0,"w":1,"h":1,"c":0,"when":{"v":"d.on","op":"false"}}])")
            .ok);
  renderElements(fb, doc.root(), ctx);
  CHECK_EQ(all(fb), (Rows{"#.##"}));
}

TEST(coordinates_are_bounded) {
  // Huge or fractional numbers must neither overflow nor stall a line loop.
  // Coordinates are clamped to [-32767, 32767], a bound format.md does not state.
  CHECK_EQ(all(drawn(4, 2, R"({"t":"rect","x":-5,"y":0,"w":1e12,"h":1})")), (Rows{"####", "...."}));
  CHECK_EQ(all(drawn(4, 2, R"({"t":"rect","x":1.9,"y":0,"w":2.9,"h":1})")), (Rows{".##.", "...."}));
  CHECK_EQ(testutil::countInk(drawn(4, 4, R"({"t":"line","x1":-1e300,"y1":0,"x2":1e300,"y2":0,"w":1})")), 4);
}

namespace {

// The definition: a w x w square stamped at every Bresenham point.
Framebuffer stamped(int fw, int fh, Box clip, int64_t x1, int64_t y1, int64_t x2, int64_t y2, int64_t w) {
  Framebuffer fb(fw, fh);
  Canvas c = Canvas(fb, true).withClip(clip);
  const int64_t k = floorDiv(w - 1, 2);
  const int64_t dx = std::llabs(x2 - x1), dy = -std::llabs(y2 - y1);
  const int64_t sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  int64_t err = dx + dy, x = x1, y = y1;
  while (true) {
    for (int64_t yy = y - k; yy < y - k + w; ++yy)
      for (int64_t xx = x - k; xx < x - k + w; ++xx) c.plot(xx, yy);
    if (x == x2 && y == y2) break;
    int64_t e2 = 2 * err;
    if (e2 >= dy) err += dy, x += sx;
    if (e2 <= dx) err += dx, y += sy;
  }
  return fb;
}

}  // namespace

TEST(line_spans_equal_stamped_squares) {
  uint32_t seed = 12345;
  auto rnd = [&](int lo, int hi) {
    seed = seed * 1103515245u + 12345u;
    return lo + static_cast<int>((seed >> 8) % static_cast<uint32_t>(hi - lo + 1));
  };
  int mismatches = 0;
  for (int i = 0; i < 3000; ++i) {
    int64_t x1 = rnd(-12, 52), y1 = rnd(-12, 42), x2 = rnd(-12, 52), y2 = rnd(-12, 42), w = rnd(1, 9);
    Box clip{rnd(-2, 20), rnd(-2, 15), rnd(20, 42), rnd(15, 32)};
    Framebuffer expect = stamped(40, 30, clip, x1, y1, x2, y2, w);
    Framebuffer got(40, 30);
    drawLine(Canvas(got, true).withClip(clip), x1, y1, x2, y2, w);
    if (got.bytes() != expect.bytes()) ++mismatches;
  }
  CHECK_EQ(mismatches, 0);
}

TEST(huge_shapes_are_bounded_by_the_clip) {
  // These would take minutes if any loop walked the whole shape.
  Framebuffer fb(800, 480);
  Canvas c(fb, true);
  drawLine(c, -32767, -16000, 32767, 16000, 32767);
  fillRoundRect(c, -32767, -32767, 65534, 65534, 32767);
  strokeRoundRect(c, -32767, -32767, 65534, 65534, 32767, 3);
  fillCircle(c, 0, 0, 32767);
  strokeCircle(c, 0, 0, 32767, 100);
  CHECK(fb.get(400, 240));
}

TEST(rounded_corner_closed_form_matches_definition) {
  for (int64_t r = 0; r <= 20; ++r) {
    int64_t size = 2 * r + 3;
    Framebuffer fb(static_cast<int>(size), static_cast<int>(size));
    fillRoundRect(Canvas(fb, true), 0, 0, size, size, r);
    int bad = 0;
    for (int64_t py = 0; py < size; ++py) {
      for (int64_t px = 0; px < size; ++px) {
        int64_t u = std::min(px, size - 1 - px), v = std::min(py, size - 1 - py);
        bool keep = !(u < r && v < r) || (2 * (r - u) - 1) * (2 * (r - u) - 1) + (2 * (r - v) - 1) * (2 * (r - v) - 1) <= 4 * r * r;
        bad += keep != fb.get(static_cast<int>(px), static_cast<int>(py));
      }
    }
    CHECK_EQ(bad, 0);
  }
}
