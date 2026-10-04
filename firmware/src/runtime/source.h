// Declared HTTP sources and how a response becomes values (format.md §2).
#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "json.h"
#include "value.h"

namespace dither {

struct SourceValueSpec {
  enum class Agg { None, Count, Sum, Invalid };  // Invalid: unknown, or a sum without a field
  std::string key;
  std::string path;
  int count = -1;  // -1: a single value; otherwise a series of at most 64
  Agg agg = Agg::None;
  std::string field;  // for Sum: the path inside each element
  int aggId = -1;     // its slot in the filter's aggregates
};

using NameValues = std::vector<std::pair<std::string, std::string>>;

// OAuth 2 refresh: POST `form`, read the token and its lifetime.
struct SourceAuth {
  std::string url;
  NameValues form;
  std::string tokenPath = "access_token";
  std::string expiresPath = "expires_in";
};

constexpr uint32_t kMinEvery = 60;
constexpr int64_t kDefaultTokenLifetime = 3600;
constexpr int64_t kTokenMargin = 60;  // a token is renewed a minute before it expires

struct SourceSpec {
  std::string id;
  std::string url;
  NameValues headers;
  uint32_t every = kMinEvery;  // seconds between fetches, at least 60
  std::vector<SourceValueSpec> values;
  std::optional<SourceAuth> auth;
  bool decodes = false;  // `decode.aes256ecb` present
  std::optional<std::array<uint8_t, 32>> aesKey;  // unset when the hex is malformed
  bool usesPlaceholders = false;  // in the URL or a header value
};

std::vector<SourceSpec> parseSources(JsonView sources);

// The token and its lifetime from a token endpoint's reply.
bool readToken(JsonView reply, const SourceAuth& auth, std::string& token, int64_t& lifetimeSeconds);

// A filter keeping only what the source's paths can reach.
JsonFilter buildFilter(const SourceSpec& source);

// Follows a dotted path. A digits-only segment indexes an array; on an object
// it is looked up as a key. Ending on an object or array gives null unless
// `count` asks for a series.
Value extractPath(JsonView root, std::string_view path, int count);

// Replaces every `<id>.<key>` of the source from a successful response.
// `doc` must have been parsed with buildFilter(source), which works the
// aggregates out while streaming.
void applyResponse(const SourceSpec& source, const JsonDoc& doc, ValueStore& store);

// An aggregate worked out from a whole, unfiltered document - the same answer
// the streaming filter gives, for tests and in-memory documents.
Value aggregateFromTree(JsonView root, const SourceValueSpec& spec);

}  // namespace dither
