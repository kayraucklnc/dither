// Web pages as text: the shared cases in spec/html/cases.json, which the
// TypeScript runtime's tests read too.
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>

#include "../src/runtime/html.h"
#include "../src/runtime/source.h"
#include "check.h"

using namespace dither;

namespace {

std::string casesText() {
  const char* fixtures = std::getenv("DITHER_FIXTURES");
  std::filesystem::path file = std::filesystem::path(fixtures ? fixtures : "../spec/fixtures") / ".." / "html" / "cases.json";
  std::ifstream in(file, std::ios::binary);
  return std::string((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
}

HtmlText convert(std::string_view html) {
  HtmlText page;
  MemorySource body(html);
  page.read(body);
  return page;
}

}  // namespace

TEST(html_shared_cases) {
  const std::string text = casesText();
  JsonDoc doc;
  CHECK(doc.parse(text).ok);
  size_t n = 0;
  for (JsonView c = doc.root().first(); c.exists(); c = c.next(), ++n) {
    HtmlText page = convert(c["html"].string());
    const std::string name(c["name"].string());
    CHECK_EQ(page.text(), std::string(c["text"].string()));
    CHECK_EQ(page.title(), std::string(c["title"].string()));
    if (page.text() != c["text"].string()) std::cerr << "    in case " << name << "\n";
  }
  CHECK(n >= 10);
}

TEST(html_page_values) {
  JsonDoc doc;
  CHECK(doc.parse(R"([{"id":"p","url":"https://x","every":300,"html":true,"values":[
    {"key":"body","path":"text"},{"key":"name","path":"title"},{"key":"other","path":"h1"},
    {"key":"n","path":"text","count":3}]}])").ok);
  auto sources = parseSources(doc.root());
  CHECK(sources.size() == 1 && sources[0].html);
  ValueStore store;
  applyPage(sources[0], convert("<title>T</title><p>Hi</p>"), store);
  CHECK(store.get("p.body") == Value::string("Hi"));
  CHECK(store.get("p.name") == Value::string("T"));
  CHECK(store.get("p.other").isNull());
  CHECK(store.get("p.n").isNull());
}
