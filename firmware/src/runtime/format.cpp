#include "format.h"

#include <algorithm>
#include <cmath>
#include <optional>

#include "number_format.h"
#include "utf8.h"

namespace dither {

const char* const kDefaultFallback = "\xE2\x80\x93";

namespace {

using MaybeValue = std::optional<Value>;  // nullopt: the value went null

MaybeValue nonNull(Value v) {
  if (v.isNull()) return std::nullopt;
  return v;
}

// Step 0: a time moved by (value of `v`) x `scale` seconds, as an instant.
MaybeValue applyShift(const Value& v, JsonView shift, const FormatContext& ctx) {
  auto t = parseTimeValue(v, ctx.now, *ctx.tz);
  if (!t) return std::nullopt;
  double delta = 0;
  if (ctx.values) {
    const Value& by = ctx.values->get(shift["v"].string());
    if (by.isNumber()) delta = by.asNumber() * shift["scale"].number(1);
  }
  double instant = toInstant(*t, *ctx.tz) + delta;
  if (!std::isfinite(instant) || std::fabs(instant) >= kMaxInstant) return std::nullopt;
  return Value::number(instant);
}

// Local calendar days from today's date to the value's date.
MaybeValue applyDays(const Value& v, const FormatContext& ctx) {
  if (!ctx.now) return std::nullopt;
  auto t = parseTimeValue(v, ctx.now, *ctx.tz);
  if (!t) return std::nullopt;
  const CivilTime day = toFields(*t, *ctx.tz);
  const CivilTime today = ctx.tz->toLocal(*ctx.now);
  return Value::number(static_cast<double>(daysFromCivil(day.year, day.month, day.day) -
                                           daysFromCivil(today.year, today.month, today.day)));
}

MaybeValue applyUntil(const Value& v, const FormatContext& ctx) {
  if (!ctx.now) return std::nullopt;
  auto t = parseTimeValue(v, ctx.now, *ctx.tz);
  if (!t) return std::nullopt;
  double instant = toInstant(*t, *ctx.tz);
  double now = static_cast<double>(*ctx.now);
  if (instant < now) return std::nullopt;
  return Value::number(std::floor((instant - now) / 60.0));
}

MaybeValue applyArithmetic(const Value& v, JsonView format) {
  JsonView scale = format["scale"], add = format["add"];
  if (!scale.exists() && !add.exists()) return v;
  if (!v.isNumber()) return std::nullopt;
  double n = v.asNumber();
  if (scale.isNumber()) n *= scale.number();
  if (add.isNumber()) n += add.number();
  return Value::number(n);
}

MaybeValue applySteps(const Value& v, JsonView steps) {
  if (!v.isNumber()) return std::nullopt;
  size_t k = 0;
  for (JsonView t = steps["t"].first(); t.exists(); t = t.next()) {
    if (t.isNumber() && t.number() <= v.asNumber()) ++k;
  }
  return nonNull(valueFromJsonScalar(steps["o"][k]));
}

bool mapKeyMatches(const Value& v, JsonView key) {
  if (v.isNumber() && key.isNumber()) return v.asNumber() == key.number();
  if (v.isString() && key.isString()) return v.asString() == key.string();
  return false;
}

MaybeValue applyMap(const Value& v, JsonView map) {
  size_t index = 0;
  for (JsonView k = map["k"].first(); k.exists(); k = k.next(), ++index) {
    if (mapKeyMatches(v, k)) return nonNull(valueFromJsonScalar(map["o"][index]));
  }
  return nonNull(valueFromJsonScalar(map["d"]));
}

MaybeValue applyNum(const Value& v, JsonView num) {
  if (!v.isNumber()) return std::nullopt;
  if (num["compact"].boolean(false) && std::fabs(v.asNumber()) >= 1000) {
    auto text = formatCompact(v.asNumber());
    if (!text) return std::nullopt;
    return Value::string(*text);
  }
  int decimals = num["d"].isNumber() ? std::max(0, num["d"].integer(0)) : kAutoDecimals;
  auto text = formatNumber(v.asNumber(), decimals, num["sep"].string());
  if (!text) return std::nullopt;
  return Value::string(*text);
}

MaybeValue applyTime(const Value& v, JsonView pattern, const FormatContext& ctx) {
  auto t = parseTimeValue(v, ctx.now, *ctx.tz);
  if (!t) return std::nullopt;
  return Value::string(formatTime(toFields(*t, *ctx.tz), pattern.string(), *ctx.locale));
}

MaybeValue runPipeline(const Value& input, JsonView f, const FormatContext& ctx) {
  MaybeValue v = applyValueSteps(input, f, ctx);
  if (v && f["num"].isObject()) v = applyNum(*v, f["num"]);
  if (v && f["time"].isString()) v = applyTime(*v, f["time"], ctx);
  if (v && f["upper"].boolean(false)) v = Value::string(upperText(defaultText(*v), f["tr"].boolean(false)));
  return v;
}

}  // namespace

std::optional<Value> applyValueSteps(const Value& input, JsonView f, const FormatContext& ctx) {
  MaybeValue v = nonNull(input);
  if (v && f["shift"].isObject()) v = applyShift(*v, f["shift"], ctx);
  if (v && f["days"].boolean(false)) {
    v = applyDays(*v, ctx);  // and `until` is ignored
  } else if (v && f["until"].boolean(false)) {
    v = applyUntil(*v, ctx);
  }
  if (v) v = applyArithmetic(*v, f);
  if (v && f["steps"].isObject()) v = applySteps(*v, f["steps"]);
  if (v && f["map"].isObject()) v = applyMap(*v, f["map"]);
  return v;
}

std::string defaultText(const Value& v) {
  switch (v.type()) {
    case ValueType::Null: return kDefaultFallback;
    case ValueType::String: return v.asString();
    case ValueType::Bool: return v.asBool() ? "true" : "false";
    case ValueType::Series: return "";
    case ValueType::Number: {
      auto text = formatNumber(v.asNumber(), kAutoDecimals);
      return text ? *text : kDefaultFallback;
    }
  }
  return "";
}

std::string formatValue(const Value& v, JsonView format, const FormatContext& ctx) {
  if (!format.isObject()) return defaultText(v);
  MaybeValue result = runPipeline(v, format, ctx);
  if (!result) {
    JsonView fallback = format["fallback"];
    return fallback.isString() ? std::string(fallback.string()) : kDefaultFallback;
  }
  return defaultText(*result);
}

}  // namespace dither
