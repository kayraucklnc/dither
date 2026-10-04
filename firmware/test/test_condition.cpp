#include "../src/runtime/condition.h"
#include "check.h"

using namespace dither;

namespace {

ValueStore store() {
  ValueStore s;
  s.set("w.temp", Value::number(25));
  s.set("w.name", Value::string("Milano Centrale"));
  s.set("w.rain", Value::boolean(true));
  s.set("w.none", Value());
  s.set("w.series", Value::series({1, 2}));
  s.set("clock.minutes", Value::number(30));
  return s;
}

FormatContext context() {
  static TimeZone tz;
  static Locale locale = Locale::fromJson(JsonView());
  FormatContext ctx;
  ctx.now = 1782907200;  // 2026-07-01 12:00 UTC
  ctx.tz = &tz;
  ctx.locale = &locale;
  return ctx;
}

bool holds(const char* json) {
  static const ValueStore s = store();
  JsonDoc doc;
  if (!doc.parse(json).ok) return false;
  return evalCondition(doc.root(), s, context());
}

}  // namespace

TEST(condition_eq_ne) {
  CHECK(holds(R"({"v":"w.temp","op":"eq","x":25})"));
  CHECK(!holds(R"({"v":"w.temp","op":"eq","x":25.5})"));
  CHECK(holds(R"({"v":"w.name","op":"eq","x":"Milano Centrale"})"));
  CHECK(holds(R"({"v":"w.rain","op":"eq","x":true})"));
  CHECK(!holds(R"({"v":"w.temp","op":"eq","x":"25"})"));  // mismatched types
  CHECK(holds(R"({"v":"w.temp","op":"ne","x":"25"})"));
  CHECK(!holds(R"({"v":"w.none","op":"eq","x":null})"));  // null is never "equal"
  CHECK(holds(R"({"v":"w.none","op":"ne","x":null})"));
  CHECK(!holds(R"({"v":"w.missing","op":"eq","x":0})"));
  CHECK(!holds(R"({"v":"w.series","op":"eq","x":[1,2]})"));
}

TEST(condition_ordering) {
  CHECK(holds(R"({"v":"w.temp","op":"gt","x":24})"));
  CHECK(!holds(R"({"v":"w.temp","op":"gt","x":25})"));
  CHECK(holds(R"({"v":"w.temp","op":"ge","x":25})"));
  CHECK(holds(R"({"v":"w.temp","op":"le","x":25})"));
  CHECK(!holds(R"({"v":"w.temp","op":"lt","x":25})"));
  CHECK(!holds(R"({"v":"w.name","op":"lt","x":"Z"})"));  // numbers only
  CHECK(!holds(R"({"v":"w.none","op":"lt","x":1})"));
}

TEST(condition_between_wraps) {
  CHECK(holds(R"({"v":"w.temp","op":"between","x":[20,30]})"));
  CHECK(holds(R"({"v":"w.temp","op":"between","x":[25,30]})"));   // a <= v
  CHECK(!holds(R"({"v":"w.temp","op":"between","x":[20,25]})"));  // v < b
  CHECK(!holds(R"({"v":"w.temp","op":"between","x":[25,25]})"));
  // a > b wraps: 23:00 to 07:00 contains 00:30
  CHECK(holds(R"({"v":"clock.minutes","op":"between","x":[1380,420]})"));
  CHECK(!holds(R"({"v":"clock.minutes","op":"between","x":[420,1380]})"));
  CHECK(!holds(R"({"v":"w.temp","op":"between","x":[20]})"));
  CHECK(!holds(R"({"v":"w.name","op":"between","x":[0,100]})"));
}

TEST(condition_in_contains_presence) {
  CHECK(holds(R"({"v":"w.temp","op":"in","x":[1,25,"a"]})"));
  CHECK(!holds(R"({"v":"w.temp","op":"in","x":["25"]})"));
  CHECK(!holds(R"({"v":"w.temp","op":"in","x":25})"));
  CHECK(holds(R"({"v":"w.name","op":"contains","x":"Centrale"})"));
  CHECK(holds(R"({"v":"w.name","op":"contains","x":""})"));
  CHECK(!holds(R"({"v":"w.name","op":"contains","x":"centrale"})"));
  CHECK(!holds(R"({"v":"w.temp","op":"contains","x":"2"})"));
  CHECK(holds(R"({"v":"w.temp","op":"present"})"));
  CHECK(holds(R"({"v":"w.none","op":"absent"})"));
  CHECK(holds(R"({"v":"w.missing","op":"absent"})"));
  CHECK(!holds(R"({"v":"w.series","op":"absent"})"));
  CHECK(holds(R"({"v":"w.rain","op":"true"})"));
  CHECK(!holds(R"({"v":"w.rain","op":"false"})"));
  CHECK(!holds(R"({"v":"w.temp","op":"true"})"));
  CHECK(!holds(R"({"v":"w.none","op":"false"})"));
}

TEST(condition_groups) {
  CHECK(holds(R"({"all":[]})"));
  CHECK(!holds(R"({"any":[]})"));
  CHECK(holds(R"({"all":[{"v":"w.rain","op":"true"},{"v":"w.temp","op":"gt","x":20}]})"));
  CHECK(!holds(R"({"all":[{"v":"w.rain","op":"true"},{"v":"w.temp","op":"gt","x":30}]})"));
  CHECK(holds(R"({"any":[{"v":"w.rain","op":"false"},{"v":"w.temp","op":"gt","x":20}]})"));
  CHECK(holds(R"({"not":{"v":"w.rain","op":"false"}})"));
  CHECK(!holds(R"({"not":{"all":[]}})"));
  CHECK(holds("null"));
  CHECK(!holds(R"({"v":"w.temp","op":"bogus","x":1})"));
  CHECK(!holds(R"({})"));
  CHECK(!holds("[]"));
  ValueStore empty;
  CHECK(evalCondition(JsonView(), empty, context()));  // missing "when"
}

TEST(condition_leaf_format) {
  ValueStore s;
  s.set("c1.start", Value::number(1782907200 + 600));  // ten minutes after "now"
  s.set("c1.past", Value::number(1782907200 - 60));
  s.set("w.code", Value::number(61));
  s.set("w.c", Value::number(10));
  auto check = [&](const char* json) {
    JsonDoc doc;
    return doc.parse(json).ok && evalCondition(doc.root(), s, context());
  };
  CHECK(check(R"({"v":"c1.start","f":{"until":true},"op":"lt","x":15})"));
  CHECK(!check(R"({"v":"c1.start","f":{"until":true},"op":"lt","x":10})"));
  CHECK(check(R"({"v":"c1.start","f":{"until":true},"op":"eq","x":10})"));
  // A step that gives null makes the value null.
  CHECK(!check(R"({"v":"c1.past","f":{"until":true},"op":"lt","x":15})"));
  CHECK(check(R"({"v":"c1.past","f":{"until":true},"op":"absent"})"));
  CHECK(check(R"({"v":"w.code","f":{"steps":{"t":[50,70],"o":["dry","rain","snow"]}},"op":"eq","x":"rain"})"));
  CHECK(check(R"({"v":"w.code","f":{"map":{"k":[61],"o":["rain"]}},"op":"eq","x":"rain"})"));
  CHECK(check(R"({"v":"w.code","f":{"map":{"k":[1],"o":["x"]}},"op":"absent"})"));
  CHECK(check(R"({"v":"w.c","f":{"scale":1.8,"add":32},"op":"eq","x":50})"));
  // num, time, upper and fallback are ignored.
  CHECK(check(R"({"v":"w.c","f":{"num":{"d":2},"upper":true,"fallback":"x"},"op":"eq","x":10})"));
  CHECK(check(R"({"v":"w.c","f":{"time":"HH"},"op":"eq","x":10})"));
  CHECK(check(R"({"v":"w.missing","f":{"map":{"k":[],"o":[],"d":"none"}},"op":"absent"})"));
  // shift reads the store the condition is evaluated against.
  s.set("t.dep", Value::string("12:05"));  // UTC zone here: 5 min after now
  s.set("t.delay", Value::number(12));
  CHECK(check(R"({"v":"t.dep","f":{"shift":{"v":"t.delay","scale":60},"until":true},"op":"eq","x":17})"));
  CHECK(check(R"({"v":"t.dep","f":{"until":true},"op":"eq","x":5})"));
}

TEST(condition_leaf_days) {
  ValueStore s;
  s.set("c.date", Value::string("2026-07-02"));  // context: 2026-07-01 12:00 UTC
  s.set("c.start", Value::number(1782907200 + 30 * 60));
  auto check = [&](const char* json) {
    JsonDoc doc;
    return doc.parse(json).ok && evalCondition(doc.root(), s, context());
  };
  CHECK(check(R"({"v":"c.date","f":{"days":true},"op":"eq","x":1})"));
  CHECK(check(R"({"v":"c.start","f":{"days":true,"until":true},"op":"eq","x":0})"));
  CHECK(check(R"({"v":"c.start","f":{"until":true},"op":"eq","x":30})"));
}

TEST(condition_vs_another_value) {
  ValueStore s;
  s.set("a.today", Value::number(120));
  s.set("a.yesterday", Value::number(100));
  s.set("a.name", Value::string("x"));
  s.set("a.other", Value::string("x"));
  s.set("a.start", Value::number(1782907200 + 600));  // in 10 minutes
  s.set("a.end", Value::number(1782907200 + 3000));   // in 50 minutes
  auto check = [&](const char* json) {
    JsonDoc doc;
    return doc.parse(json).ok && evalCondition(doc.root(), s, context());
  };
  CHECK(check(R"({"v":"a.today","op":"gt","vs":"a.yesterday"})"));
  CHECK(!check(R"({"v":"a.today","op":"lt","vs":"a.yesterday"})"));
  CHECK(check(R"({"v":"a.today","op":"ge","vs":"a.today"})"));
  CHECK(check(R"({"v":"a.name","op":"eq","vs":"a.other"})"));
  CHECK(check(R"({"v":"a.name","op":"ne","vs":"a.today"})"));
  CHECK(!check(R"({"v":"a.missing","op":"eq","vs":"a.gone"})"));  // null never equals null
  CHECK(check(R"({"v":"a.missing","op":"ne","vs":"a.gone"})"));
  CHECK(!check(R"({"v":"a.today","op":"gt","vs":"a.missing"})"));
  // vs takes the place of x, and goes through f as well.
  CHECK(check(R"({"v":"a.today","op":"gt","vs":"a.yesterday","x":1000})"));
  CHECK(check(R"({"v":"a.start","f":{"until":true},"op":"lt","vs":"a.end"})"));
  CHECK(check(R"({"v":"a.end","f":{"until":true,"scale":2},"op":"eq","vs":"a.end"})"));      // 100 == 100
  CHECK(check(R"({"v":"a.start","f":{"until":true,"scale":5},"op":"lt","vs":"a.end"})"));    // 50 < 250
  CHECK(!check(R"({"v":"a.start","f":{"until":true,"scale":5},"op":"eq","vs":"a.end"})"));
  // Only the comparison ops take vs.
  CHECK(!check(R"({"v":"a.name","op":"contains","vs":"a.other"})"));
  CHECK(!check(R"({"v":"a.today","op":"present","vs":"a.other"})"));
}

TEST(condition_leaf_pick) {
  ValueStore s;
  s.set("r.week", Value::series({10, 40, 25}));
  s.set("r.target", Value::number(30));
  auto check = [&](const char* json) {
    JsonDoc doc;
    return doc.parse(json).ok && evalCondition(doc.root(), s, context());
  };
  CHECK(check(R"({"v":"r.week","f":{"pick":"max"},"op":"gt","x":30})"));
  CHECK(check(R"({"v":"r.week","f":{"pick":"argmax"},"op":"eq","x":1})"));
  CHECK(!check(R"({"v":"r.week","f":{"pick":"sum"},"op":"lt","x":75})"));
  CHECK(check(R"({"v":"r.target","f":{"pick":"max"},"op":"absent"})"));  // not a series
}
