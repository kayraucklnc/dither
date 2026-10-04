#include "../src/runtime/format.h"
#include "check.h"

using namespace dither;

namespace {

struct Env {
  TimeZone tz;
  Locale locale = Locale::fromJson(JsonView());
  ValueStore values;
  FormatContext ctx;
  Env() {
    values.set("t.delay", Value::number(7));
    values.set("t.none", Value());
    values.set("t.text", Value::string("late"));
    ctx.values = &values;
    tz.parse("CET-1CEST,M3.5.0,M10.5.0/3");
    ctx.now = 1782907200;  // 2026-07-01 14:00 local
    ctx.tz = &tz;
    ctx.locale = &locale;
  }
};

std::string run(const Value& v, const char* formatJson) {
  static Env env;
  JsonDoc doc;
  if (!doc.parse(formatJson).ok) return "<bad format json>";
  return formatValue(v, doc.root(), env.ctx);
}

Value num(double d) { return Value::number(d); }
Value str(const char* s) { return Value::string(s); }

const std::string kDash = "\xE2\x80\x93";

}  // namespace

TEST(format_defaults) {
  CHECK_EQ(defaultText(Value()), kDash);
  CHECK_EQ(defaultText(num(20.5)), "20.5");
  CHECK_EQ(defaultText(num(3)), "3");
  CHECK_EQ(defaultText(str("hi")), "hi");
  CHECK_EQ(defaultText(Value::boolean(true)), "true");
  CHECK_EQ(defaultText(Value::boolean(false)), "false");
  CHECK_EQ(defaultText(Value::series({1, 2})), "");
  CHECK_EQ(run(Value(), "{}"), kDash);
  CHECK_EQ(run(num(1.239), "{}"), "1.24");
}

TEST(format_fallback) {
  CHECK_EQ(run(Value(), R"({"fallback":"n/a"})"), "n/a");
  CHECK_EQ(run(str("x"), R"({"num":{"d":1},"fallback":"?"})"), "?");
  CHECK_EQ(run(str("x"), R"({"num":{"d":1}})"), kDash);
}

TEST(format_scale_add_num) {
  CHECK_EQ(run(num(20.46), R"({"num":{"d":1}})"), "20.5");
  CHECK_EQ(run(num(0.5), R"({"scale":100,"num":{"d":0}})"), "50");
  CHECK_EQ(run(num(10), R"({"scale":1.8,"add":32,"num":{"d":0}})"), "50");
  CHECK_EQ(run(num(10), R"({"add":-0.5})"), "9.5");
  CHECK_EQ(run(num(1234567), R"({"num":{"d":0,"sep":","}})"), "1,234,567");
  CHECK_EQ(run(num(12.5), R"({"num":{}})"), "12.5");
  CHECK_EQ(run(str("5"), R"({"scale":2})"), kDash);
}

TEST(format_steps) {
  const char* f = R"({"steps":{"t":[0,10,20],"o":["cold","cool","warm","hot"]}})";
  CHECK_EQ(run(num(-5), f), "cold");
  CHECK_EQ(run(num(0), f), "cool");  // threshold <= value counts
  CHECK_EQ(run(num(9.99), f), "cool");
  CHECK_EQ(run(num(19.99), f), "warm");
  CHECK_EQ(run(num(20), f), "hot");
  CHECK_EQ(run(str("x"), f), kDash);
  CHECK_EQ(run(num(5), R"({"steps":{"t":[0],"o":[1,2]},"num":{"d":1}})"), "2.0");
  CHECK_EQ(run(num(5), R"({"steps":{"t":[0],"o":["a"]}})"), kDash);  // o too short
}

TEST(format_map) {
  const char* f = R"({"map":{"k":[0,1,2,"x"],"o":["clear","sun","cloud","ex"],"d":"other"}})";
  CHECK_EQ(run(num(1), f), "sun");
  CHECK_EQ(run(num(3), f), "other");
  CHECK_EQ(run(str("x"), f), "ex");
  CHECK_EQ(run(str("1"), f), "other");  // string never matches a number
  CHECK_EQ(run(num(9), R"({"map":{"k":[1],"o":["a"]}})"), kDash);
  CHECK_EQ(run(num(9), R"({"map":{"k":[1],"o":["a"]},"fallback":"none"})"), "none");
  CHECK_EQ(run(Value::boolean(true), R"({"map":{"k":[true],"o":["yes"],"d":"no"}})"), "no");
  // steps feed map
  CHECK_EQ(run(num(15), R"({"steps":{"t":[10],"o":[0,1]},"map":{"k":[1],"o":["high"]}})"), "high");
}

TEST(format_time_and_until) {
  CHECK_EQ(run(num(1782907200), R"({"time":"HH:mm dddd"})"), "14:00 Wednesday");
  CHECK_EQ(run(str("2026-07-01T09:30"), R"({"time":"HH:mm"})"), "09:30");  // local, as written
  CHECK_EQ(run(str("2026-07-01T09:30Z"), R"({"time":"HH:mm"})"), "11:30");
  CHECK_EQ(run(str("2026-12-25"), R"({"time":"ddd D MMM"})"), "Fri 25 Dec");
  CHECK_EQ(run(str("tomorrow"), R"({"time":"HH:mm"})"), kDash);
  CHECK_EQ(run(Value::boolean(true), R"({"time":"HH:mm"})"), kDash);

  CHECK_EQ(run(num(1782907200 + 90), R"({"until":true})"), "1");
  CHECK_EQ(run(num(1782907200 + 59), R"({"until":true})"), "0");
  CHECK_EQ(run(num(1782907200), R"({"until":true})"), "0");
  CHECK_EQ(run(num(1782907200 - 1), R"({"until":true})"), kDash);
  CHECK_EQ(run(str("2026-07-01T15:30"), R"({"until":true})"), "90");
  CHECK_EQ(run(str("2026-07-01T14:00:59"), R"({"until":true})"), "0");
  // The countdown example from the spec: days until a date.
  CHECK_EQ(run(str("2026-12-25"),
               R"({"until":true,"scale":0.000694444,"add":-0.5,"num":{"d":0}})"),
           "176");  // node: 254100 minutes -> 175.958... -> 176
}

TEST(format_upper) {
  CHECK_EQ(run(str("straße àéîõü ÿ ÷"), R"({"upper":true})"), "STRAßE ÀÉÎÕÜ ÿ ÷");
  CHECK_EQ(run(str("ığş i"), R"({"upper":true})"), "IĞŞ I");
  CHECK_EQ(run(str("ığş i"), R"({"upper":true,"tr":true})"), "IĞŞ İ");
  CHECK_EQ(run(num(1782907200), R"({"time":"ddd","upper":true})"), "WED");
  CHECK_EQ(run(Value::boolean(false), R"({"upper":true})"), "FALSE");
  CHECK_EQ(run(num(2.5), R"({"upper":true})"), "2.5");
  CHECK_EQ(run(Value(), R"({"upper":true})"), kDash);
}

TEST(format_shift) {
  const char* delayed = R"({"shift":{"v":"t.delay","scale":60},"time":"HH:mm"})";
  CHECK_EQ(run(str("14:15"), delayed), "14:22");                 // timetable time + 7 min delay
  CHECK_EQ(run(str("14:15"), R"({"shift":{"v":"t.delay","scale":60},"until":true})"), "22");
  CHECK_EQ(run(str("14:15"), R"({"shift":{"v":"t.none","scale":60},"time":"HH:mm"})"), "14:15");  // null delay
  CHECK_EQ(run(str("14:15"), R"({"shift":{"v":"t.text","scale":60},"time":"HH:mm"})"), "14:15");
  CHECK_EQ(run(str("14:15"), R"({"shift":{"v":"t.missing"},"until":true})"), "15");
  CHECK_EQ(run(num(1782907200), R"({"shift":{"v":"t.delay"},"time":"HH:mm:ss"})"), "14:00:07");  // scale 1
  CHECK_EQ(run(str("2026-07-01T13:59"), R"({"shift":{"v":"t.delay","scale":60},"until":true})"), "6");
  CHECK_EQ(run(Value::boolean(true), delayed), kDash);           // not a time
  CHECK_EQ(run(str("soon"), delayed), kDash);
  CHECK_EQ(run(num(1782907200), R"({"shift":{"v":"t.delay","scale":1e300}})"), kDash);
}
