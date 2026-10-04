// One HTTP(S) exchange with the body handed to a reader as a CharSource.
#pragma once

#include <functional>
#include <string>

#include "../runtime/json.h"
#include "../runtime/source.h"

namespace dither {

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
