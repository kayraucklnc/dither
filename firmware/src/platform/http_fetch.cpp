#include "http_fetch.h"

#include <Arduino.h>

#include "../runtime/body_streams.h"
#include "../runtime/placeholders.h"
#include "aes_mbedtls.h"
#include "http_client.h"
#include "log.h"

namespace dither {
namespace {

// The token from the cache, or a fresh one from the token endpoint.
bool accessToken(const SourceSpec& source, std::optional<int64_t> now, ValueCache& cache, std::string& token,
                 std::string& error) {
  if (auto cached = cache.tokenFor(source.id, now)) {
    token = *cached;
    return true;
  }
  const SourceAuth& auth = *source.auth;
  HttpRequest request;
  request.post = true;
  request.url = auth.url;
  request.body = formEncode(auth.form);
  request.contentType = "application/x-www-form-urlencoded";
  request.headers = {{"Accept", "application/json"}};
  JsonFilter filter;
  filter.addPath(auth.tokenPath);
  filter.addPath(auth.expiresPath);
  JsonDoc reply;
  auto read = [&](CharSource& body, std::string& err) {
    JsonParseResult r = reply.parse(body, &filter, JsonLimits::response());
    if (!r.ok) err = "token reply: " + r.error;
    return r.ok;
  };
  int status = 0;
  int64_t lifetime = 0;
  if (!httpExchange(request, read, status, error)) {
    error = "token request failed: " + error;
    return false;
  }
  if (!readToken(reply.root(), auth, token, lifetime)) {
    error = "token reply has no '" + auth.tokenPath + "'";
    return false;
  }
  if (now) cache.setToken(source.id, token, *now + lifetime);  // without a clock it is used once
  dlog("source %s: new access token, valid %lld s", source.id.c_str(), static_cast<long long>(lifetime));
  return true;
}

}  // namespace

bool fetchSource(const SourceSpec& source, const Program& program, std::optional<int64_t> now, ValueCache& cache,
                 JsonDoc& out, std::string& error) {
  if (source.decodes && !source.aesKey) {
    error = "decode key is not 64 hex digits";
    return false;
  }
  HttpRequest request;
  request.url = now ? expandPlaceholders(source.url, true, *now, program.timeZone(), program.locale()) : source.url;
  for (const auto& [name, value] : source.headers) {
    request.headers.emplace_back(
        name, now ? expandPlaceholders(value, false, *now, program.timeZone(), program.locale()) : value);
  }
  if (source.auth) {
    std::string token;
    if (!accessToken(source, now, cache, token, error)) return false;
    request.headers.emplace_back("Authorization", "Bearer " + token);
  }

  const JsonFilter filter = buildFilter(source);
  auto read = [&](CharSource& body, std::string& err) {
    if (!source.decodes) {
      JsonParseResult r = out.parse(body, &filter, JsonLimits::response());
      if (!r.ok) err = "JSON: " + r.error + " at " + std::to_string(r.offset);
      return r.ok;
    }
    MbedAesDecrypter aes(*source.aesKey);
    AesEcbSource plain(body, aes);
    JsonParseResult r = out.parse(plain, &filter, JsonLimits::response());
    if (!plain.error().empty()) {
      err = "decode: " + plain.error();
      return false;
    }
    if (!r.ok) err = "JSON: " + r.error + " at " + std::to_string(r.offset);
    return r.ok;
  };
  int status = 0;
  bool ok = httpExchange(request, read, status, error);
  if (!ok && source.auth && status == 401) cache.dropToken(source.id);  // renew next time
  return ok;
}

}  // namespace dither
