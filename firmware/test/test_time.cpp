// Reference instants were checked against Intl.DateTimeFormat in node.
#include "../src/runtime/time_format.h"
#include "../src/runtime/timezone.h"
#include <cmath>

#include "check.h"

using namespace dither;

namespace {

TimeZone zone(const char* posix) {
  TimeZone tz;
  CHECK(tz.parse(posix));
  return tz;
}

std::string local(const TimeZone& tz, int64_t utc) {
  static const Locale kLocale = Locale::fromJson(JsonView());
  return formatTime(tz.toLocal(utc), "YYYY-MM-DD HH:mm:ss ddd", kLocale);
}

CivilTime civil(int y, int mo, int d, int h, int mi, int s = 0) {
  CivilTime t;
  t.year = y, t.month = mo, t.day = d, t.hour = h, t.minute = mi, t.second = s;
  return t;
}

}  // namespace

TEST(calendar_round_trip) {
  CHECK_EQ(daysFromCivil(1970, 1, 1), int64_t{0});
  CHECK_EQ(daysFromCivil(2000, 3, 1), int64_t{11017});
  CHECK_EQ(secondsFromCivil(civil(2026, 1, 1, 0, 0)), int64_t{1767225600});
  CivilTime t = civilFromSeconds(-1);
  CHECK_EQ(t.year, 1969);
  CHECK_EQ(t.second, 59);
  CHECK_EQ(t.weekday, 3);  // Wednesday 1969-12-31
  CHECK_EQ(civilFromSeconds(1767225600).weekday, 4);  // Thursday
  CHECK_EQ(daysInMonth(2024, 2), 29);
  CHECK_EQ(daysInMonth(1900, 2), 28);
  CHECK_EQ(daysInMonth(2000, 2), 29);
}

TEST(tz_central_europe) {
  TimeZone tz = zone("CET-1CEST,M3.5.0,M10.5.0/3");
  CHECK_EQ(local(tz, 1774745999), "2026-03-29 01:59:59 Sun");
  CHECK_EQ(local(tz, 1774746000), "2026-03-29 03:00:00 Sun");
  CHECK_EQ(local(tz, 1792889999), "2026-10-25 02:59:59 Sun");
  CHECK_EQ(local(tz, 1792890000), "2026-10-25 02:00:00 Sun");
  CHECK_EQ(local(tz, 1782907200), "2026-07-01 14:00:00 Wed");
  CHECK_EQ(tz.offsetAt(1767225600), 3600);
  CHECK_EQ(tz.offsetAt(1782907200), 7200);
}

TEST(tz_southern_hemisphere_and_west) {
  TimeZone syd = zone("AEST-10AEDT,M10.1.0,M4.1.0/3");
  CHECK_EQ(local(syd, 1775318399), "2026-04-05 02:59:59 Sun");
  CHECK_EQ(local(syd, 1775318400), "2026-04-05 02:00:00 Sun");
  CHECK_EQ(local(syd, 1767186000), "2026-01-01 00:00:00 Thu");
  CHECK_EQ(local(syd, 1791043199), "2026-10-04 01:59:59 Sun");
  CHECK_EQ(local(syd, 1791043200), "2026-10-04 03:00:00 Sun");

  TimeZone la = zone("PST8PDT,M3.2.0,M11.1.0");
  CHECK_EQ(local(la, 1772963999), "2026-03-08 01:59:59 Sun");
  CHECK_EQ(local(la, 1772964000), "2026-03-08 03:00:00 Sun");
  CHECK_EQ(local(la, 1793523599), "2026-11-01 01:59:59 Sun");
  CHECK_EQ(local(la, 1793523600), "2026-11-01 01:00:00 Sun");
}

TEST(tz_fixed_and_quoted_names) {
  TimeZone ist = zone("IST-5:30");
  CHECK_EQ(ist.offsetAt(0), 19800);
  TimeZone plus = zone("<+03>-3");
  CHECK_EQ(local(plus, 1767225600), "2026-01-01 03:00:00 Thu");
  TimeZone utc = zone("UTC0");
  CHECK_EQ(utc.offsetAt(1782907200), 0);
}

TEST(tz_rejects_other_forms) {
  TimeZone tz;
  CHECK(!tz.parse(""));
  CHECK(!tz.parse("CET"));
  CHECK(!tz.parse("CET-1CEST"));              // daylight time without the M rules
  CHECK(!tz.parse("CET-1CEST,J60,J300"));
  CHECK(!tz.parse("CET-1CEST,M13.5.0,M10.5.0"));
  CHECK(!tz.parse("Europe/Rome"));
  CHECK_EQ(tz.offsetAt(1782907200), 0);  // left at UTC
}

TEST(tz_local_to_instant_rule) {
  TimeZone tz = zone("CET-1CEST,M3.5.0,M10.5.0/3");
  CHECK_EQ(tz.fromLocal(civil(2026, 7, 1, 14, 0)), int64_t{1782907200});
  CHECK_EQ(tz.fromLocal(civil(2026, 1, 1, 1, 0)), int64_t{1767225600});
  // In the spring gap: as standard time it is 01:30Z, already daylight time,
  // so the daylight offset applies: 00:30Z.
  CHECK_EQ(tz.fromLocal(civil(2026, 3, 29, 2, 30)), int64_t{1774744200});
  // In the autumn overlap: as standard time it is 01:30Z, which is standard
  // time, so the second occurrence.
  CHECK_EQ(tz.fromLocal(civil(2026, 10, 25, 2, 30)), int64_t{1792891800});
  CHECK_EQ(tz.fromLocal(civil(2026, 10, 25, 1, 30)), int64_t{1792884600});
}

TEST(iso_time_values) {
  auto d = parseIsoTime("2026-12-25");
  CHECK(d && d->local);
  CHECK_EQ(d->fields.hour, 0);
  CHECK_EQ(d->fields.weekday, 5);  // a Friday
  auto t = parseIsoTime("2026-07-01T14:05");
  CHECK(t && t->local && t->fields.minute == 5);
  auto s = parseIsoTime("2026-07-01T14:05:09.123");
  CHECK(s && s->local && s->fields.second == 9);
  auto z = parseIsoTime("2026-07-01T12:00:00Z");
  CHECK(z && !z->local && z->instant == 1782907200);
  auto off = parseIsoTime("2026-07-01T14:00+02:00");
  CHECK(off && !off->local && off->instant == 1782907200);
  auto neg = parseIsoTime("2026-07-01T07:30:00.5-04:30");
  CHECK(neg && !neg->local && neg->instant == 1782907200);

  const char* const bad[] = {"2026-7-01",        "2026-07-01T",       "2026-07-01 14:00",  "2026-07-01T14",
                             "2026-02-30",       "2026-13-01",        "2026-07-01T24:00",  "2026-07-01Z",
                             "2026-07-01T14:00:00.", "2026-07-01T14:00+0200", "2026-07-01T14:00:00ZZ",
                             "20260701",         "",                  "2026-07-01T14:60"};
  for (const char* b : bad) CHECK(!parseIsoTime(b));
}

TEST(time_tokens) {
  Locale en = Locale::fromJson(JsonView());
  CivilTime t = civil(2026, 3, 7, 13, 5, 9);
  t.weekday = 6;
  CHECK_EQ(formatTime(t, "YYYY-MM-DD HH:mm:ss", en), "2026-03-07 13:05:09");
  CHECK_EQ(formatTime(t, "dddd ddd MMMM MMM M D", en), "Saturday Sat March Mar 3 7");
  CHECK_EQ(formatTime(t, "h:mm A hh H", en), "1:05 PM 01 13");
  CHECK_EQ(formatTime(t, "[at] HH:mm", en), "at 13:05");
  CHECK_EQ(formatTime(t, "[HH] HH", en), "HH 13");
  CHECK_EQ(formatTime(t, "MMMMM", en), "March3");  // longest first, then M
  CHECK_EQ(formatTime(t, "Do", en), "7o");
  CHECK_EQ(formatTime(t, "[open", en), "[open");
  CHECK_EQ(formatTime(t, "YY y m s a", en), "YY y m s a");
  CHECK_EQ(formatTime(t, "", en), "");

  CivilTime midnight = civil(2026, 1, 1, 0, 0);
  CHECK_EQ(formatTime(midnight, "h A hh", en), "12 AM 12");
  CivilTime noon = civil(2026, 1, 1, 12, 0);
  CHECK_EQ(formatTime(noon, "h A", en), "12 PM");
}

TEST(time_locale_names) {
  JsonDoc doc;
  CHECK(doc.parse(R"({"days":["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"],
                      "monthsShort":["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"]})")
            .ok);
  Locale tr = Locale::fromJson(doc.root());
  CivilTime t = civil(2026, 10, 4, 9, 0);
  t.weekday = 0;
  CHECK_EQ(formatTime(t, "dddd D MMM", tr), "Pazar 4 Eki");
  CHECK_EQ(formatTime(t, "MMMM ddd", tr), "October Sun");  // missing lists fall back to English
}

TEST(time_z_token) {
  Locale en = Locale::fromJson(JsonView());
  TimeZone cet = zone("CET-1CEST,M3.5.0,M10.5.0/3");
  CHECK_EQ(formatTime(cet.toLocal(1782907200), "HH:mmZ", en), std::string("14:00+02:00"));
  CHECK_EQ(formatTime(cet.toLocal(1767225600), "Z", en), std::string("+01:00"));
  CHECK_EQ(formatTime(zone("IST-5:30").toLocal(0), "Z", en), std::string("+05:30"));
  CHECK_EQ(formatTime(zone("PST8PDT,M3.2.0,M11.1.0").toLocal(1782907200), "Z", en), std::string("-07:00"));
  CHECK_EQ(formatTime(zone("<-0330>3:30").toLocal(0), "Z", en), std::string("-03:30"));
  CHECK_EQ(formatTime(zone("UTC0").toLocal(0), "Z [Z]", en), std::string("+00:00 Z"));
  // A local value "as written" reports the offset in effect at that time.
  auto local = parseIsoTime("2026-01-15T10:00");
  CHECK_EQ(formatTime(toFields(*local, cet), "HH:mm Z", en), std::string("10:00 +01:00"));
}

namespace {

std::string wall(const char* text, int64_t now, const char* pattern) {
  static TimeZone cet = zone("CET-1CEST,M3.5.0,M10.5.0/3");
  static const Locale kEn = Locale::fromJson(JsonView());
  auto t = parseTimeValue(Value::string(text), now, cet);
  if (!t) return "<null>";
  double minutes = std::floor((toInstant(*t, cet) - static_cast<double>(now)) / 60.0);
  return formatTime(toFields(*t, cet), pattern, kEn) + " " + std::to_string(static_cast<long long>(minutes));
}

}  // namespace

TEST(wall_clock_times) {
  const int64_t lateEvening = 1782942600;  // 2026-07-01 23:50 CEST
  CHECK_EQ(wall("00:10", lateEvening, "D HH:mm"), std::string("2 00:10 20"));       // tomorrow
  CHECK_EQ(wall("23:40:30", lateEvening, "D HH:mm:ss"), std::string("1 23:40:30 -10"));
  const int64_t pastMidnight = lateEvening + 1200;  // 2026-07-02 00:10
  CHECK_EQ(wall("23:50", pastMidnight, "D HH:mm"), std::string("1 23:50 -20"));     // yesterday
  // Exactly 12 h either way: the window includes -12 h and excludes +12 h.
  CHECK_EQ(wall("12:10", pastMidnight, "D HH:mm"), std::string("1 12:10 -720"));
  CHECK_EQ(wall("12:09", pastMidnight, "D HH:mm"), std::string("2 12:09 719"));
  CHECK_EQ(wall("12:11", pastMidnight, "D HH:mm"), std::string("1 12:11 -719"));
  // Spring change: at 14:30 CET on the 28th, "02:20" tomorrow is in the gap
  // and reads as 00:20Z - 10 h 50 min ahead, nearer than today's 02:20.
  CHECK_EQ(wall("02:20", 1774704600, "D HH:mm"), std::string("29 02:20 650"));
  // Autumn change: "02:30" on the 25th is the second (standard time) one.
  CHECK_EQ(wall("02:30", 1792933200, "D HH:mm Z"), std::string("25 02:30 +01:00 -690"));
  // Not times.
  CHECK_EQ(wall("24:00", lateEvening, "HH"), std::string("<null>"));
  CHECK_EQ(wall("8:15", lateEvening, "HH"), std::string("<null>"));
  CHECK_EQ(wall("08:15:00Z", lateEvening, "HH"), std::string("<null>"));
  TimeZone cet = zone("CET-1CEST,M3.5.0,M10.5.0/3");
  CHECK(!parseTimeValue(Value::string("08:15"), std::nullopt, cet));  // clock unknown
  CHECK(!parseTimeValue(Value::number(1e12), 0, cet));
  CHECK(!parseTimeValue(Value::number(-1e11), 0, cet));
}
