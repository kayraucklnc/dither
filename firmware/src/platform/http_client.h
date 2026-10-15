// One HTTP(S) exchange with the body handed to a reader as a CharSource.
#pragma once

#include <functional>
#include <string>

#include "../runtime/json.h"
#include "../runtime/source.h"

namespace dither {

// The start of the error when a host's name cannot be looked up: no internet
// on this Wi-Fi, or one that wants a sign-in page first.
constexpr const char* kNoInternet = "could not look up";
// Free heap a TLS handshake needs. Below it the panel does not try: a failed
// handshake can leave memory behind, and a few of those in a row crash it.
constexpr uint32_t kMinHeapForTls = 45 * 1024;

struct HttpRequest {
  bool post = false;
  std::string url;
  NameValues headers;
  std::string body;         // POST only
  std::string contentType;  // POST only
};

// Reads the body; returns false with a reason to fail the exchange.
using BodyReader = std::function<bool(CharSource& body, std::string& error)>;

// Follows up to three redirects for a GET, but only within the same origin
// (or http -> https on the same host). `status` receives the final HTTP
// status, or a negative transport error.
bool httpExchange(const HttpRequest& request, const BodyReader& read, int& status, std::string& error);

}  // namespace dither
