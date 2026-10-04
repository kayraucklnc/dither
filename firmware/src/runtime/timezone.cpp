#include "timezone.h"

#include <cctype>

namespace dither {

int64_t floorDiv(int64_t a, int64_t b) {
  int64_t q = a / b;
  if ((a % b != 0) && ((a < 0) != (b < 0))) --q;
  return q;
}

// Howard Hinnant's days_from_civil / civil_from_days.
int64_t daysFromCivil(int year, int month, int day) {
  int64_t y = static_cast<int64_t>(year) - (month <= 2 ? 1 : 0);
  int64_t era = floorDiv(y, 400);
  int64_t yoe = y - era * 400;
  int64_t mp = (month + 9) % 12;
  int64_t doy = (153 * mp + 2) / 5 + day - 1;
  int64_t doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe - 719468;
}

int daysInMonth(int year, int month) {
  static const int kDays[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  if (month < 1 || month > 12) return 0;
  bool leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
  return month == 2 && leap ? 29 : kDays[month - 1];
}

CivilTime civilFromSeconds(int64_t seconds) {
  int64_t days = floorDiv(seconds, 86400);
  int64_t rem = seconds - days * 86400;
  int64_t z = days + 719468;
  int64_t era = floorDiv(z, 146097);
  int64_t doe = z - era * 146097;
  int64_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  int64_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  int64_t mp = (5 * doy + 2) / 153;
  CivilTime t;
  t.day = static_cast<int>(doy - (153 * mp + 2) / 5 + 1);
  t.month = static_cast<int>(mp < 10 ? mp + 3 : mp - 9);
  t.year = static_cast<int>(yoe + era * 400 + (t.month <= 2 ? 1 : 0));
  t.hour = static_cast<int>(rem / 3600);
  t.minute = static_cast<int>(rem / 60 % 60);
  t.second = static_cast<int>(rem % 60);
  int64_t weekday = (days + 4) % 7;  // 1970-01-01 was a Thursday
  t.weekday = static_cast<int>(weekday < 0 ? weekday + 7 : weekday);
  return t;
}

int64_t secondsFromCivil(const CivilTime& t) {
  return daysFromCivil(t.year, t.month, t.day) * 86400 + t.hour * 3600 + t.minute * 60 + t.second;
}

// ---- POSIX TZ parsing -----------------------------------------------------------

namespace {

class TzReader {
 public:
  explicit TzReader(std::string_view s) : s_(s) {}
  bool atEnd() const { return i_ >= s_.size(); }
  char peek() const { return atEnd() ? '\0' : s_[i_]; }
  bool accept(char c) {
    if (peek() != c) return false;
    ++i_;
    return true;
  }

  bool name() {
    if (accept('<')) {
      size_t start = i_;
      while (!atEnd() && peek() != '>') ++i_;
      return i_ - start >= 3 && accept('>');
    }
    size_t start = i_;
    while (std::isalpha(static_cast<unsigned char>(peek()))) ++i_;
    return i_ - start >= 3;
  }

  bool number(int& out, int maxDigits) {
    int digits = 0;
    out = 0;
    while (std::isdigit(static_cast<unsigned char>(peek())) && digits < maxDigits) {
      out = out * 10 + (peek() - '0');
      ++i_;
      ++digits;
    }
    return digits > 0;
  }

  // [+-]hh[:mm[:ss]] in seconds.
  bool clock(int32_t& out, int maxHours) {
    int sign = 1;
    if (accept('-')) {
      sign = -1;
    } else {
      accept('+');
    }
    int h = 0, m = 0, sec = 0;
    if (!number(h, 3) || h > maxHours) return false;
    if (accept(':')) {
      if (!number(m, 2) || m > 59) return false;
      if (accept(':') && (!number(sec, 2) || sec > 59)) return false;
    }
    out = sign * (h * 3600 + m * 60 + sec);
    return true;
  }

 private:
  std::string_view s_;
  size_t i_ = 0;
};

}  // namespace

bool TimeZone::parse(std::string_view posix) {
  *this = TimeZone();
  TzReader r(posix);
  int32_t west = 0;
  if (!r.name() || !r.clock(west, 24)) return false;
  int32_t stdEast = -west;
  if (r.atEnd()) {
    std_ = dst_ = stdEast;
    return true;
  }
  if (!r.name()) return false;
  int32_t dstEast = stdEast + 3600;
  if (r.peek() != ',' && !r.atEnd()) {
    int32_t dstWest = 0;
    if (!r.clock(dstWest, 24)) return false;
    dstEast = -dstWest;
  }
  Rule rules[2];
  for (Rule& rule : rules) {
    if (!r.accept(',') || !r.accept('M')) return false;
    if (!r.number(rule.month, 2) || !r.accept('.') || !r.number(rule.week, 1) || !r.accept('.') ||
        !r.number(rule.weekday, 1)) {
      return false;
    }
    if (rule.month < 1 || rule.month > 12 || rule.week < 1 || rule.week > 5 || rule.weekday > 6) return false;
    if (r.accept('/') && !r.clock(rule.time, 167)) return false;
  }
  if (!r.atEnd()) return false;
  std_ = stdEast;
  dst_ = dstEast;
  hasDst_ = true;
  start_ = rules[0];
  end_ = rules[1];
  return true;
}

int64_t TimeZone::transition(int year, const Rule& rule, int32_t offset) const {
  int64_t first = daysFromCivil(year, rule.month, 1);
  int firstWeekday = civilFromSeconds(first * 86400).weekday;
  int day = 1 + (rule.weekday - firstWeekday + 7) % 7 + (rule.week - 1) * 7;
  while (day > daysInMonth(year, rule.month)) day -= 7;
  return (first + day - 1) * 86400 + rule.time - offset;
}

bool TimeZone::isDst(int64_t utc) const {
  if (!hasDst_) return false;
  int year = civilFromSeconds(utc + std_).year;
  int64_t start = transition(year, start_, std_);  // rule time is in standard time
  int64_t end = transition(year, end_, dst_);      // rule time is in daylight time
  if (start < end) return utc >= start && utc < end;
  return !(utc >= end && utc < start);
}

int32_t TimeZone::offsetAt(int64_t utc) const {
  return isDst(utc) ? dst_ : std_;
}

CivilTime TimeZone::toLocal(int64_t utc) const {
  const int32_t offset = offsetAt(utc);
  CivilTime t = civilFromSeconds(utc + offset);
  t.offset = offset;
  return t;
}

int64_t TimeZone::fromLocal(const CivilTime& local) const {
  int64_t naive = secondsFromCivil(local);
  int64_t asStandard = naive - std_;
  return isDst(asStandard) ? naive - dst_ : asStandard;
}

}  // namespace dither
