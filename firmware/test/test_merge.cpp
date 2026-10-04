#include "../src/runtime/merge.h"
#include "check.h"

using namespace dither;

namespace {

constexpr int64_t kNow = 1782907200;  // 2026-07-01 14:00 CEST

const TimeZone& cet() {
  static TimeZone tz;
  static bool parsed = tz.parse("CET-1CEST,M3.5.0,M10.5.0/3");
  (void)parsed;
  return tz;
}

MergeSpec spec(const char* json) {
  JsonDoc doc;
  doc.parse(std::string("[") + json + "]");
  auto merges = parseMerges(doc.root());
  return merges.empty() ? MergeSpec() : merges[0];
}

void event(ValueStore& v, const std::string& src, int n, const char* title, const char* start) {
  v.set(src + ".t" + std::to_string(n), Value::string(title));
  v.set(src + ".s" + std::to_string(n), start ? Value::string(start) : Value());
}

std::string titles(const ValueStore& v, int count) {
  std::string out;
  for (int n = 0; n < count; ++n) {
    const Value& t = v.get("m0.t" + std::to_string(n));
    const Value& from = v.get("m0.from" + std::to_string(n));
    out += t.isString() ? t.asString() + "/" + std::to_string(static_cast<int>(from.asNumber())) : "-";
    if (n + 1 < count) out += " ";
  }
  return out;
}

const char* kCalendar = R"({"id":"m0","from":["a","b"],"fields":["t","s"],"count":4,"sort":["s"],"unique":["t","s"]})";

}  // namespace

TEST(merge_interleaves_sources) {
  ValueStore v;
  event(v, "a", 0, "A9", "2026-07-01T09:00");
  event(v, "a", 1, "A11", "2026-07-01T11:00");
  event(v, "b", 0, "B10", "2026-07-01T10:00");
  event(v, "b", 1, "B12", "2026-07-01T12:00:00+02:00");
  applyMerges({spec(kCalendar)}, v, kNow, cet());
  CHECK_EQ(titles(v, 4), std::string("A9/0 B10/1 A11/0 B12/1"));
  CHECK(v.get("m0.s1") == Value::string("2026-07-01T10:00"));  // values copied as they were
}

TEST(merge_dedupes_across_sources) {
  ValueStore v;
  event(v, "a", 0, "Standup", "2026-07-01T09:00");
  event(v, "b", 0, "Standup", "2026-07-01T09:00");      // same title and start: dropped
  event(v, "b", 1, "Standup", "2026-07-01T09:30");      // another start: kept
  event(v, "b", 2, "Lunch", "2026-07-01T07:00:00Z");    // 09:00 local but not the same value
  applyMerges({spec(kCalendar)}, v, kNow, cet());
  CHECK_EQ(titles(v, 4), std::string("Standup/0 Lunch/1 Standup/1 -"));
  CHECK(v.get("m0.from3").isNull() && v.get("m0.t3").isNull() && v.get("m0.s3").isNull());
}

TEST(merge_unique_compares_type_and_null) {
  ValueStore v;
  v.set("a.t0", Value::string("x"));
  v.set("a.n0", Value::number(1));
  v.set("b.t0", Value::string("x"));
  v.set("b.n0", Value::string("1"));  // another type: not a duplicate
  v.set("b.t1", Value::string("x"));  // n null
  v.set("b.t2", Value::string("x"));  // n null again: equal to the previous
  applyMerges({spec(R"({"id":"m0","from":["a","b"],"fields":["t","n"],"count":5,"unique":["t","n"]})")}, v, kNow,
              cet());
  CHECK_EQ(titles(v, 4), std::string("x/0 x/1 x/1 -"));
  CHECK(v.get("m0.n1") == Value::string("1"));
  CHECK(v.get("m0.n2").isNull());
}

TEST(merge_skip_and_untimed_last) {
  ValueStore v;
  event(v, "a", 0, "NoStart", nullptr);
  event(v, "a", 1, "Later", "2026-07-01T18:00");
  v.set("b.t0", Value::string("Untimed"));
  v.set("b.s0", Value::string("whenever"));  // not a time: sorts last
  event(v, "b", 1, "Early", "2026-07-01T08:00");
  applyMerges({spec(R"({"id":"m0","from":["a","b"],"fields":["t","s"],"count":4,"skip":["s"],"sort":["s"]})")}, v,
              kNow, cet());
  CHECK_EQ(titles(v, 4), std::string("Early/1 Later/0 Untimed/1 -"));
}

TEST(merge_date_only_and_ties) {
  ValueStore v;
  event(v, "a", 0, "Timed", "2026-07-02T00:00");
  event(v, "a", 1, "Morning", "2026-07-02T08:00");
  event(v, "b", 0, "AllDay", "2026-07-02");                  // local midnight: ties with "Timed"
  event(v, "b", 1, "Yesterday", "2026-07-01");
  applyMerges({spec(kCalendar)}, v, kNow, cet());
  CHECK_EQ(titles(v, 4), std::string("Yesterday/1 Timed/0 AllDay/1 Morning/0"));  // a tie keeps source order

  // The second sort field is used when the first is not a time.
  ValueStore w;
  w.set("a.t0", Value::string("ByAllDay"));
  w.set("a.d0", Value::string("2026-07-03"));
  w.set("b.t0", Value::string("ByStart"));
  w.set("b.s0", Value::number(1782907200));  // epoch: today 14:00
  applyMerges({spec(R"({"id":"m0","from":["a","b"],"fields":["t","s","d"],"count":2,"sort":["s","d"]})")}, w, kNow,
              cet());
  CHECK_EQ(titles(w, 2), std::string("ByStart/1 ByAllDay/0"));

  // Wall-clock strings take the nearest day.
  ValueStore x;
  event(x, "a", 0, "Tomorrow", "00:10");
  event(x, "b", 0, "Tonight", "23:50");
  applyMerges({spec(kCalendar)}, x, 1782942600, cet());  // now 23:50
  CHECK_EQ(titles(x, 2), std::string("Tonight/1 Tomorrow/0"));
}

TEST(merge_count_truncates) {
  ValueStore v;
  for (int n = 0; n < 4; ++n) {
    event(v, "a", n, ("A" + std::to_string(n)).c_str(), ("2026-07-0" + std::to_string(n + 1)).c_str());
    event(v, "b", n, ("B" + std::to_string(n)).c_str(), ("2026-07-0" + std::to_string(n + 5)).c_str());
  }
  event(v, "a", 4, "A4", "2026-06-01");  // record 4 is beyond count: never read
  applyMerges({spec(R"({"id":"m0","from":["a","b"],"fields":["t","s"],"count":3,"sort":["s"]})")}, v, kNow, cet());
  CHECK_EQ(titles(v, 3), std::string("A0/0 A1/0 A2/0"));
  CHECK(v.get("m0.t3").isNull());  // only count positions are written
}

TEST(merge_missing_sources) {
  ValueStore v;
  event(v, "b", 0, "OnlyB", "2026-07-01T10:00");
  // "a" never fetched, "ghost" not a source at all: both contribute nothing.
  applyMerges({spec(R"({"id":"m0","from":["a","ghost","b"],"fields":["t","s"],"count":2,"sort":["s"]})")}, v, kNow,
              cet());
  CHECK_EQ(titles(v, 2), std::string("OnlyB/2 -"));
  ValueStore empty;
  applyMerges({spec(kCalendar)}, empty, kNow, cet());
  CHECK(empty.get("m0.t0").isNull() && empty.get("m0.from0").isNull() && empty.get("m0.s3").isNull());
}

TEST(merges_run_in_order_and_parse_defensively) {
  ValueStore v;
  event(v, "a", 0, "X", "2026-07-01T10:00");
  auto first = spec(kCalendar);
  auto second = spec(R"({"id":"m1","from":["m0"],"fields":["t"],"count":1})");
  applyMerges({first, second}, v, kNow, cet());
  CHECK(v.get("m1.t0") == Value::string("X"));
  CHECK(v.get("m1.from0") == Value::number(0));
  JsonDoc doc;
  doc.parse(R"([{"from":["a"]},{"id":"z","count":1000,"fields":[1,"t"]},5])");
  auto merges = parseMerges(doc.root());
  CHECK_EQ(merges.size(), size_t{1});
  CHECK_EQ(merges[0].count, kMaxMergeCount);
  CHECK_EQ(merges[0].fields.size(), size_t{1});
}
