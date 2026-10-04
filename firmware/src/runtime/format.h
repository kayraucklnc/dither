// Formats: a value to text (format.md §2 "Formats").
#pragma once

#include <cstdint>
#include <optional>
#include <string>

#include "json.h"
#include "time_format.h"
#include "timezone.h"
#include "value.h"

namespace dither {

struct FormatContext {
  std::optional<int64_t> now;  // Unix seconds; unknown before the first NTP sync
  const TimeZone* tz = nullptr;
  const Locale* locale = nullptr;
  const ValueStore* values = nullptr;  // for `shift`; null reads every ref as null
};

extern const char* const kDefaultFallback;  // "–" (U+2013)

// Text for a value with no format: null "–", strings as is, booleans
// "true"/"false", series "", numbers with automatic decimals.
std::string defaultText(const Value& v);

// The value steps of a format - shift, until, scale/add, steps, map - as used by
// condition leaves. nullopt: the value became null.
std::optional<Value> applyValueSteps(const Value& v, JsonView format, const FormatContext& ctx);

// Runs `format` (an object, or missing) over `v`.
std::string formatValue(const Value& v, JsonView format, const FormatContext& ctx);

}  // namespace dither
