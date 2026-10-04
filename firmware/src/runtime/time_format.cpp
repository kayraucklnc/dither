#include "time_format.h"

#include <cmath>
#include <cstdlib>

namespace dither {
namespace {

const char* const kDays[] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
const char* const kDaysShort[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
const char* const kMonths[] = {"January", "February", "March",     "April",   "May",      "June",
                               "July",    "August",   "September", "October", "November", "December"};
const char* const kMonthsShort[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

std::vector<std::string> names(JsonView arr, const char* const* defaults, size_t n) {
  std::vector<std::string> out;
  for (size_t i = 0; i < n; ++i) {
    JsonView v = arr[i];
    out.emplace_back(v.isString() ? std::string(v.string()) : std::string(defaults[i]));
  }
  return out;
}

class IsoReader {
 public:
  explicit IsoReader(std::string_view s) : s_(s) {}
  bool atEnd() const { return i_ == s_.size(); }
  char peek() const { return atEnd() ? '\0' : s_[i_]; }
  bool accept(char c) {
    if (peek() != c) return false;
    ++i_;
    return true;
  }
  bool digits(int count, int& out) {
    out = 0;
    for (int k = 0; k < count; ++k) {
      char c = peek();
      if (c < '0' || c > '9') return false;
      out = out * 10 + (c - '0');
      ++i_;
    }
    return true;
  }
  bool fraction() {
    size_t start = i_;
    while (peek() >= '0' && peek() <= '9') ++i_;
    return i_ > start;
  }

 private:
  std::string_view s_;
  size_t i_ = 0;
};

std::string pad2(int v) {
  std::string s = std::to_string(v);
  return s.size() < 2 ? "0" + s : s;
}

std::string pad4(int v) {
  std::string s = std::to_string(v < 0 ? -v : v);
  while (s.size() < 4) s.insert(0, "0");
  return v < 0 ? "-" + s : s;
}

const std::string& pick(const std::vector<std::string>& list, int index) {
  static const std::string kEmpty;
  return index >= 0 && static_cast<size_t>(index) < list.size() ? list[static_cast<size_t>(index)] : kEmpty;
}

// Tokens in "longest first" order: at any position the first match wins.
const char* const kTokens[] = {"YYYY", "MMMM", "dddd", "MMM", "ddd", "MM", "DD", "HH", "hh",
                               "mm",   "ss",   "M",    "D",   "H",   "h",  "A",  "Z"};

std::string offsetText(int32_t offset) {
  const int32_t minutes = (offset < 0 ? -offset : offset) / 60;
  return std::string(offset < 0 ? "-" : "+") + pad2(minutes / 60) + ":" + pad2(minutes % 60);
}

std::string renderToken(std::string_view token, const CivilTime& t, const Locale& loc) {
  int h12 = t.hour % 12 == 0 ? 12 : t.hour % 12;
  if (token == "YYYY") return pad4(t.year);
  if (token == "MMMM") return pick(loc.months, t.month - 1);
  if (token == "MMM") return pick(loc.monthsShort, t.month - 1);
  if (token == "MM") return pad2(t.month);
  if (token == "M") return std::to_string(t.month);
  if (token == "DD") return pad2(t.day);
  if (token == "D") return std::to_string(t.day);
  if (token == "dddd") return pick(loc.days, t.weekday);
  if (token == "ddd") return pick(loc.daysShort, t.weekday);
  if (token == "HH") return pad2(t.hour);
  if (token == "H") return std::to_string(t.hour);
  if (token == "hh") return pad2(h12);
  if (token == "h") return std::to_string(h12);
  if (token == "mm") return pad2(t.minute);
  if (token == "ss") return pad2(t.second);
  if (token == "A") return t.hour < 12 ? "AM" : "PM";
  if (token == "Z") return offsetText(t.offset);
  return std::string(token);
}

}  // namespace

Locale Locale::fromJson(JsonView locale) {
  Locale l;
  l.days = names(locale["days"], kDays, 7);
  l.daysShort = names(locale["daysShort"], kDaysShort, 7);
  l.months = names(locale["months"], kMonths, 12);
  l.monthsShort = names(locale["monthsShort"], kMonthsShort, 12);
  return l;
}

std::optional<TimeValue> parseIsoTime(std::string_view s) {
  IsoReader r(s);
  CivilTime f;
  if (!r.digits(4, f.year) || !r.accept('-') || !r.digits(2, f.month) || !r.accept('-') ||
      !r.digits(2, f.day)) {
    return std::nullopt;
  }
  if (f.month < 1 || f.month > 12 || f.day < 1 || f.day > daysInMonth(f.year, f.month)) return std::nullopt;
  TimeValue tv;
  tv.local = true;
  if (r.accept('T')) {
    if (!r.digits(2, f.hour) || !r.accept(':') || !r.digits(2, f.minute)) return std::nullopt;
    if (r.accept(':')) {
      if (!r.digits(2, f.second)) return std::nullopt;
      if (r.accept('.') && !r.fraction()) return std::nullopt;
    }
    if (f.hour > 23 || f.minute > 59 || f.second > 59) return std::nullopt;
    int offset = 0;
    bool zoned = false;
    if (r.accept('Z')) {
      zoned = true;
    } else if (r.peek() == '+' || r.peek() == '-') {
      int sign = r.peek() == '-' ? -1 : 1;
      r.accept(r.peek());
      int oh = 0, om = 0;
      if (!r.digits(2, oh) || !r.accept(':') || !r.digits(2, om) || oh > 23 || om > 59) return std::nullopt;
      offset = sign * (oh * 3600 + om * 60);
      zoned = true;
    }
    if (zoned) {
      tv.local = false;
      tv.instant = static_cast<double>(secondsFromCivil(f) - offset);
    }
  }
  if (!r.atEnd()) return std::nullopt;
  f.weekday = civilFromSeconds(daysFromCivil(f.year, f.month, f.day) * 86400).weekday;
  tv.fields = f;
  return tv;
}

std::optional<TimeValue> parseWallClock(std::string_view s, int64_t now, const TimeZone& tz) {
  IsoReader r(s);
  CivilTime f;
  if (!r.digits(2, f.hour) || !r.accept(':') || !r.digits(2, f.minute)) return std::nullopt;
  if (r.accept(':') && !r.digits(2, f.second)) return std::nullopt;
  if (!r.atEnd() || f.hour > 23 || f.minute > 59 || f.second > 59) return std::nullopt;

  const CivilTime today = tz.toLocal(now);
  const int64_t todayDays = daysFromCivil(today.year, today.month, today.day);
  std::optional<TimeValue> best;
  int64_t bestDistance = 0;
  for (int64_t delta = -1; delta <= 1; ++delta) {
    const CivilTime day = civilFromSeconds((todayDays + delta) * 86400);
    CivilTime c = f;
    c.year = day.year, c.month = day.month, c.day = day.day, c.weekday = day.weekday;
    const int64_t distance = std::llabs(tz.fromLocal(c) - now);
    if (!best || distance < bestDistance) {  // strict: a tie keeps the earlier day
      TimeValue tv;
      tv.local = true;
      tv.fields = c;
      best = tv;
      bestDistance = distance;
    }
  }
  return best;
}

std::optional<TimeValue> parseTimeValue(const Value& v, std::optional<int64_t> now, const TimeZone& tz) {
  if (v.isNumber()) {
    if (!std::isfinite(v.asNumber()) || std::fabs(v.asNumber()) >= kMaxInstant) return std::nullopt;
    TimeValue tv;
    tv.instant = v.asNumber();
    return tv;
  }
  if (!v.isString()) return std::nullopt;
  if (auto iso = parseIsoTime(v.asString())) return iso;
  if (now) return parseWallClock(v.asString(), *now, tz);
  return std::nullopt;
}

double toInstant(const TimeValue& t, const TimeZone& tz) {
  return t.local ? static_cast<double>(tz.fromLocal(t.fields)) : t.instant;
}

CivilTime toFields(const TimeValue& t, const TimeZone& tz) {
  if (!t.local) return tz.toLocal(static_cast<int64_t>(std::floor(t.instant)));
  CivilTime f = t.fields;
  f.offset = tz.offsetAt(tz.fromLocal(f));
  return f;
}

std::string formatTime(const CivilTime& t, std::string_view pattern, const Locale& locale) {
  std::string out;
  size_t i = 0;
  while (i < pattern.size()) {
    if (pattern[i] == '[') {
      size_t close = pattern.find(']', i + 1);
      if (close != std::string_view::npos) {
        out.append(pattern.substr(i + 1, close - i - 1));
        i = close + 1;
        continue;
      }
    }
    bool matched = false;
    for (const char* token : kTokens) {
      std::string_view tk(token);
      if (pattern.substr(i, tk.size()) == tk) {
        out += renderToken(tk, t, locale);
        i += tk.size();
        matched = true;
        break;
      }
    }
    if (!matched) out += pattern[i++];
  }
  return out;
}

}  // namespace dither
