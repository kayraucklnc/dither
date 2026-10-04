// The value cache that survives deep sleep and power loss: per-source fetch
// state plus every fetched value, tagged with the CRC of the blob it belongs
// to so a newly flashed configuration starts clean.
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "bytes.h"
#include "value.h"
#include "wake.h"

namespace dither {

struct ValueCache {
  uint32_t blobCrc = 0;
  std::vector<std::pair<std::string, SourceState>> sources;
  ValueStore values;  // fetched values only, "<id>.<key>"
  // The outcome of the last wake that tried the network; a wake that needs
  // none reports these again (format.md §5 step 3).
  bool lastOnline = false;
  std::optional<double> lastRssi;
  // OAuth access tokens by source id.
  struct Token {
    std::string token;
    int64_t expiresAt = 0;
  };
  std::vector<std::pair<std::string, Token>> tokens;

  SourceState stateOf(const std::string& id) const;
  void setState(const std::string& id, const SourceState& state);
  // A token still good for at least a minute, or nothing.
  std::optional<std::string> tokenFor(const std::string& id, std::optional<int64_t> now) const;
  void setToken(const std::string& id, const std::string& token, int64_t expiresAt);
  void dropToken(const std::string& id);
};

constexpr size_t kMaxCacheBytes = 6 * 1024;

// Drops fetched values, largest first, until the encoding fits `maxBytes`.
// Returns the references dropped (the caller logs them).
std::vector<std::string> fitCache(ValueCache& cache, size_t maxBytes = kMaxCacheBytes);

std::vector<uint8_t> encodeCache(const ValueCache& cache);
// False on any truncation or unknown tag; `out` is untouched then.
bool decodeCache(ByteSpan bytes, ValueCache& out);

}  // namespace dither
