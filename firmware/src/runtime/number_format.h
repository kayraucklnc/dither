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

}  // namespace dither
