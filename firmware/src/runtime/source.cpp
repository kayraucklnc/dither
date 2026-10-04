#include "source.h"

#include <algorithm>
#include <cmath>

#include "placeholders.h"
#include "time_format.h"

namespace dither {
namespace {

NameValues pairs(JsonView list) {
  NameValues out;
  for (JsonView h = list.first(); h.exists(); h = h.next()) {
    if (h[size_t{0}].isString() && h[size_t{1}].isString()) {
      out.emplace_back(std::string(h[size_t{0}].string()), std::string(h[size_t{1}].string()));
    }
  }
  return out;
}

SourceAuth parseAuth(JsonView a) {
  SourceAuth auth;
  auth.url = std::string(a["url"].string());
  auth.form = pairs(a["form"]);
  if (a["token"].isString()) auth.tokenPath = std::string(a["token"].string());
  if (a["expires"].isString()) auth.expiresPath = std::string(a["expires"].string());
  return auth;
}

int hexDigit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

std::optional<std::array<uint8_t, 32>> parseHexKey(std::string_view hex) {
  if (hex.size() != 64) return std::nullopt;
  std::array<uint8_t, 32> key{};
  for (size_t i = 0; i < 32; ++i) {
    int hi = hexDigit(hex[2 * i]), lo = hexDigit(hex[2 * i + 1]);
    if (hi < 0 || lo < 0) return std::nullopt;
    key[i] = static_cast<uint8_t>(hi << 4 | lo);
  }
  return key;
}

}  // namespace

bool readToken(JsonView reply, const SourceAuth& auth, std::string& token, int64_t& lifetimeSeconds) {
  Value t = extractPath(reply, auth.tokenPath, -1);
  if (!t.isString() || t.asString().empty()) return false;
  token = t.asString();
  Value e = extractPath(reply, auth.expiresPath, -1);
  lifetimeSeconds = kDefaultTokenLifetime;
  if (e.isNumber() && std::isfinite(e.asNumber())) {
    lifetimeSeconds = static_cast<int64_t>(std::clamp(e.asNumber(), 0.0, 1.0e9));
  }
  return true;
}

std::vector<SourceSpec> parseSources(JsonView sources) {
  std::vector<SourceSpec> out;
  for (JsonView s = sources.first(); s.exists(); s = s.next()) {
    SourceSpec spec;
    int aggregates = 0;
    spec.id = std::string(s["id"].string());
    spec.url = std::string(s["url"].string());
    double every = s["every"].number(0);
    spec.every = static_cast<uint32_t>(std::clamp(every, static_cast<double>(kMinEvery), 4.0e9));
    spec.headers = pairs(s["headers"]);
    if (s["auth"].isObject()) spec.auth = parseAuth(s["auth"]);
    if (s["decode"].isObject()) {
      spec.decodes = true;
      spec.aesKey = parseHexKey(s["decode"]["aes256ecb"].string());
    }
    spec.usesPlaceholders = hasPlaceholder(spec.url);
    for (const auto& h : spec.headers) spec.usesPlaceholders = spec.usesPlaceholders || hasPlaceholder(h.second);
    for (JsonView v = s["values"].first(); v.exists(); v = v.next()) {
      SourceValueSpec vs;
      vs.key = std::string(v["key"].string());
      vs.path = std::string(v["path"].string());
      vs.count = v["count"].isNumber() ? std::clamp(v["count"].integer(0), 0, static_cast<int>(kMaxSeries)) : -1;
      if (v["agg"].exists()) {
        std::string_view agg = v["agg"].string();
        vs.field = std::string(v["field"].string());
        vs.agg = agg == "count"                                         ? SourceValueSpec::Agg::Count
                 : agg == "sum" && v["field"].isString() && !vs.field.empty() ? SourceValueSpec::Agg::Sum
                 : agg == "buckets"                                      ? SourceValueSpec::Agg::Buckets
                                                                         : SourceValueSpec::Agg::Invalid;
        vs.time = std::string(v["time"].string());
        vs.byHour = v["by"].string() == "hour";
        vs.buckets = std::clamp(v["count"].integer(0), 0, static_cast<int>(kMaxSeries));
        vs.count = -1;
        if (vs.agg == SourceValueSpec::Agg::Count || vs.agg == SourceValueSpec::Agg::Sum) vs.aggId = aggregates++;
      }
      if (!vs.key.empty()) spec.values.push_back(std::move(vs));
    }
    if (!spec.id.empty()) out.push_back(std::move(spec));
  }
  return out;
}

JsonFilter buildFilter(const SourceSpec& source) {
  JsonFilter filter;
  for (const auto& v : source.values) {
    if (v.aggId >= 0) {
      const auto kind = v.agg == SourceValueSpec::Agg::Sum ? JsonFilter::AggKind::Sum : JsonFilter::AggKind::Count;
      filter.addAggregate(v.path, kind, v.field, v.aggId);
    } else if (v.agg == SourceValueSpec::Agg::Buckets) {
      filter.keepElementFields(v.path, {v.field, v.time});
    } else if (v.agg == SourceValueSpec::Agg::None) {
      filter.addPath(v.path, v.count);
    }
  }
  filter.finalize();
  return filter;
}

Value extractPath(JsonView root, std::string_view path, int count) {
  JsonView node = root.path(path);
  if (count >= 0) return seriesFromJson(node, count);
  return valueFromJsonScalar(node);
}

Value bucketsFrom(JsonView target, const SourceValueSpec& spec, std::optional<int64_t> now, const TimeZone& tz) {
  if (!target.isArray() || !now) return Value();
  const int n = spec.buckets;
  std::vector<double> totals(static_cast<size_t>(n), 0.0);
  const CivilTime today = tz.toLocal(*now);
  const int64_t todayDays = daysFromCivil(today.year, today.month, today.day);
  for (JsonView e = target.first(); e.exists(); e = e.next()) {
    if (spec.field.empty() || spec.time.empty()) break;
    JsonView amount = e.path(spec.field);
    if (!amount.isNumber()) continue;
    auto when = parseTimeValue(valueFromJsonScalar(e.path(spec.time)), now, tz);
    if (!when) continue;
    const CivilTime local = toFields(*when, tz);
    const int64_t ago = todayDays - daysFromCivil(local.year, local.month, local.day);
    const int64_t i = spec.byHour ? (ago == 0 ? local.hour : -1) : n - 1 - ago;
    if (i >= 0 && i < n) totals[static_cast<size_t>(i)] += amount.number();
  }
  return Value::series(std::move(totals));
}

void applyResponse(const SourceSpec& source, const JsonDoc& doc, ValueStore& store, std::optional<int64_t> now,
                   const TimeZone& tz) {
  for (const auto& v : source.values) {
    Value value;
    if (v.agg == SourceValueSpec::Agg::None) {
      value = extractPath(doc.root(), v.path, v.count);
    } else if (v.agg == SourceValueSpec::Agg::Buckets) {
      value = bucketsFrom(doc.root().path(v.path), v, now, tz);
    } else if (auto total = doc.aggregate(v.aggId)) {
      value = Value::number(*total);
    }
    store.set(source.id + "." + v.key, std::move(value));
  }
}

Value aggregateFromTree(JsonView root, const SourceValueSpec& spec) {
  JsonView target = root.path(spec.path);
  if (!target.isArray()) return Value();
  if (spec.agg == SourceValueSpec::Agg::Count) return Value::number(static_cast<double>(target.size()));
  if (spec.agg != SourceValueSpec::Agg::Sum) return Value();
  double total = 0;
  for (JsonView e = target.first(); e.exists(); e = e.next()) {
    JsonView f = e.path(spec.field);
    if (f.isNumber()) total += f.number();
  }
  return Value::number(total);
}

}  // namespace dither
