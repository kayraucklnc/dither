#include "placeholders.h"

#include <optional>

namespace dither {
namespace {

constexpr size_t kMaxOffsetDigits = 10;

struct Placeholder {
  size_t length = 0;  // of the whole "{{...}}"
  bool today = false;  // {{today±N}}: local midnight, in seconds
  int64_t offset = 0;
  bool hasPattern = false;
  std::string_view pattern;
};

// Reads "+N" / "-N" at `i`; false (and `i` untouched) when there is none.
bool readOffset(std::string_view s, size_t& i, int64_t& offset) {
  if (i >= s.size() || (s[i] != '+' && s[i] != '-')) return false;
  const int64_t sign = s[i] == '-' ? -1 : 1;
  size_t j = i + 1, start = j;
  int64_t n = 0;
  while (j < s.size() && s[j] >= '0' && s[j] <= '9' && j - start < kMaxOffsetDigits) n = n * 10 + (s[j++] - '0');
  if (j == start) return false;
  offset = sign * n;
  i = j;
  return true;
}

// {{today}}, {{today+N}}, {{today-N}}; no pattern form.
std::optional<Placeholder> matchToday(std::string_view s) {
  constexpr std::string_view kHead = "{{today";
  if (s.substr(0, kHead.size()) != kHead) return std::nullopt;
  Placeholder p;
  p.today = true;
  size_t i = kHead.size();
  if (i < s.size() && (s[i] == '+' || s[i] == '-') && !readOffset(s, i, p.offset)) return std::nullopt;
  if (s.substr(i, 2) != "}}") return std::nullopt;
  p.length = i + 2;
  return p;
}

// Matches a placeholder at the start of `s`, which begins with "{{".
std::optional<Placeholder> match(std::string_view s) {
  if (auto today = matchToday(s)) return today;
  constexpr std::string_view kHead = "{{now";
  if (s.substr(0, kHead.size()) != kHead) return std::nullopt;
  Placeholder p;
  size_t i = kHead.size();
  if (i < s.size() && (s[i] == '+' || s[i] == '-')) {
    if (!readOffset(s, i, p.offset)) return std::nullopt;
    if (i >= s.size() || s[i] != '|') return std::nullopt;  // {{now+N}} needs a pattern
  }
  if (i < s.size() && s[i] == '|') {
    size_t close = s.find("}}", i + 1);
    if (close == std::string_view::npos) return std::nullopt;
    p.hasPattern = true;
    p.pattern = s.substr(i + 1, close - i - 1);
    p.length = close + 2;
    return p;
  }
  if (s.substr(i, 2) != "}}") return std::nullopt;
  p.length = i + 2;
  return p;
}

}  // namespace

int64_t localMidnight(int64_t now, const TimeZone& tz) {
  CivilTime day = tz.toLocal(now);
  day.hour = day.minute = day.second = 0;
  return tz.fromLocal(day);
}

bool hasPlaceholder(std::string_view text) {
  for (size_t at = text.find("{{"); at != std::string_view::npos; at = text.find("{{", at + 1)) {
    if (match(text.substr(at))) return true;
  }
  return false;
}

std::string expandPlaceholders(std::string_view text, bool encode, int64_t now, const TimeZone& tz,
                               const Locale& locale) {
  std::string out;
  size_t i = 0;
  while (i < text.size()) {
    size_t at = text.find("{{", i);
    if (at == std::string_view::npos) break;
    out.append(text.substr(i, at - i));
    auto p = match(text.substr(at));
    if (!p) {
      out += '{';
      i = at + 1;
      continue;
    }
    std::string value = p->today        ? std::to_string(localMidnight(now, tz) + p->offset)
                        : p->hasPattern ? formatTime(tz.toLocal(now + p->offset), p->pattern, locale)
                                        : std::to_string(now);
    out += encode ? percentEncode(value) : value;
    i = at + p->length;
  }
  out.append(text.substr(i));
  return out;
}

std::string percentEncode(std::string_view text) {
  static const char kHex[] = "0123456789ABCDEF";
  std::string out;
  for (char ch : text) {
    unsigned char c = static_cast<unsigned char>(ch);
    bool keep = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' ||
                c == '_' || c == '~';
    if (keep) {
      out += static_cast<char>(c);
    } else {
      out += '%';
      out += kHex[c >> 4];
      out += kHex[c & 15];
    }
  }
  return out;
}

std::string formEncode(const NameValues& form) {
  std::string out;
  for (const auto& [name, value] : form) {
    if (!out.empty()) out += '&';
    out += percentEncode(name) + "=" + percentEncode(value);
  }
  return out;
}

}  // namespace dither
