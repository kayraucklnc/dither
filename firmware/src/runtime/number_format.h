// Numbers as text (format.md §2 "Numbers").
#pragma once

#include <optional>
#include <string>
#include <string_view>

namespace dither {

constexpr int kAutoDecimals = -1;
constexpr int kMaxDecimals = 15;

// round_half_away(v * 10^d) as a 64-bit integer, then the point inserted.
// decimals == kAutoDecimals: two places, trailing zeros and point stripped.
// `sep` (may be empty) groups the integer part in threes.
// Returns nullopt when v is not finite or the scaled value does not fit in
// 64 bits; callers turn that into the fallback.
std::optional<std::string> formatNumber(double v, int decimals, std::string_view sep = {});

// `num.compact` for |v| >= 1000: v / 1e9, 1e6 or 1e3 - the largest not above
// |v|, chosen before rounding - with 1 decimal, a trailing ".0" dropped, and
// B, M or k: 74120 -> "74.1k", 999950 -> "1000k". No thousands separator.
std::optional<std::string> formatCompact(double v);

}  // namespace dither
