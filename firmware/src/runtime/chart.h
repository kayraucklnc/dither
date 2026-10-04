// The `chart` element (format.md §4 "chart"): bars, line, steps, area, and
// the smoothed (Catmull-Rom) line and area.
#pragma once

#include <cstdint>
#include <optional>
#include <vector>

#include "framebuffer.h"

namespace dither {

struct ChartSpec {
  enum class Kind { Bars, Line, Steps, Area };
  Kind kind = Kind::Bars;
  int64_t x = 0, y = 0, w = 0, h = 0;
  std::optional<double> min, max;
  int64_t gap = 1, lw = 2;
  bool smooth = false;  // line and area only
};

void drawChartSeries(const Canvas& c, const ChartSpec& spec, const std::vector<double>& series);

// The smoothed height of column `px` between points (x0, p1) and (x1, p2),
// with p0 and p3 the neighbours (duplicated at the ends), clamped to
// [top, bottom]. Exposed for tests.
int64_t catmullRomRow(int64_t px, int64_t x0, int64_t x1, int64_t p0, int64_t p1, int64_t p2, int64_t p3, int64_t top,
                      int64_t bottom);

}  // namespace dither
