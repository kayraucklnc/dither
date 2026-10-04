#include "http_client.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>

#include <memory>

#include "../runtime/body_streams.h"
#include "../runtime/url.h"
#include "log.h"

// The Mozilla CA bundle ESP-IDF builds into libmbedtls (CONFIG_MBEDTLS_
// CERTIFICATE_BUNDLE_DEFAULT_FULL in the Arduino core's sdkconfig).
extern const uint8_t kCaBundleStart[] asm("_binary_x509_crt_bundle_start");
extern const uint8_t kCaBundleEnd[] asm("_binary_x509_crt_bundle_end");

namespace dither {
namespace {

constexpr uint32_t kConnectTimeoutMs = 10000;  // connect + TLS + response headers
constexpr uint32_t kIdleTimeoutMs = 10000;     // no body bytes for this long
constexpr uint32_t kBodyTimeoutMs = 30000;     // the whole body, parsing included
constexpr int kMaxRedirects = 3;

// The response body with an idle and an overall deadline. Requests are
// HTTP/1.0, so a server should not chunk; if one does, ChunkedSource undoes it.
class BodySource : public CharSource {
 public:
  BodySource(NetworkClient& client, int contentLength)
      : client_(client), remaining_(contentLength), start_(millis()) {}

  int peek() override { return fill() ? buf_[pos_] : -1; }
  int get() override { return fill() ? buf_[pos_++] : -1; }
  const char* timeout() const { return timeout_; }

 private:
  bool fill() {
    if (pos_ < len_) return true;
    if (remaining_ == 0 || timeout_) return false;
    uint32_t lastByte = millis();
    while (true) {
      if (millis() - start_ > kBodyTimeoutMs) {
        timeout_ = "the body took too long";
        return false;
      }
      int avail = client_.available();
      if (avail > 0) {
        size_t want = sizeof buf_;
        if (remaining_ > 0 && static_cast<size_t>(remaining_) < want) want = static_cast<size_t>(remaining_);
        int n = client_.read(buf_, want);
        if (n > 0) {
          pos_ = 0;
          len_ = static_cast<size_t>(n);
          if (remaining_ > 0) remaining_ -= n;
          return true;
        }
      } else if (!client_.connected()) {
        return false;
      }
      if (millis() - lastByte > kIdleTimeoutMs) {
        timeout_ = "the server stopped sending";
        return false;
      }
      delay(2);  // yields to the Wi-Fi and TCP tasks
    }
  }

  NetworkClient& client_;
  int remaining_;  // -1: until the connection closes
  uint32_t start_;
  uint8_t buf_[512];
  size_t pos_ = 0, len_ = 0;
  const char* timeout_ = nullptr;
};

std::unique_ptr<NetworkClient> makeClient(const std::string& url) {
  if (url.rfind("https://", 0) == 0) {
    auto secure = std::make_unique<NetworkClientSecure>();
    secure->setCACertBundle(kCaBundleStart, static_cast<size_t>(kCaBundleEnd - kCaBundleStart));
    return secure;
  }
  if (url.rfind("http://", 0) == 0) return std::make_unique<NetworkClient>();
  return nullptr;
}

bool isRedirect(int status) {
  return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
}

}  // namespace

bool httpExchange(const HttpRequest& request, const BodyReader& read, int& status, std::string& error) {
  std::string url = request.url;
  for (int hop = 0;; ++hop) {
    std::unique_ptr<NetworkClient> client = makeClient(url);
    if (!client) {
      error = "unsupported URL scheme";
      return false;
    }
    HTTPClient http;
    http.useHTTP10(true);
    http.setConnectTimeout(kConnectTimeoutMs);
    http.setTimeout(kConnectTimeoutMs);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    const char* collect[] = {"Transfer-Encoding", "Location"};
    http.collectHeaders(collect, 2);
    if (!http.begin(*client, url.c_str())) {
      error = "bad URL";
      return false;
    }
    for (const auto& [name, value] : request.headers) http.addHeader(name.c_str(), value.c_str());
    if (request.post) {
      http.addHeader("Content-Type", request.contentType.c_str());
      status = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(request.body.data())), request.body.size());
    } else {
      status = http.GET();
    }
    if (!request.post && isRedirect(status)) {
      auto next = resolveLocation(url, http.header("Location").c_str());
      http.end();
      if (!next || !redirectAllowed(url, *next)) {
        error = "redirect to another origin refused";
        return false;
      }
      if (hop + 1 > kMaxRedirects) {
        error = "too many redirects";
        return false;
      }
      dlog("http: redirected to %s", next->c_str());
      url = *next;
      continue;
    }
    if (status != HTTP_CODE_OK) {
      error = status < 0 ? std::string("HTTP: ") + http.errorToString(status).c_str()
                         : "HTTP status " + std::to_string(status);
      http.end();
      return false;
    }
    NetworkClient* stream = http.getStreamPtr();
    if (stream == nullptr) {
      error = "no response body";
      http.end();
      return false;
    }
    BodySource body(*stream, http.getSize());
    bool ok = false;
    if (http.header("Transfer-Encoding").equalsIgnoreCase("chunked")) {
      ChunkedSource chunked(body);
      ok = read(chunked, error);
      if (!chunked.error().empty()) error = chunked.error(), ok = false;
    } else {
      ok = read(body, error);
    }
    if (body.timeout()) error = body.timeout(), ok = false;
    http.end();
    return ok;
  }
}

}  // namespace dither
