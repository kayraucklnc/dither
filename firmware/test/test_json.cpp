#include <cstdlib>
#include <cstring>

#include "../src/runtime/json.h"
#include "../src/runtime/source.h"
#include "check.h"

using namespace dither;

TEST(json_parses_documents) {
  JsonDoc doc;
  auto r = doc.parse(R"( {"a": [1, -2.5e3, true, false, null, "x\"\\\/\n\u00e9\ud83d\ude00"], "b": {}, "c": [] } )");
  CHECK(r.ok);
  JsonView a = doc.root()["a"];
  CHECK_EQ(a.size(), size_t{6});
  CHECK_EQ(a[size_t{0}].number(), 1.0);
  CHECK_EQ(a[size_t{1}].number(), -2500.0);
  CHECK(a[size_t{2}].boolean(false));
  CHECK(a[size_t{4}].isNull() && a[size_t{4}].exists());
  CHECK_EQ(std::string(a[size_t{5}].string()), std::string("x\"\\/\n\xC3\xA9\xF0\x9F\x98\x80"));
  CHECK(doc.root()["b"].isObject() && doc.root()["b"].size() == 0);
  CHECK(!doc.root()["missing"].exists());
  CHECK(!a[size_t{9}].exists());
}

TEST(json_numbers_are_correctly_rounded) {
  // The reason this parser exists: these must match JSON.parse bit for bit.
  const char* const samples[] = {"80.66", "432.462", "0.1", "1.005", "2.675", "1e-7", "123456789.123456789",
                                 "-0", "5e-324", "1.7976931348623157e308"};
  for (const char* s : samples) {
    JsonDoc doc;
    CHECK(doc.parse(s).ok);
    double expected = std::strtod(s, nullptr);
    double actual = doc.root().number(42);
    CHECK(std::memcmp(&expected, &actual, sizeof actual) == 0);
  }
}

TEST(json_rejects_malformed) {
  const char* const bad[] = {"", "{", "[1,]", "{\"a\":}", "01", "1.", ".5", "+1", "\"abc", "tru", "[1 2]",
                             "{\"a\" 1}", "\"\x01\"", "1 2", "{'a':1}", "\"\\x\""};
  for (const char* b : bad) {
    JsonDoc doc;
    CHECK(!doc.parse(b).ok);
  }
}

TEST(json_duplicate_keys_keep_the_last) {
  JsonDoc doc;
  CHECK(doc.parse(R"({"a":1,"a":2})").ok);
  CHECK_EQ(doc.root()["a"].number(), 2.0);
}

TEST(json_filter_keeps_only_paths) {
  JsonFilter f;
  f.addPath("current.temperature_2m");
  f.addPath("hourly.time.0");
  f.addPath("hourly.temperature_2m", 3);
  JsonDoc doc;
  auto r = doc.parse(R"({"latitude":45.4,"current":{"temperature_2m":21.5,"wind":3},
                         "hourly":{"time":["a","b","c"],"temperature_2m":[1,2,3,4,5],"rain":[0,0]},
                         "big":{"nested":[[1,2],[3,4]]}})",
                     &f);
  CHECK(r.ok);
  JsonView root = doc.root();
  CHECK(!root["latitude"].exists());
  CHECK(!root["big"].exists());
  CHECK(!root["current"]["wind"].exists());
  CHECK_EQ(root["current"]["temperature_2m"].number(), 21.5);
  CHECK_EQ(root["hourly"]["time"].size(), size_t{1});
  CHECK_EQ(root["hourly"]["temperature_2m"].size(), size_t{3});
  CHECK(!root["hourly"]["rain"].exists());
  CHECK(doc.nodeCount() < 12);
}

TEST(source_path_extraction) {
  JsonDoc doc;
  CHECK(doc.parse(R"({"current":{"t":21.5,"code":3,"name":"x","ok":true,"nil":null},
                      "daily":{"time":["2026-07-01","2026-07-02"],"max":[30,31.5,"x",33]},
                      "arr":[{"v":1},{"v":2}], "obj":{"0":"zero"}})")
            .ok);
  JsonView root = doc.root();
  CHECK(extractPath(root, "current.t", -1) == Value::number(21.5));
  CHECK(extractPath(root, "current.name", -1) == Value::string("x"));
  CHECK(extractPath(root, "current.ok", -1) == Value::boolean(true));
  CHECK(extractPath(root, "current.nil", -1).isNull());
  CHECK(extractPath(root, "current.missing", -1).isNull());
  CHECK(extractPath(root, "current", -1).isNull());      // ends on an object
  CHECK(extractPath(root, "daily.max", -1).isNull());    // ends on an array
  CHECK(extractPath(root, "daily.time.1", -1) == Value::string("2026-07-02"));
  CHECK(extractPath(root, "arr.1.v", -1) == Value::number(2));
  CHECK(extractPath(root, "arr.x", -1).isNull());
  CHECK(extractPath(root, "obj.0", -1) == Value::string("zero"));
  CHECK(extractPath(root, "daily.max", 24) == Value::series({30, 31.5}));  // stops at "x"
  CHECK(extractPath(root, "daily.max", 1) == Value::series({30}));
  CHECK(extractPath(root, "daily.max", 0) == Value::series({}));
  CHECK(extractPath(root, "current.t", 3).isNull());  // count needs an array
  CHECK(extractPath(root, "daily.time", 3) == Value::series({}));
}

TEST(source_spec_parsing) {
  JsonDoc doc;
  CHECK(doc.parse(R"([{"id":"w1","url":"https://x/y","headers":[["Accept","application/json"]],"every":1800,
                       "values":[{"key":"temp","path":"current.t"},{"key":"h","path":"hourly.t","count":100}]},
                      {"url":"no id"}])")
            .ok);
  auto sources = parseSources(doc.root());
  CHECK_EQ(sources.size(), size_t{1});
  CHECK_EQ(sources[0].id, std::string("w1"));
  CHECK_EQ(sources[0].every, 1800u);
  CHECK_EQ(sources[0].headers.size(), size_t{1});
  CHECK_EQ(sources[0].values[1].count, 64);  // capped

  JsonDoc response;
  JsonFilter filter = buildFilter(sources[0]);
  CHECK(response.parse(R"({"current":{"t":4},"hourly":{"t":[1,2,3]},"other":1})", &filter).ok);
  ValueStore store;
  applyResponse(sources[0], response, store);
  CHECK(store.get("w1.temp") == Value::number(4));
  CHECK(store.get("w1.h") == Value::series({1, 2, 3}));
}

TEST(json_filter_scalar_leaves_and_series) {
  JsonFilter f;
  f.addPath("a");              // a scalar leaf
  f.addPath("s", 3);           // a series
  f.addPath("s", 5);           // the larger count wins
  f.addPath("t.1");            // an index alongside nothing else
  JsonDoc doc;
  CHECK(doc.parse(R"({"a":{"big":[1,2,3]},"s":[1,2,"x",4,5,6,7],"t":[{"x":1},"keep",3]})", &f,
                  JsonLimits::response())
            .ok);
  CHECK(!doc.root()["a"].exists());  // a container at a scalar leaf is not kept
  CHECK(extractPath(doc.root(), "a", -1).isNull());
  CHECK_EQ(doc.root()["s"].size(), size_t{5});
  CHECK(extractPath(doc.root(), "s", 5) == Value::series({1, 2}));  // the string still stops it
  CHECK(extractPath(doc.root(), "t.1", -1) == Value::string("keep"));
  CHECK_EQ(doc.root()["t"].size(), size_t{2});  // element 0 holds its place as null

  // A container inside a series' range is kept as a placeholder that stops it.
  JsonFilter g;
  g.addPath("s", 4);
  CHECK(doc.parse(R"({"s":[1,[2,3],4]})", &g, JsonLimits::response()).ok);
  CHECK(extractPath(doc.root(), "s", 4) == Value::series({1}));

  // A path that is a prefix of another keeps the structure for the longer one.
  JsonFilter h;
  h.addPath("a");
  h.addPath("a.b");
  CHECK(doc.parse(R"({"a":{"b":7,"c":8}})", &h, JsonLimits::response()).ok);
  CHECK(extractPath(doc.root(), "a.b", -1) == Value::number(7));
  CHECK(extractPath(doc.root(), "a", -1).isNull());
  CHECK(!doc.root()["a"]["c"].exists());
}

TEST(json_budgets) {
  JsonFilter f;
  f.addPath("s", 64);
  f.addPath("text");
  JsonDoc doc;
  JsonLimits tight = JsonLimits::response();
  tight.maxNodes = 10;
  CHECK(!doc.parse(R"({"s":[1,2,3,4,5,6,7,8,9,10,11,12]})", &f, tight).ok);
  CHECK(doc.parse(R"({"s":[1,2,3,4,5,6,7,8]})", &f, tight).ok);

  // Kept strings are cut at 256 bytes, on a UTF-8 boundary.
  std::string longText(255, 'a');
  longText += "\xC3\xA7\xC3\xA7";  // 259 bytes; the cut lands inside the first ç
  CHECK(doc.parse("{\"text\":\"" + longText + "\"}", &f, JsonLimits::response()).ok);
  CHECK_EQ(doc.root()["text"].string().size(), size_t{255});
  JsonLimits fewBytes = JsonLimits::response();
  fewBytes.maxStringBytes = 8;
  CHECK(!doc.parse(R"({"text":"0123456789"})", &f, fewBytes).ok);

  // Unknown long keys are not accumulated, and do not match.
  std::string longKey(5000, 'k');
  CHECK(doc.parse("{\"" + longKey + "\":1,\"text\":\"ok\"}", &f, JsonLimits::response()).ok);
  CHECK_EQ(std::string(doc.root()["text"].string()), std::string("ok"));
  CHECK(doc.stringBytes() < 16);
}

TEST(json_depth_only_counts_kept_nesting) {
  std::string deep;
  for (int i = 0; i < 500; ++i) deep += "[";
  for (int i = 0; i < 500; ++i) deep += "]";
  JsonFilter f;
  f.addPath("v");
  JsonDoc doc;
  CHECK(doc.parse("{\"junk\":" + deep + ",\"v\":3}", &f, JsonLimits::response()).ok);  // skipped iteratively
  CHECK(extractPath(doc.root(), "v", -1) == Value::number(3));
  CHECK(!doc.parse(deep).ok);  // unfiltered: limited
  JsonFilter g;
  g.addPath("a.a.a.a.a.a.a.a.a.a.a.a.a.a.a.a.a.a.a.a.a.a");  // 22 levels
  std::string nested;
  for (int i = 0; i < 22; ++i) nested += "{\"a\":";
  nested += "1";
  for (int i = 0; i < 22; ++i) nested += "}";
  CHECK(!doc.parse(nested, &g, JsonLimits::response()).ok);
  CHECK(doc.parse(nested, &g, JsonLimits::runtime()).ok);
}

TEST(json_filtered_root_without_matches) {
  JsonFilter f;
  f.addPath("x");
  JsonDoc doc;
  CHECK(doc.parse(R"({"y":1})", &f, JsonLimits::response()).ok);
  CHECK(doc.root().isObject() && doc.root().size() == 0);
  CHECK(doc.parse(R"([1,2])", &f, JsonLimits::response()).ok);
  CHECK(extractPath(doc.root(), "x", -1).isNull());
}

namespace {

// A Stripe-like list: data[] of balance transactions.
const char* kStripe = R"({"object":"list","has_more":true,"data":[
  {"id":"txn_1","amount":1200,"fee":65,"description":"Order 1","source":{"amount":1200,"currency":"eur"},
   "fee_details":[{"amount":65,"type":"stripe_fee"}],"metadata":{"long":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}},
  {"id":"txn_2","amount":-300,"fee":0,"description":"Refund","source":{"amount":"n/a"}},
  {"id":"txn_3","amount":"pending","fee":12.5,"description":"Order 3","source":{"amount":450.25}},
  {"id":"txn_4","fee":null,"description":"Payout","source":null},
  7,
  {"id":"txn_6","amount":99.75,"fee":1,"source":{"amount":0}}
]})";

std::vector<SourceSpec> stripeSources() {
  JsonDoc spec;
  spec.parse(R"([{"id":"s","url":"https://api.stripe.com/v1/balance_transactions","values":[
    {"key":"gross","path":"data","agg":"sum","field":"amount"},
    {"key":"n","path":"data","agg":"count"},
    {"key":"net","path":"data","agg":"sum","field":"source.amount"},
    {"key":"fees","path":"data","agg":"sum","field":"fee_details.0.amount"},
    {"key":"first","path":"data.0.amount"},
    {"key":"second","path":"data.1.description"},
    {"key":"more","path":"has_more"},
    {"key":"none","path":"missing","agg":"sum","field":"amount"},
    {"key":"notArray","path":"object","agg":"count"},
    {"key":"noField","path":"data","agg":"sum"},
    {"key":"weird","path":"data","agg":"avg"}]}])");
  return parseSources(spec.root());
}

}  // namespace

TEST(aggregates_while_streaming) {
  auto sources = stripeSources();
  JsonFilter filter = buildFilter(sources[0]);
  JsonDoc doc;
  CHECK(doc.parse(kStripe, &filter, JsonLimits::response()).ok);
  ValueStore store;
  applyResponse(sources[0], doc, store);
  CHECK(store.get("s.gross") == Value::number(1200 - 300 + 99.75));  // "pending" and the missing one skipped
  CHECK(store.get("s.n") == Value::number(6));                        // the bare 7 counts too
  CHECK(store.get("s.net") == Value::number(1200 + 450.25 + 0));      // nested field
  CHECK(store.get("s.fees") == Value::number(65));
  CHECK(store.get("s.first") == Value::number(1200));                 // indexed paths alongside
  CHECK(store.get("s.second") == Value::string("Refund"));
  CHECK(store.get("s.more") == Value::boolean(true));
  CHECK(store.get("s.none").isNull());
  CHECK(store.get("s.notArray").isNull());
  CHECK(store.get("s.noField").isNull());
  CHECK(store.get("s.weird").isNull());
  // Nothing of the elements is kept beyond what the indexed paths want.
  CHECK(doc.nodeCount() < 20);
  CHECK(!doc.root()["data"][size_t{2}].exists());

  // The streaming result equals the whole-tree one.
  JsonDoc full;
  CHECK(full.parse(kStripe).ok);
  for (const auto& v : sources[0].values) {
    if (v.agg == SourceValueSpec::Agg::Count || v.agg == SourceValueSpec::Agg::Sum) {
      CHECK(aggregateFromTree(full.root(), v) == store.get("s." + v.key));
    }
  }
}

TEST(aggregates_edge_cases) {
  auto sources = stripeSources();
  JsonFilter filter = buildFilter(sources[0]);
  JsonDoc doc;
  ValueStore store;
  CHECK(doc.parse(R"({"data":[]})", &filter, JsonLimits::response()).ok);
  applyResponse(sources[0], doc, store);
  CHECK(store.get("s.gross") == Value::number(0));
  CHECK(store.get("s.n") == Value::number(0));
  CHECK(store.get("s.first").isNull());
  CHECK(doc.parse(R"({"data":{"amount":5}})", &filter, JsonLimits::response()).ok);
  applyResponse(sources[0], doc, store);
  CHECK(store.get("s.gross").isNull());
  CHECK(store.get("s.n").isNull());
  // Duplicate keys: the last one decides, as with JSON.parse.
  CHECK(doc.parse(R"({"data":[{"amount":1}],"data":[{"amount":2},{"amount":3}]})", &filter, JsonLimits::response()).ok);
  applyResponse(sources[0], doc, store);
  CHECK(store.get("s.gross") == Value::number(5));
  CHECK(doc.parse(R"({"data":[{"amount":1}],"data":null})", &filter, JsonLimits::response()).ok);
  applyResponse(sources[0], doc, store);
  CHECK(store.get("s.gross").isNull());
}

TEST(aggregates_do_not_materialise_big_lists) {
  // 100 elements of ~1 KB each: well past the 2048-value and 16 KB budgets
  // if the elements were kept.
  std::string body = R"({"data":[)";
  for (int i = 0; i < 100; ++i) {
    if (i) body += ",";
    body += R"({"id":"txn_)" + std::to_string(i) + R"(","amount":)" + std::to_string(i) + R"(,"tags":[)";
    for (int t = 0; t < 40; ++t) body += (t ? ",\"" : "\"") + std::string(16, 'a' + t % 26) + "\"";
    body += R"(],"source":{"amount":1}})";
  }
  body += "]}";
  CHECK(body.size() > 100 * 700);
  auto sources = stripeSources();
  JsonFilter filter = buildFilter(sources[0]);
  JsonDoc doc;
  CHECK(doc.parse(body, &filter, JsonLimits::response()).ok);
  ValueStore store;
  applyResponse(sources[0], doc, store);
  CHECK(store.get("s.gross") == Value::number(4950));
  CHECK(store.get("s.n") == Value::number(100));
  CHECK(store.get("s.net") == Value::number(100));
  CHECK(store.get("s.first") == Value::number(0));
  CHECK(doc.nodeCount() < 20);
}
