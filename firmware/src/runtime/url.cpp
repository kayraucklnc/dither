#include "url.h"

#include <cctype>

namespace dither {

std::optional<Origin> originOf(std::string_view url) {
  Origin o;
  size_t sep = url.find("://");
  if (sep == std::string_view::npos) return std::nullopt;
  for (char c : url.substr(0, sep)) o.scheme += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  if (o.scheme != "http" && o.scheme != "https") return std::nullopt;
  std::string_view rest = url.substr(sep + 3);
  std::string_view authority = rest.substr(0, rest.find_first_of("/?#"));
  if (authority.find('@') != std::string_view::npos) return std::nullopt;  // no credentials in URLs
  size_t colon = authority.rfind(':');
  std::string_view host = authority;
  o.port = o.scheme == "https" ? 443 : 80;
  if (colon != std::string_view::npos && authority.find(']') == std::string_view::npos) {
    host = authority.substr(0, colon);
    std::string_view digits = authority.substr(colon + 1);
    if (digits.empty() || digits.size() > 5) return std::nullopt;
    int port = 0;
    for (char c : digits) {
      if (c < '0' || c > '9') return std::nullopt;
      port = port * 10 + (c - '0');
    }
    if (port == 0 || port > 65535) return std::nullopt;
    o.port = port;
  }
  if (host.empty()) return std::nullopt;
  for (char c : host) o.host += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return o;
}

std::optional<std::string> resolveLocation(std::string_view base, std::string_view location) {
  if (location.find("://") != std::string_view::npos) {
    if (!originOf(location)) return std::nullopt;
    return std::string(location);
  }
  auto origin = originOf(base);
  if (!origin || location.empty()) return std::nullopt;
  if (location.substr(0, 2) == "//") return origin->scheme + ":" + std::string(location);
  size_t sep = base.find("://");
  std::string_view rest = base.substr(sep + 3);
  size_t pathStart = rest.find_first_of("/?#");
  std::string root = std::string(base.substr(0, sep + 3)) + std::string(rest.substr(0, pathStart));
  if (location[0] == '/') return root + std::string(location);
  // Relative to the current path's directory.
  std::string_view path = pathStart == std::string_view::npos ? "/" : rest.substr(pathStart);
  path = path.substr(0, path.find_first_of("?#"));
  size_t slash = path.rfind('/');
  return root + std::string(path.substr(0, slash + 1)) + std::string(location);
}

bool redirectAllowed(std::string_view from, std::string_view to) {
  auto a = originOf(from), b = originOf(to);
  if (!a || !b) return false;
  if (*a == *b) return true;
  return a->scheme == "http" && b->scheme == "https" && a->host == b->host && b->port == 443 && a->port == 80;
}

}  // namespace dither
