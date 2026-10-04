#include "source.h"

#include <algorithm>
#include <cmath>

#include "placeholders.h"

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
                                                                         : SourceValueSpec::Agg::Invalid;
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

void applyResponse(const SourceSpec& source, const JsonDoc& doc, ValueStore& store) {
  for (const auto& v : source.values) {
    Value value;
    if (v.agg == SourceValueSpec::Agg::None) {
      value = extractPath(doc.root(), v.path, v.count);
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
