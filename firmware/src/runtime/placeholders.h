// Time placeholders in source URLs and headers (format.md §2 "Sources"):
// {{now}}, {{now|PATTERN}}, {{now+N|PATTERN}}, {{now-N|PATTERN}},
// {{today}}, {{today+N}}, {{today-N}}.
#pragma once

#include <cstdint>
#include <string>
#include <string_view>

#include "source.h"
#include "time_format.h"
#include "timezone.h"

namespace dither {

bool hasPlaceholder(std::string_view text);

// Unix seconds of today's local midnight (the local-to-instant rule of
// format.md "Times" applies if midnight itself is skipped).
int64_t localMidnight(int64_t now, const TimeZone& tz);

// Substitutes every placeholder; anything else in braces is left alone. With
// `encode` the substituted text is percent-encoded (URLs); headers take it
// as is.
std::string expandPlaceholders(std::string_view text, bool encode, int64_t now, const TimeZone& tz,
                               const Locale& locale);

// Percent-encodes UTF-8 bytes, keeping ALPHA, DIGIT and "-._~".
std::string percentEncode(std::string_view text);

// application/x-www-form-urlencoded, every name and value percent-encoded.
std::string formEncode(const NameValues& form);

}  // namespace dither
