// Just enough URL handling to decide whether a redirect may be followed.
#pragma once

#include <optional>
#include <string>
#include <string_view>

namespace dither {

struct Origin {
  std::string scheme;  // "http" or "https"
  std::string host;    // lower-cased
  int port = 0;        // explicit or the scheme's default
  bool operator==(const Origin& o) const { return scheme == o.scheme && host == o.host && port == o.port; }
};

std::optional<Origin> originOf(std::string_view url);

// The absolute URL a Location header points to, from `base`; nullopt if it
// cannot be resolved.
std::optional<std::string> resolveLocation(std::string_view base, std::string_view location);

// Same origin, or the same host moving from http to https. Anything else
// would hand the source's headers (API keys, a bearer token) to another
// server, or drop TLS.
bool redirectAllowed(std::string_view from, std::string_view to);

}  // namespace dither
