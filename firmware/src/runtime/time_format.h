// Time values and the `time` format tokens (format.md §2 "Times").
#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "json.h"
#include "timezone.h"
#include "value.h"

namespace dither {

struct Locale {
  std::vector<std::string> days, daysShort, months, monthsShort;
  static Locale fromJson(JsonView locale);  // English for anything missing
};

// Either an instant or a local time "as written" (an ISO string without zone).
struct TimeValue {
  bool local = false;
  CivilTime fields;      // when local
  double instant = 0;    // Unix seconds, when not local
};

// Instants beyond this many seconds from 1970 (about year 5138) are not times.
constexpr double kMaxInstant = 1e11;

// `now` places bare wall-clock times ("08:15"); without it they are null.
std::optional<TimeValue> parseTimeValue(const Value& v, std::optional<int64_t> now, const TimeZone& tz);
std::optional<TimeValue> parseIsoTime(std::string_view s);
// "HH:MM" or "HH:MM:SS" on the local day (yesterday, today or tomorrow) that
// puts it nearest to now - within [now - 12 h, now + 12 h) - the earlier day
// on a tie.
std::optional<TimeValue> parseWallClock(std::string_view s, int64_t now, const TimeZone& tz);

double toInstant(const TimeValue& t, const TimeZone& tz);
CivilTime toFields(const TimeValue& t, const TimeZone& tz);

std::string formatTime(const CivilTime& t, std::string_view pattern, const Locale& locale);

}  // namespace dither
