#include "merge.h"

#include <algorithm>
#include <cmath>

#include "time_format.h"

namespace dither {
namespace {

std::vector<std::string> strings(JsonView list) {
  std::vector<std::string> out;
  for (JsonView v = list.first(); v.exists(); v = v.next()) {
    if (v.isString()) out.emplace_back(v.string());
  }
  return out;
}

struct Record {
  int from = 0;                 // position in the spec's `from`
  std::vector<Value> fields;    // in the spec's field order, then dist and brg with geo
  std::optional<double> when;   // the sort instant
};

// With geo, dist and brg follow the spec's own fields.
int fieldIndex(const MergeSpec& m, const std::string& name) {
  auto it = std::find(m.fields.begin(), m.fields.end(), name);
  if (it != m.fields.end()) return static_cast<int>(it - m.fields.begin());
  if (m.geo && name == "dist") return static_cast<int>(m.fields.size());
  if (m.geo && name == "brg") return static_cast<int>(m.fields.size()) + 1;
  return -1;
}

bool finite(const Value& v) { return v.isNumber() && std::isfinite(v.asNumber()); }

double roundTo(double x, int d) {
  const double scale = d == 1 ? 10.0 : 100.0;
  return std::round(x * scale) / scale;  // std::round is half away from zero
}

const Value& field(const Record& r, int index) {
  static const Value kNull;
  return index < 0 ? kNull : r.fields[static_cast<size_t>(index)];
}

// Records in source order, then record order. A record whose fields are all
// null is no record: that is how a short list, or a source with nothing
// (missing, never fetched), contributes nothing.
std::vector<Record> collect(const MergeSpec& m, const ValueStore& values) {
  std::vector<Record> out;
  for (size_t pos = 0; pos < m.from.size(); ++pos) {
    for (int n = 0; n < m.count; ++n) {
      Record r;
      r.from = static_cast<int>(pos);
      bool any = false;
      for (const auto& f : m.fields) {
        r.fields.push_back(values.get(m.from[pos] + "." + f + std::to_string(n)));
        any = any || !r.fields.back().isNull();
      }
      if (!any) continue;
      if (m.geo) {
        const GeoPoint p = geoWhere(*m.geo, field(r, fieldIndex(m, m.geo->lat)), field(r, fieldIndex(m, m.geo->lon)));
        r.fields.push_back(p.dist);
        r.fields.push_back(p.brg);
        if (p.dist.isNumber() && m.geo->within && p.dist.asNumber() > *m.geo->within) continue;
      }
      out.push_back(std::move(r));
    }
  }
  return out;
}

bool skipped(const MergeSpec& m, const Record& r) {
  for (const auto& s : m.skip) {
    if (field(r, fieldIndex(m, s)).isNull()) return true;
  }
  return false;
}

std::optional<double> sortInstant(const MergeSpec& m, const Record& r, std::optional<int64_t> now,
                                  const TimeZone& tz) {
  for (const auto& s : m.sort) {
    if (auto t = parseTimeValue(field(r, fieldIndex(m, s)), now, tz)) return toInstant(*t, tz);
  }
  return std::nullopt;
}

bool sameUnique(const MergeSpec& m, const Record& a, const Record& b) {
  for (const auto& u : m.unique) {
    const int i = fieldIndex(m, u);
    if (!(field(a, i) == field(b, i))) return false;
  }
  return true;
}

void applyOne(const MergeSpec& m, ValueStore& values, std::optional<int64_t> now, const TimeZone& tz) {
  std::vector<Record> records = collect(m, values);
  records.erase(std::remove_if(records.begin(), records.end(), [&](const Record& r) { return skipped(m, r); }),
                records.end());
  for (auto& r : records) r.when = sortInstant(m, r, now, tz);
  std::stable_sort(records.begin(), records.end(), [](const Record& a, const Record& b) {
    if (a.when.has_value() != b.when.has_value()) return a.when.has_value();  // untimed last
    return a.when.has_value() && *a.when < *b.when;
  });
  std::vector<const Record*> kept;
  for (const auto& r : records) {
    if (static_cast<int>(kept.size()) >= m.count) break;
    const bool duplicate = !m.unique.empty() && std::any_of(kept.begin(), kept.end(), [&](const Record* k) {
      return sameUnique(m, *k, r);
    });
    if (!duplicate) kept.push_back(&r);
  }
  for (int n = 0; n < m.count; ++n) {
    const Record* r = static_cast<size_t>(n) < kept.size() ? kept[static_cast<size_t>(n)] : nullptr;
    const std::string suffix = std::to_string(n);
    for (size_t f = 0; f < m.fields.size(); ++f) {
      values.set(m.id + "." + m.fields[f] + suffix, r ? r->fields[f] : Value());
    }
    if (m.geo) {
      values.set(m.id + ".dist" + suffix, r ? r->fields[m.fields.size()] : Value());
      values.set(m.id + ".brg" + suffix, r ? r->fields[m.fields.size() + 1] : Value());
    }
    values.set(m.id + ".from" + suffix, r ? Value::number(r->from) : Value());
  }
}

}  // namespace

std::vector<MergeSpec> parseMerges(JsonView merges) {
  std::vector<MergeSpec> out;
  for (JsonView m = merges.first(); m.exists(); m = m.next()) {
    MergeSpec spec;
    spec.id = std::string(m["id"].string());
    spec.from = strings(m["from"]);
    spec.fields = strings(m["fields"]);
    spec.skip = strings(m["skip"]);
    spec.sort = strings(m["sort"]);
    spec.unique = strings(m["unique"]);
    spec.count = std::clamp(m["count"].integer(0), 0, kMaxMergeCount);
    if (JsonView g = m["geo"]; g.exists()) {
      GeoSpec geo;
      geo.lat = std::string(g["lat"].string());
      geo.lon = std::string(g["lon"].string());
      JsonView at = g["at"];
      geo.valid = at.isArray() && at[0].isNumber() && at[1].isNumber() && g["kx"].isNumber() && g["ky"].isNumber();
      if (geo.valid) {
        geo.atLat = at[0].number();
        geo.atLon = at[1].number();
        geo.kx = g["kx"].number();
        geo.ky = g["ky"].number();
      }
      if (g["within"].isNumber()) geo.within = g["within"].number();
      spec.geo = std::move(geo);
    }
    if (!spec.id.empty()) out.push_back(std::move(spec));
  }
  return out;
}

GeoPoint geoWhere(const GeoSpec& geo, const Value& lat, const Value& lon) {
  if (!geo.valid || !finite(lat) || !finite(lon)) return {};
  const double dx = (lon.asNumber() - geo.atLon) * geo.kx;
  const double dy = (lat.asNumber() - geo.atLat) * geo.ky;
  // Separate statements, so no compiler fuses them into one multiply-add.
  const double xx = dx * dx;
  const double yy = dy * dy;
  const double sum = xx + yy;
  double deg = std::atan2(dx, dy) * 180.0 / 3.14159265358979323846;
  if (deg < 0) deg += 360.0;
  double brg = roundTo(deg, 1);
  if (brg == 360.0) brg = 0.0;
  return {Value::number(roundTo(std::sqrt(sum), 2)), Value::number(brg)};
}

void applyMerges(const std::vector<MergeSpec>& merges, ValueStore& values, std::optional<int64_t> now,
                 const TimeZone& tz) {
  for (const auto& m : merges) applyOne(m, values, now, tz);
}

}  // namespace dither
