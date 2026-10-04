// Source fetches: placeholders, OAuth tokens, HTTP(S) with a redirect policy,
// chunked and AES-encrypted bodies, all streamed into the filtered JSON reader.
#pragma once

#include <cstdint>
#include <optional>
#include <string>

#include "../runtime/cache_codec.h"
#include "../runtime/json.h"
#include "../runtime/program.h"
#include "../runtime/source.h"

namespace dither {

// HTTPS is verified against the ESP-IDF certificate bundle linked into the
// Arduino core. `cache` supplies and receives the source's OAuth token.
// False on any failure, with a reason in `error`.
bool fetchSource(const SourceSpec& source, const Program& program, std::optional<int64_t> now, ValueCache& cache,
                 JsonDoc& out, std::string& error);

}  // namespace dither
