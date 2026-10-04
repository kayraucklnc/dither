#include "../src/runtime/url.h"
#include "check.h"

using namespace dither;

TEST(url_origins) {
  auto o = originOf("https://API.example.com/v1?q=1");
  CHECK(o && o->scheme == "https" && o->host == "api.example.com" && o->port == 443);
  CHECK(originOf("http://h:8080")->port == 8080);
  CHECK(!originOf("ftp://h/"));
  CHECK(!originOf("https://user:pw@h/"));
  CHECK(!originOf("https://h:99999/"));
  CHECK(!originOf("h/path"));
}

TEST(url_redirects) {
  CHECK(resolveLocation("https://h/a/b?x", "/c") == std::optional<std::string>(std::string("https://h/c")));
  CHECK(resolveLocation("https://h/a/b?x", "c?d") == std::optional<std::string>(std::string("https://h/a/c?d")));
  CHECK(resolveLocation("https://h", "c") == std::optional<std::string>(std::string("https://h/c")));
  CHECK(resolveLocation("https://h/a", "//other/x") == std::optional<std::string>(std::string("https://other/x")));
  CHECK(resolveLocation("https://h/a", "https://k/z") == std::optional<std::string>(std::string("https://k/z")));
  CHECK(!resolveLocation("https://h/a", "gopher://k/"));

  CHECK(redirectAllowed("https://h/a", "https://h/b"));
  CHECK(redirectAllowed("http://h/a", "https://h/b"));        // upgrade
  CHECK(!redirectAllowed("https://h/a", "http://h/b"));       // downgrade
  CHECK(!redirectAllowed("https://h/a", "https://evil/b"));   // another host
  CHECK(!redirectAllowed("https://h/a", "https://h:8443/b"));
  CHECK(redirectAllowed("https://H/a", "https://h:443/b"));
}
