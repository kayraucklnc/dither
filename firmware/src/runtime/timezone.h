// Calendar arithmetic and POSIX TZ strings (format.md §2 "Times").
//
// Implemented here rather than with localtime_r so the host tests, the panel
// and the browser all apply exactly the same rule, including the one for a
// local time that falls in a daylight-saving gap or overlap.
#pragma once

#include <cstdint>
#include <string_view>

namespace dither {

struct CivilTime {
  int year = 1970, month = 1, day = 1;  // month 1-12
  int hour = 0, minute = 0, second = 0;
  int weekday = 4;  // 0 = Sunday
  int32_t offset = 0;  // seconds east of UTC in effect, for the `Z` token
};

int64_t floorDiv(int64_t a, int64_t b);
int64_t daysFromCivil(int year, int month, int day);
CivilTime civilFromSeconds(int64_t seconds);  // seconds since 1970 on a naive clock
int64_t secondsFromCivil(const CivilTime& t);  // ignores weekday
int daysInMonth(int year, int month);

class TimeZone {
 public:
  // Accepts `STD offset [DST [offset] ,Mm.w.d[/time],Mm.w.d[/time]]`.
  // Returns false (and leaves UTC) for anything else.
  bool parse(std::string_view posix);

  int32_t offsetAt(int64_t utc) const;  // seconds east of UTC
  bool isDst(int64_t utc) const;
  CivilTime toLocal(int64_t utc) const;
  // Standard offset if the zone is on standard time at (local - standard
  // offset), daylight offset otherwise.
  int64_t fromLocal(const CivilTime& local) const;

 private:
  struct Rule {
    int month = 3, week = 5, weekday = 0;
    int32_t time = 7200;  // seconds after local midnight
  };
  int64_t transition(int year, const Rule& rule, int32_t offset) const;

  int32_t std_ = 0;  // seconds east
  int32_t dst_ = 0;
  bool hasDst_ = false;
  Rule start_, end_;
};

}  // namespace dither
