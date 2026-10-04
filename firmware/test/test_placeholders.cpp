#include "../src/runtime/placeholders.h"
#include "check.h"

using namespace dither;

namespace {

std::string expand(const char* text, bool encode, int64_t now) {
  static TimeZone tz;
  static bool parsed = tz.parse("CET-1CEST,M3.5.0,M10.5.0/3");
  static Locale locale = Locale::fromJson(JsonView());
  (void)parsed;
  return expandPlaceholders(text, encode, now, tz, locale);
}

constexpr int64_t kNow = 1782907200;  // 2026-07-01 14:00 local (CEST)

}  // namespace

TEST(placeholders_expand) {
  CHECK_EQ(expand("a={{now}}&b=1", true, kNow), std::string("a=1782907200&b=1"));
  CHECK_EQ(expand("https://x/?t={{now|YYYY-MM-DDTHH:mm:ssZ}}", true, kNow),
           std::string("https://x/?t=2026-07-01T14%3A00%3A00%2B02%3A00"));
  CHECK_EQ(expand("{{now|YYYY-MM-DDTHH:mm:ssZ}}", false, kNow), std::string("2026-07-01T14:00:00+02:00"));
  CHECK_EQ(expand("{{now+86400|YYYY-MM-DD}}/{{now-3600|HH}}", false, kNow), std::string("2026-07-02/13"));
  CHECK_EQ(expand("{{now|dddd D MMMM}}", true, kNow), std::string("Wednesday%201%20July"));
  CHECK_EQ(expand("{{now|[at] HH}}", false, kNow), std::string("at 14"));
  // Across the spring change: 01:59:59 CET plus one second is 03:00 CEST.
  CHECK_EQ(expand("{{now|HH:mm Z}} {{now+1|HH:mm Z}}", false, 1774745999), std::string("01:59 +01:00 03:00 +02:00"));
}

TEST(placeholders_leave_other_braces_alone) {
  const char* const literal[] = {"{{nowx}}", "{{now+5}}", "{{ now }}", "{{foo}}", "{{now|HH", "{", "}}{{", "{{now-|HH}}",
                                 "{{now+12345678901|HH}}"};
  for (const char* s : literal) {
    CHECK_EQ(expand(s, true, kNow), std::string(s));
    CHECK(!hasPlaceholder(s));
  }
  CHECK_EQ(expand("{{{now}}}", false, kNow), std::string("{1782907200}"));
  CHECK(hasPlaceholder("x{{now}}"));
  CHECK(hasPlaceholder("{{now-60|HH}}"));
  CHECK(!hasPlaceholder("https://api.example.com/?a=1"));
}

TEST(percent_and_form_encoding) {
  CHECK_EQ(percentEncode("aZ09-._~ /:+&=\xC3\xA7"), std::string("aZ09-._~%20%2F%3A%2B%26%3D%C3%A7"));
  NameValues form = {{"grant_type", "refresh_token"}, {"refresh_token", "1//0a b+c"}};
  CHECK_EQ(formEncode(form), std::string("grant_type=refresh_token&refresh_token=1%2F%2F0a%20b%2Bc"));
  CHECK_EQ(formEncode({}), std::string());
}

TEST(source_spec_auth_decode_placeholders) {
  JsonDoc doc;
  CHECK(doc.parse(R"([{"id":"g","url":"https://x/?timeMin={{now|YYYY-MM-DDTHH:mm:ssZ}}","every":5,
      "auth":{"url":"https://oauth2.googleapis.com/token","form":[["grant_type","refresh_token"]]},
      "values":[]},
    {"id":"t","url":"https://y/","headers":[["X-When","{{now}}"]],"every":120,
      "decode":{"aes256ecb":"4df1238da4dafc34db7e30619fad5ab0dc123715c1eccfd1ea62193ea5938db7"},"values":[]},
    {"id":"bad","url":"https://z/","decode":{"aes256ecb":"zz"},"values":[]}])")
            .ok);
  auto s = parseSources(doc.root());
  CHECK_EQ(s.size(), size_t{3});
  CHECK_EQ(s[0].every, 60u);  // at least a minute
  CHECK(s[0].usesPlaceholders && s[0].auth && !s[0].decodes);
  CHECK_EQ(s[0].auth->tokenPath, std::string("access_token"));
  CHECK_EQ(s[0].auth->expiresPath, std::string("expires_in"));
  CHECK(s[1].usesPlaceholders && s[1].decodes && s[1].aesKey && (*s[1].aesKey)[0] == 0x4d);
  CHECK(s[2].decodes && !s[2].aesKey && !s[2].usesPlaceholders);
  CHECK_EQ(s[2].every, 60u);

  JsonDoc reply;
  CHECK(reply.parse(R"({"access_token":"ya29.abc","expires_in":3599,"token_type":"Bearer"})").ok);
  std::string token;
  int64_t lifetime = 0;
  CHECK(readToken(reply.root(), *s[0].auth, token, lifetime));
  CHECK_EQ(token, std::string("ya29.abc"));
  CHECK_EQ(lifetime, int64_t{3599});
  CHECK(reply.parse(R"({"access_token":"t"})").ok);
  CHECK(readToken(reply.root(), *s[0].auth, token, lifetime) && lifetime == 3600);
  CHECK(reply.parse(R"({"error":"invalid_grant"})").ok);
  CHECK(!readToken(reply.root(), *s[0].auth, token, lifetime));
}

TEST(placeholders_today) {
  // 2026-07-01 14:00 CEST: midnight was 2026-06-30T22:00Z.
  CHECK_EQ(expand("{{today}}", true, kNow), std::string("1782856800"));
  CHECK_EQ(expand("from={{today-86400}}&to={{today+86400}}", true, kNow),
           std::string("from=1782770400&to=1782943200"));
  CHECK_EQ(expand("{{today+0}}", false, kNow), std::string("1782856800"));
  // Spring change day: midnight is still CET (23:00Z the day before), and a
  // day later is 01:00 CEST - the offset is plain seconds.
  CHECK_EQ(expand("{{today}} {{today+86400}}", false, 1774778400), std::string("1774738800 1774825200"));
  // Autumn change day: midnight in CEST.
  CHECK_EQ(expand("{{today}}", false, 1792926000), std::string("1792879200"));
  // Literal: other forms, and a pattern (today has none).
  for (const char* s : {"{{today|HH}}", "{{today+}}", "{{todayx}}", "{{today +1}}"}) {
    CHECK_EQ(expand(s, true, kNow), std::string(s));
    CHECK(!hasPlaceholder(s));
  }
  CHECK(hasPlaceholder("x={{today-3600}}"));
}

TEST(today_when_midnight_is_skipped) {
  // America/Santiago 2026: clocks go from Saturday 24:00 (-04) to Sunday 01:00
  // (-03), so Sunday 6 September has no 00:00. The spec's local-to-instant
  // rule (standard offset unless that instant is already daylight time) puts
  // "midnight" at 03:00Z - 23:00 on the Saturday.
  TimeZone scl;
  CHECK(scl.parse("<-04>4<-03>,M9.1.6/24,M4.1.6/24"));
  CHECK_EQ(localMidnight(1788706800, scl), int64_t{1788663600});  // now: Sunday 12:00 -03
  CHECK_EQ(localMidnight(1788753600, scl), int64_t{1788750000});  // Monday 01:00 -03: midnight 03:00Z
}
