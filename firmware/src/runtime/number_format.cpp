#include "number_format.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace dither {
namespace {

// Exact doubles, so v * 10^d is a single correctly rounded multiplication,
// the same one JavaScript performs for `v * 10 ** d`.
constexpr double kPow10[] = {1e0, 1e1, 1e2,  1e3,  1e4,  1e5,  1e6,  1e7,
                             1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15};

std::string groupThousands(const std::string& digits, std::string_view sep) {
  if (sep.empty() || digits.size() <= 3) return digits;
  std::string out;
  size_t lead = digits.size() % 3;
  if (lead == 0) lead = 3;
  out.append(digits, 0, lead);
  for (size_t i = lead; i < digits.size(); i += 3) {
    out.append(sep);
    out.append(digits, i, 3);
  }
  return out;
}

}  // namespace

std::optional<std::string> formatNumber(double v, int decimals, std::string_view sep) {
  const bool automatic = decimals == kAutoDecimals;
  const int d = automatic ? 2 : std::clamp(decimals, 0, kMaxDecimals);
  if (!std::isfinite(v)) return std::nullopt;

  // std::round is exactly "nearest, ties away from zero"; floor(x + 0.5)
  // is not (it rounds 0.49999999999999994 up).
  const double r = std::round(v * kPow10[d]);
  if (!(std::fabs(r) < 9223372036854775808.0)) return std::nullopt;
  const int64_t n = static_cast<int64_t>(r);
  const bool negative = n < 0;
  uint64_t mag = negative ? static_cast<uint64_t>(-(n + 1)) + 1 : static_cast<uint64_t>(n);

  std::string digits = std::to_string(mag);
  if (digits.size() < static_cast<size_t>(d) + 1) digits.insert(0, static_cast<size_t>(d) + 1 - digits.size(), '0');
  std::string intPart = digits.substr(0, digits.size() - static_cast<size_t>(d));
  std::string frac = digits.substr(digits.size() - static_cast<size_t>(d));
  if (automatic) {
    while (!frac.empty() && frac.back() == '0') frac.pop_back();
  }

  std::string out;
  if (negative && mag != 0) out += '-';  // -0 prints as 0
  out += groupThousands(intPart, sep);
  if (!frac.empty()) {
    out += '.';
    out += frac;
  }
  return out;
}

}  // namespace dither
