#pragma once

#include <string>
#include <string_view>

namespace dither {

// Malformed sequences decode to U+FFFD, one per offending byte.
std::u32string decodeUtf8(std::string_view s);
std::string encodeUtf8(std::u32string_view s);

// The `upper` format (format.md §2, step 7).
std::string upperText(std::string_view s, bool turkish);

}  // namespace dither
