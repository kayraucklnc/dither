// Text layout against a synthetic monospace font: letters advance 6 and are
// solid 5x8 blocks above the baseline, space advances 4, '.' 2, '?' 6, '…' 5.
#include "../src/runtime/elements.h"
#include "../src/runtime/text.h"
#include "../src/runtime/utf8.h"
#include "check.h"
#include "helpers.h"

using namespace dither;
using testutil::GlyphSpec;
using Rows = std::vector<std::string>;

namespace {

std::vector<uint8_t> fontBytes(bool withQuestion, bool withEllipsis) {
  std::vector<GlyphSpec> g;
  g.push_back({' ', 0, 0, 0, 0, 4, {}});
  g.push_back({'.', 1, 1, 0, -1, 2, {}});
  if (withQuestion) g.push_back({'?', 5, 8, 0, -8, 6, {}});
  for (uint32_t c = 'a'; c <= 'z'; ++c) g.push_back({c, 5, 8, 0, -8, 6, {}});
  if (withEllipsis) g.push_back({0x2026, 5, 1, 0, -1, 5, {}});
  return testutil::makeFont(10, 8, 2, g);
}

const std::vector<uint8_t>& standardFont() {
  static const std::vector<uint8_t> bytes = fontBytes(true, true);
  return bytes;
}

Font font(const std::vector<uint8_t>& bytes = standardFont()) {
  return *Font::parse({bytes.data(), bytes.size()});
}

// Each line as text, with '…' shown as '~' and '?' as itself.
Rows lines(const Font& f, const char* text, int w, int h, bool wrap, int maxLines = 0) {
  TextBox box;
  box.w = w;
  box.h = h;
  box.wrap = wrap;
  box.maxLines = maxLines;
  Rows out;
  for (const auto& line : layoutText(f, text, box)) {
    std::string s;
    for (const auto& g : line.glyphs) s += g.codepoint == 0x2026 ? '~' : static_cast<char>(g.codepoint);
    out.push_back(s + "|" + std::to_string(line.width));
  }
  return out;
}

}  // namespace

TEST(text_single_line_and_ellipsis) {
  Font f = font();
  CHECK_EQ(lines(f, "hello", 30, 10, false), (Rows{"hello|30"}));
  CHECK_EQ(lines(f, "hello", 29, 10, false), (Rows{"hell~|29"}));
  CHECK_EQ(lines(f, "hello", 28, 10, false), (Rows{"hel~|23"}));
  CHECK_EQ(lines(f, "hello", 4, 10, false), (Rows{"~|5"}));  // drops everything, still appends
  CHECK_EQ(lines(f, "a\nb", 100, 10, false), (Rows{"a b|16"}));
  CHECK_EQ(lines(f, "", 100, 10, false), (Rows{"|0"}));
}

TEST(text_missing_glyphs) {
  Font f = font();
  CHECK_EQ(lines(f, "h\xC3\xA9!", 100, 10, false), (Rows{"h??|18"}));
  CHECK_EQ(lines(f, "A", 100, 10, false), (Rows{"?|6"}));
  auto noQuestion = fontBytes(false, true);
  CHECK_EQ(lines(font(noQuestion), "hA!i", 100, 10, false), (Rows{"hi|12"}));
  auto noEllipsis = fontBytes(true, false);
  CHECK_EQ(lines(font(noEllipsis), "hello", 29, 10, false), (Rows{"hel...|24"}));
}

TEST(text_wrapping_greedy) {
  Font f = font();
  CHECK_EQ(lines(f, "aa bb cc dd", 40, 30, true), (Rows{"aa bb|28", "cc dd|28"}));
  CHECK_EQ(lines(f, "aa bb", 28, 30, true), (Rows{"aa bb|28"}));  // exactly fits
  CHECK_EQ(lines(f, "  aa    bb  ", 27, 30, true), (Rows{"aa|12", "bb|12"}));
  CHECK_EQ(lines(f, "a\n\nb", 40, 30, true), (Rows{"a|6", "|0", "b|6"}));
  CHECK_EQ(lines(f, "", 40, 30, true), (Rows{"|0"}));
}

TEST(text_wrapping_breaks_long_words) {
  Font f = font();
  CHECK_EQ(lines(f, "abcdefghij", 40, 30, true), (Rows{"abcdef|36", "ghij|24"}));
  // The rest carries on as a word and may share a line.
  CHECK_EQ(lines(f, "abcdefgh ij", 40, 30, true), (Rows{"abcdef|36", "gh ij|28"}));
  // A long word after other words starts its own line.
  CHECK_EQ(lines(f, "ab abcdefgh", 40, 30, true), (Rows{"ab|12", "abcdef|36", "gh|12"}));
  // At least one codepoint per line even when nothing fits.
  CHECK_EQ(lines(f, "abc", 3, 100, true), (Rows{"a|6", "b|6", "c|6"}));
}

TEST(text_wrapping_truncates_to_max_lines) {
  Font f = font();
  // h = 25 allows 2 lines of 10.
  CHECK_EQ(lines(f, "aa bb cc dd ee ff", 28, 25, true), (Rows{"aa bb|28", "cc d~|27"}));
  CHECK_EQ(lines(f, "aa bb cc dd ee ff", 28, 100, true, 1), (Rows{"aa b~|27"}));
  // A last line that fits is still ellipsized when text was cut.
  CHECK_EQ(lines(f, "aa\nb\nc", 100, 20, true), (Rows{"aa|12", "b~|11"}));
  // h smaller than one line still allows one.
  CHECK_EQ(lines(f, "aa bb", 12, 5, true), (Rows{"a~|11"}));
}

namespace {

Framebuffer renderText(const char* elementJson, int w = 24, int h = 24) {
  static TimeZone tz;
  static Locale locale = Locale::fromJson(JsonView());
  ValueStore values;
  values.set("s.n", Value::number(4.5));
  std::vector<ByteSpan> assets = {{standardFont().data(), standardFont().size()}};
  RenderContext ctx;
  ctx.values = &values;
  ctx.format.tz = &tz;
  ctx.format.locale = &locale;
  ctx.assets = &assets;
  Framebuffer fb(w, h);
  JsonDoc doc;
  if (doc.parse(elementJson).ok) drawElement(fb, doc.root(), ctx);
  return fb;
}

}  // namespace

TEST(text_placement_and_clipping) {
  // One glyph, top-left: rows 0..7, cols 0..4 (baseline at 8, yOffset -8).
  Framebuffer fb = renderText(R"({"t":"text","x":0,"y":0,"w":24,"h":24,"font":0,"parts":["a"]})");
  CHECK(fb.get(0, 0) && fb.get(4, 7) && !fb.get(5, 0) && !fb.get(0, 8));
  // Centred: (24 - 6) / 2 = 9; middle: (24 - 10) / 2 = 7.
  fb = renderText(R"({"t":"text","x":0,"y":0,"w":24,"h":24,"font":0,"a":"c","va":"m","parts":["a"]})");
  CHECK(fb.get(9, 7) && fb.get(13, 14) && !fb.get(8, 7) && !fb.get(9, 6) && !fb.get(14, 7));
  // Right, bottom: x = 24 - 6 = 18, top = 24 - 10 = 14.
  fb = renderText(R"({"t":"text","x":0,"y":0,"w":24,"h":24,"font":0,"a":"r","va":"b","parts":["a"]})");
  CHECK(fb.get(18, 14) && fb.get(22, 21) && !fb.get(17, 14));
  // Clipped to the box: a 4-pixel-high box shows rows 2..5 only.
  fb = renderText(R"({"t":"text","x":0,"y":2,"w":6,"h":4,"font":0,"parts":["a"]})");
  CHECK_EQ(testutil::countInk(fb), 20);
  CHECK(fb.get(0, 2) && fb.get(4, 5) && !fb.get(0, 6));
  // "abc" cannot fit in 6 with the ellipsis, so the line is just "…" (5 wide,
  // drawn at baseline - 1). Middle alignment floors towards -inf:
  // top = 10 + floor((5 - 10) / 2) = 7, so the ellipsis lands on row 14,
  // inside the box; truncation towards zero would put it on row 15.
  fb = renderText(R"({"t":"text","x":0,"y":10,"w":6,"h":5,"font":0,"va":"m","parts":["abc"]})");
  CHECK(fb.get(0, 14) && fb.get(4, 14) && !fb.get(5, 14));
  CHECK_EQ(testutil::countInk(fb), 5);
  // White text on black.
  fb = renderText(R"({"t":"text","x":0,"y":0,"w":6,"h":10,"font":0,"c":0,"parts":["a"]})");
  CHECK_EQ(testutil::countInk(fb), 0);
}

TEST(text_parts) {
  static TimeZone tz;
  static Locale locale = Locale::fromJson(JsonView());
  ValueStore values;
  values.set("w.t", Value::number(21.456));
  RenderContext ctx;
  ctx.values = &values;
  ctx.format.tz = &tz;
  ctx.format.locale = &locale;
  JsonDoc doc;
  CHECK(doc.parse(R"(["T ",{"v":"w.t","f":{"num":{"d":1}}},"° ",{"v":"w.t"}," ",{"v":"w.none"},
                     " ",{"k":"abc","f":{"upper":true}}," ",{"k":3.5}])")
            .ok);
  CHECK_EQ(buildText(doc.root(), ctx), std::string("T 21.5\xC2\xB0 21.46 \xE2\x80\x93 ABC 3.5"));
}

TEST(utf8_decoding) {
  CHECK(decodeUtf8("a\xC3\xA9\xE2\x80\xA6\xF0\x9F\x98\x80") == std::u32string(U"aé…\U0001F600"));
  CHECK(decodeUtf8("\xFF" "a") == std::u32string(U"�a"));
  CHECK(decodeUtf8("\xC3") == std::u32string(U"�"));
  CHECK(decodeUtf8("\xC0\x80") == std::u32string(U"��"));  // overlong
  CHECK(decodeUtf8("\xED\xA0\x80").size() == 3);                      // surrogate
}
