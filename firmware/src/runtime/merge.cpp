#include "merge.h"

#include <algorithm>

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
  std::vector<Value> fields;    // in the spec's field order
  std::optional<double> when;   // the sort instant
};

int fieldIndex(const MergeSpec& m, const std::string& name) {
  auto it = std::find(m.fields.begin(), m.fields.end(), name);
  return it == m.fields.end() ? -1 : static_cast<int>(it - m.fields.begin());
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
      if (any) out.push_back(std::move(r));
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
    if (!spec.id.empty()) out.push_back(std::move(spec));
  }
  return out;
}

void applyMerges(const std::vector<MergeSpec>& merges, ValueStore& values, std::optional<int64_t> now,
                 const TimeZone& tz) {
  for (const auto& m : merges) applyOne(m, values, now, tz);
}

}  // namespace dither
