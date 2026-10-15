// Merges (format.md §2 "Merges"): one sorted, de-duplicated list built on the
// panel from records several sources already keep.
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "json.h"
#include "timezone.h"
#include "value.h"

namespace dither {

constexpr int kMaxMergeCount = 64;

// How far and which way each record is from a place (format.md "Merges", `geo`).
struct GeoSpec {
  std::string lat, lon;
  double atLat = 0, atLon = 0, kx = 0, ky = 0;
  bool valid = false;  // at, kx and ky all numbers
  std::optional<double> within;
};

struct MergeSpec {
  std::string id;
  std::vector<std::string> from, fields, skip, sort, unique;
  int count = 0;  // records read per source, and records kept (0-64)
  std::optional<GeoSpec> geo;
};

// Distance (km) and bearing (degrees from north) of a position from geo.at;
// both null without one.
struct GeoPoint {
  Value dist, brg;
};
GeoPoint geoWhere(const GeoSpec& geo, const Value& lat, const Value& lon);

std::vector<MergeSpec> parseMerges(JsonView merges);

// Writes `<id>.<field><n>` and `<id>.from<n>` for n < count, in order of
// the specs, so a later merge may read an earlier one.
void applyMerges(const std::vector<MergeSpec>& merges, ValueStore& values, std::optional<int64_t> now,
                 const TimeZone& tz);

}  // namespace dither
