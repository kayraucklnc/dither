#include "../src/runtime/cache_codec.h"
#include "../src/runtime/notice_screen.h"
#include "../src/runtime/program.h"
#include "../src/runtime/rotate.h"
#include "../src/runtime/wake.h"
#include "check.h"
#include "helpers.h"

using namespace dither;
using Rows = std::vector<std::string>;

namespace {

const char* kRuntime = R"({"v":1,"board":"xiao-epaper-75","width":6,"height":4,"rotation":0,
  "tz":"CET-1CEST,M3.5.0,M10.5.0/3","refresh":600,"quiet":{"from":1380,"to":420},
  "wifi":[{"ssid":"home","pass":"pw"}],
  "sources":[{"id":"w","url":"https://example.com","every":1800,"values":[{"key":"rain","path":"r"}]}],
  "screens":[
    {"name":"default","elements":[{"t":"bitmap","x":0,"y":0,"a":0}]},
    {"name":"rain","refresh":120,"elements":[
      {"t":"icon","x":0,"y":0,"w":6,"h":4,"v":"w.code","set":{"1":1,"2":0}}]}],
  "rules":[{"screen":1,"when":{"v":"w.rain","op":"true"}},{"screen":7,"when":{"v":"w.rain","op":"false"}},
           {"screen":0,"when":null}],
  "assets":@ASSETS@})";

std::vector<uint8_t> testBlob() {
  return testutil::makeBlob(kRuntime, {testutil::makeBitmap({"#..", ".#.", "..#"}, true),
                                       testutil::makeBitmap({"##", "##"}, false)});
}

}  // namespace

TEST(blob_header_and_crc) {
  auto blob = testBlob();
  BlobHeader h;
  CHECK(verifyBlob({blob.data(), blob.size()}, h) == BlobError::None);
  CHECK_EQ(h.totalLength, static_cast<uint32_t>(blob.size()));

  // Extra bytes after the blob (the rest of the partition) are fine.
  auto padded = blob;
  padded.resize(blob.size() + 100, 0xFF);
  CHECK(verifyBlob({padded.data(), padded.size()}, h) == BlobError::None);

  auto corrupt = blob;
  corrupt[60] ^= 1;
  CHECK(verifyBlob({corrupt.data(), corrupt.size()}, h) == BlobError::BadCrc);
  auto magic = blob;
  magic[0] = 'X';
  CHECK(verifyBlob({magic.data(), magic.size()}, h) == BlobError::BadMagic);
  auto version = blob;
  version[4] = 2;
  CHECK(verifyBlob({version.data(), version.size()}, h) == BlobError::BadVersion);
  CHECK(verifyBlob({blob.data(), blob.size() - 1}, h) == BlobError::BadLength);
  std::vector<uint8_t> erased(4096, 0xFF);
  CHECK(verifyBlob({erased.data(), erased.size()}, h) == BlobError::BadMagic);
  CHECK(verifyBlob({blob.data(), 10}, h) == BlobError::TooShort);
}

TEST(program_loads_settings) {
  auto blob = testBlob();
  std::string error;
  auto p = Program::load({blob.data(), blob.size()}, error);
  CHECK(p != nullptr);
  if (!p) return;
  CHECK_EQ(p->width(), 6);
  CHECK_EQ(p->defaultRefresh(), 600u);
  CHECK_EQ(p->refreshFor(1), 120u);
  CHECK_EQ(p->refreshFor(0), 600u);
  CHECK(p->quiet().enabled && p->quiet().from == 1380 && p->quiet().to == 420);
  CHECK_EQ(p->wifi().size(), size_t{1});
  CHECK_EQ(p->sources().size(), size_t{1});
  CHECK(p->timeZoneValid());
  CHECK_EQ(std::string(p->board()), std::string("xiao-epaper-75"));
}

TEST(program_rejects_bad_runtime) {
  std::string error;
  auto bad = testutil::makeBlob(R"({"v":2,"width":6,"height":4})");
  CHECK(Program::load({bad.data(), bad.size()}, error) == nullptr);
  auto noSize = testutil::makeBlob(R"({"v":1,"width":0,"height":4})");
  CHECK(Program::load({noSize.data(), noSize.size()}, error) == nullptr);
  auto rot = testutil::makeBlob(R"({"v":1,"width":6,"height":4,"rotation":45})");
  CHECK(Program::load({rot.data(), rot.size()}, error) == nullptr);
  auto asset = testutil::makeBlob(R"({"v":1,"width":6,"height":4,"assets":[[0,999999]]})");
  CHECK(Program::load({asset.data(), asset.size()}, error) == nullptr);
  auto json = testutil::makeBlob(R"({"v":1,)");
  CHECK(Program::load({json.data(), json.size()}, error) == nullptr);
  CHECK(error.find("runtime JSON") == 0);
}

TEST(program_rules_and_rendering) {
  auto blob = testBlob();
  std::string error;
  auto p = Program::load({blob.data(), blob.size()}, error);
  if (!p) return;
  ValueStore values;
  CHECK_EQ(p->chooseScreen(values, 0), 0);  // "w.rain" unknown: falls to the "always" rule
  values.set("w.rain", Value::boolean(false));
  CHECK_EQ(p->chooseScreen(values, 0), 0);  // rule names screen 7, which does not exist
  values.set("w.rain", Value::boolean(true));
  CHECK_EQ(p->chooseScreen(values, 0), 1);

  Framebuffer fb;
  p->render(0, values, 0, fb);
  CHECK_EQ(testutil::dump(fb, 0, 0, 6, 4), (Rows{"#.....", ".#....", "..#...", "......"}));

  // Icon: "1" picks the 2x2 mask, centred in 6x4 at (2, 1).
  values.set("w.code", Value::number(1));
  p->render(1, values, 0, fb);
  CHECK_EQ(testutil::dump(fb, 0, 0, 6, 4), (Rows{"......", "..##..", "..##..", "......"}));
  // "2" picks the opaque 3x3 at (1, 0), clipped to the box.
  values.set("w.code", Value::number(2));
  p->render(1, values, 0, fb);
  CHECK_EQ(testutil::dump(fb, 0, 0, 6, 4), (Rows{".#....", "..#...", "...#..", "......"}));
  values.set("w.code", Value::number(3));
  p->render(1, values, 0, fb);
  CHECK_EQ(testutil::countInk(fb), 0);
}

TEST(bitmap_opaque_overwrites_mask_does_not) {
  auto blob = testutil::makeBlob(
      R"({"v":1,"width":4,"height":2,"screens":[{"elements":[
          {"t":"rect","x":0,"y":0,"w":4,"h":2},
          {"t":"bitmap","x":0,"y":0,"a":0},
          {"t":"bitmap","x":2,"y":0,"a":1,"c":0}]}],"assets":@ASSETS@})",
      {testutil::makeBitmap({"#.", ".#"}, true), testutil::makeBitmap({"#.", "##"}, false)});
  std::string error;
  auto p = Program::load({blob.data(), blob.size()}, error);
  CHECK(p != nullptr);
  if (!p) return;
  Framebuffer fb;
  p->render(0, ValueStore(), 0, fb);
  CHECK_EQ(testutil::dump(fb, 0, 0, 4, 2), (Rows{"#..#", ".#.."}));
}

TEST(rotation_to_panel) {
  Framebuffer logical(3, 2);
  logical.set(0, 0, true);  // top-left
  logical.set(2, 1, true);  // bottom-right
  Framebuffer r90 = rotateToPanel(logical, 90);
  CHECK_EQ(testutil::dump(r90, 0, 0, 2, 3), (Rows{".#", "..", "#."}));
  Framebuffer r180 = rotateToPanel(logical, 180);
  CHECK_EQ(testutil::dump(r180, 0, 0, 3, 2), (Rows{"#..", "..#"}));
  Framebuffer r270 = rotateToPanel(logical, 270);
  CHECK_EQ(testutil::dump(r270, 0, 0, 2, 3), (Rows{".#", "..", "#."}));
  logical.set(1, 0, true);
  CHECK_EQ(testutil::dump(rotateToPanel(logical, 90), 0, 0, 2, 3), (Rows{".#", ".#", "#."}));
  CHECK_EQ(testutil::dump(rotateToPanel(logical, 270), 0, 0, 2, 3), (Rows{".#", "#.", "#."}));
}

TEST(builtin_values) {
  TimeZone tz;
  tz.parse("CET-1CEST,M3.5.0,M10.5.0/3");
  ValueStore v;
  setClockValues(v, 1782907200 + 125, tz);  // 2026-07-01 14:02:05 local, a Wednesday
  CHECK(v.get("clock.hour") == Value::number(14));
  CHECK(v.get("clock.minute") == Value::number(2));
  CHECK(v.get("clock.minutes") == Value::number(842));
  CHECK(v.get("clock.weekday") == Value::number(3));
  CHECK(v.get("clock.day") == Value::number(1));
  CHECK(v.get("clock.month") == Value::number(7));
  CHECK(v.get("clock.year") == Value::number(2026));
  CHECK(v.get("clock.epoch") == Value::number(1782907325));
  setClockValues(v, std::nullopt, tz);
  CHECK(v.get("clock.hour").isNull());

  DeviceStatus d;
  d.usb = true;
  setDeviceValues(v, d);
  CHECK(v.get("device.battery").isNull());
  CHECK(v.get("device.usb") == Value::boolean(true));
  CHECK(v.get("device.online") == Value::boolean(false));

  SourceState s;
  setSourceStatus(v, "w", s, 1000);
  CHECK(v.get("w._ok") == Value::boolean(false));
  CHECK(v.get("w._age").isNull());
  s.attempted = s.ok = s.everSucceeded = true;
  s.lastAttempt = s.lastSuccess = 1000 - 179;
  setSourceStatus(v, "w", s, 1000);
  CHECK(v.get("w._ok") == Value::boolean(true));
  CHECK(v.get("w._age") == Value::number(2));
  s.lastSuccess.reset();  // it succeeded while the clock was unknown
  setSourceStatus(v, "w", s, 1000);
  CHECK(v.get("w._ok") == Value::boolean(true));
  CHECK(v.get("w._age").isNull());
}

TEST(wake_scheduling) {
  QuietHours q{true, 1380, 420};
  CHECK(inQuietHours(q, 1380));
  CHECK(inQuietHours(q, 0));
  CHECK(!inQuietHours(q, 420));
  CHECK(!inQuietHours(q, 720));
  QuietHours day{true, 600, 720};
  CHECK(inQuietHours(day, 600) && !inQuietHours(day, 720) && !inQuietHours(day, 599));
  CHECK(!inQuietHours(QuietHours{true, 5, 5}, 5));
  CHECK(!inQuietHours(QuietHours{}, 5));

  CivilTime t;
  t.hour = 23, t.minute = 30, t.second = 10;
  CHECK_EQ(secondsUntilMinute(t, 420), static_cast<uint32_t>(7 * 3600 + 30 * 60 - 10));
  t.hour = 7, t.minute = 0, t.second = 0;
  CHECK_EQ(secondsUntilMinute(t, 420), 86400u);

  std::vector<SourceSpec> sources(2);
  sources[0].every = 1800;
  sources[1].every = 300;
  std::vector<SourceState> states(2);
  CHECK(sourceDue(states[0], 1800, 5000));
  states[0].attempted = true;
  states[0].lastAttempt = 5000 - 1000;
  CHECK(!sourceDue(states[0], 1800, 5000));
  CHECK(sourceDue(states[0], 1000, 5000));
  CHECK(sourceDue(states[0], 1800, std::nullopt));
  CHECK_EQ(sleepSeconds(900, sources, states, 5000), 800u);  // source 0 due in 800 s
  states[1].attempted = true;
  states[1].lastAttempt = 5000 - 280;
  CHECK_EQ(sleepSeconds(900, sources, states, 5000), 60u);  // due in 20 s: floor of 60
  CHECK_EQ(sleepSeconds(900, sources, states, std::nullopt), 900u);
  CHECK_EQ(sleepSeconds(30, {}, {}, 5000), 60u);
}

TEST(network_only_when_needed) {
  std::vector<SourceSpec> sources(2);
  sources[0].every = 1800;
  sources[1].every = 300;
  std::vector<SourceState> states(2);
  CHECK(needsNetwork({}, {}, std::nullopt));          // clock never set
  CHECK(!needsNetwork({}, {}, 5000));                 // nothing to fetch, clock known
  CHECK(needsNetwork(sources, states, 5000));         // never fetched
  for (auto& s : states) {
    s.attempted = true;
    s.lastAttempt = 5000 - 100;
  }
  CHECK(!needsNetwork(sources, states, 5000));        // both fetched recently
  CHECK(needsNetwork(sources, states, 5000 + 200));   // source 1 due again
  CHECK(needsNetwork(sources, states, std::nullopt));
  CHECK(needsNetwork(sources, {}, 5000));             // no state recorded yet

  // A due source with placeholders cannot be fetched without a clock - but an
  // unknown clock needs the network anyway, for NTP.
  sources[0].usesPlaceholders = true;
  CHECK(!sourceFetchable(sources[0], std::nullopt));
  CHECK(sourceFetchable(sources[0], 5000));
  CHECK(sourceFetchable(sources[1], std::nullopt));
  // An attempt made while the clock was unknown leaves the source due.
  SourceState unknown;
  unknown.attempted = true;
  CHECK(sourceDue(unknown, 1800, 5000));
}

TEST(quiet_and_crash_backoff) {
  CivilTime t;
  t.hour = 6, t.minute = 59, t.second = 50;
  CHECK_EQ(quietSleepSeconds(t, 420), 30u);  // 10 s to go, but at least 30
  t.second = 0;
  CHECK_EQ(quietSleepSeconds(t, 420), 60u);
  CHECK_EQ(crashBackoffSeconds(0), 0u);
  CHECK_EQ(crashBackoffSeconds(2), 0u);
  CHECK_EQ(crashBackoffSeconds(3), 900u);
  CHECK_EQ(crashBackoffSeconds(7), 900u);
}

TEST(value_cache_round_trip) {
  ValueCache c;
  c.blobCrc = 0xDEADBEEF;
  SourceState s;
  s.attempted = true;
  s.everSucceeded = true;
  s.lastAttempt = -5;
  s.lastSuccess = 1782907200;
  c.setState("w", s);
  c.values.set("w.n", Value::number(-0.1));
  c.values.set("w.s", Value::string("Zürich"));
  c.values.set("w.b", Value::boolean(true));
  c.values.set("w.z", Value());
  c.values.set("w.h", Value::series({1.5, 2, -3}));
  c.lastOnline = true;
  c.lastRssi = -67;
  auto bytes = encodeCache(c);
  ValueCache d;
  CHECK(decodeCache({bytes.data(), bytes.size()}, d));
  CHECK_EQ(d.blobCrc, 0xDEADBEEFu);
  CHECK(d.stateOf("w").lastAttempt == -5 && d.stateOf("w").everSucceeded && !d.stateOf("w").ok);
  CHECK(!d.stateOf("x").attempted);
  for (const auto& [ref, v] : c.values.all()) CHECK(d.values.get(ref) == v);
  CHECK_EQ(d.values.all().size(), size_t{5});
  CHECK(d.lastOnline && d.lastRssi && *d.lastRssi == -67);
  ValueCache unknownTimes;
  SourceState u;
  u.attempted = u.ok = u.everSucceeded = true;  // fetched with no clock
  unknownTimes.setState("w", u);
  auto unknownBytes = encodeCache(unknownTimes);
  CHECK(decodeCache({unknownBytes.data(), unknownBytes.size()}, d));
  CHECK(!d.stateOf("w").lastAttempt && !d.stateOf("w").lastSuccess && d.stateOf("w").everSucceeded);
  ValueCache offline;
  auto offlineBytes = encodeCache(offline);
  CHECK(decodeCache({offlineBytes.data(), offlineBytes.size()}, d));
  CHECK(!d.lastOnline && !d.lastRssi);

  for (size_t cut = 0; cut < bytes.size(); ++cut) CHECK(!decodeCache({bytes.data(), cut}, d));
  bytes.push_back(0);
  CHECK(!decodeCache({bytes.data(), bytes.size()}, d));
}

TEST(cache_tokens) {
  ValueCache c;
  CHECK(!c.tokenFor("g", 1000));
  c.setToken("g", "ya29.abc", 1000 + 3600);
  CHECK(c.tokenFor("g", 1000) == std::optional<std::string>("ya29.abc"));
  CHECK(c.tokenFor("g", 1000 + 3539));
  CHECK(!c.tokenFor("g", 1000 + 3540));  // within a minute of expiry
  CHECK(!c.tokenFor("g", std::nullopt));
  c.setToken("g", "second", 9000);
  CHECK_EQ(c.tokens.size(), size_t{1});
  auto bytes = encodeCache(c);
  ValueCache d;
  CHECK(decodeCache({bytes.data(), bytes.size()}, d));
  CHECK(d.tokenFor("g", 1000) == std::optional<std::string>("second"));
  d.dropToken("g");
  CHECK(d.tokens.empty());
}

TEST(cache_fits_its_budget) {
  ValueCache c;
  c.setToken("g", std::string(500, 't'), 99999);
  c.values.set("a.small", Value::number(1));
  c.values.set("a.big", Value::string(std::string(3000, 'x')));
  c.values.set("a.bigger", Value::string(std::string(4000, 'y')));
  c.values.set("a.series", Value::series(std::vector<double>(64, 1.5)));
  auto dropped = fitCache(c, 6 * 1024);
  CHECK(encodeCache(c).size() <= 6 * 1024);
  CHECK_EQ(dropped.size(), size_t{1});
  CHECK_EQ(dropped[0], std::string("a.bigger"));
  CHECK(c.values.get("a.small") == Value::number(1));
  CHECK(c.tokenFor("g", 0));  // tokens and fetch state are never dropped
  CHECK(fitCache(c, 6 * 1024).empty());
}

TEST(not_set_up_shows_the_mark) {
  Framebuffer fb(800, 480);
  drawNotSetUp(fb, "Dither 0.2.0 - nothing flashed yet");
  // The 16x16 mark at scale 8, centred: x 336..463, top 100.
  CHECK(fb.get(336, 100) && fb.get(343, 107));   // row 0, column 0: ink
  CHECK(!fb.get(368, 100));                      // row 0, column 4: paper
  CHECK(fb.get(368, 108));                       // row 1, column 4: ink
  CHECK(!fb.get(335, 100) && !fb.get(336, 99));
  CHECK(!fb.get(456, 220));                      // row 15, column 15: paper
  CHECK(testutil::countInk(fb) > 8000);
}
