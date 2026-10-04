#include "text.h"

#include <algorithm>
#include <deque>

#include "timezone.h"  // floorDiv
#include "utf8.h"

namespace dither {
namespace {

constexpr char32_t kNewline = U'\n';
constexpr char32_t kSpace = U' ';

// A codepoint the font lacks becomes '?', or nothing if '?' is missing too.
void appendGlyph(const Font& font, char32_t cp, GlyphRun& out) {
  if (auto g = font.find(cp)) {
    out.push_back(*g);
  } else if (auto q = font.find(U'?')) {
    out.push_back(*q);
  }
}

GlyphRun toGlyphs(const Font& font, std::u32string_view cps) {
  GlyphRun run;
  for (char32_t cp : cps) appendGlyph(font, cp, run);
  return run;
}

GlyphRun ellipsisRun(const Font& font) {
  if (auto g = font.find(U'…')) return {*g};
  return toGlyphs(font, U"...");
}

TextLine makeLine(GlyphRun run) {
  TextLine line;
  line.width = runWidth(run);
  line.glyphs = std::move(run);
  return line;
}

// Drops glyphs from the end until it fits with the ellipsis, then appends it.
TextLine ellipsize(const Font& font, GlyphRun run, int64_t w) {
  const GlyphRun ell = ellipsisRun(font);
  const int64_t ellWidth = runWidth(ell);
  int64_t width = runWidth(run);
  while (!run.empty() && width + ellWidth > w) {
    width -= run.back().advance;
    run.pop_back();
  }
  run.insert(run.end(), ell.begin(), ell.end());
  return makeLine(std::move(run));
}

std::vector<std::u32string_view> split(std::u32string_view s, char32_t sep, bool dropEmpty) {
  std::vector<std::u32string_view> out;
  size_t start = 0;
  while (true) {
    size_t at = s.find(sep, start);
    std::u32string_view part = s.substr(start, at == std::u32string_view::npos ? at : at - start);
    if (!dropEmpty || !part.empty()) out.push_back(part);
    if (at == std::u32string_view::npos) break;
    start = at + 1;
  }
  return out;
}

// Greedy wrapping of one paragraph; stops once `limit` lines exist.
void wrapParagraph(const Font& font, std::u32string_view para, int64_t w, size_t limit,
                   std::vector<TextLine>& lines) {
  std::deque<GlyphRun> words;
  for (auto word : split(para, kSpace, true)) words.push_back(toGlyphs(font, word));
  if (words.empty()) {
    lines.push_back(TextLine());
    return;
  }
  GlyphRun space;
  appendGlyph(font, kSpace, space);
  const int64_t spaceWidth = runWidth(space);

  GlyphRun current;
  bool hasWord = false;
  while (!words.empty() && lines.size() < limit) {
    GlyphRun word = std::move(words.front());
    words.pop_front();
    const int64_t wordWidth = runWidth(word);
    if (hasWord) {
      if (runWidth(current) + spaceWidth + wordWidth <= w) {
        current.insert(current.end(), space.begin(), space.end());
        current.insert(current.end(), word.begin(), word.end());
        continue;
      }
      lines.push_back(makeLine(std::move(current)));
      current.clear();
      hasWord = false;
      words.push_front(std::move(word));
      continue;
    }
    if (wordWidth <= w || word.empty()) {
      current = std::move(word);
      hasWord = true;
      continue;
    }
    // Wider than the box on its own: as many glyphs as fit, at least one.
    size_t take = 1;
    int64_t width = word[0].advance;
    while (take < word.size() && width + word[take].advance <= w) width += word[take++].advance;
    lines.push_back(makeLine(GlyphRun(word.begin(), word.begin() + static_cast<std::ptrdiff_t>(take))));
    if (take < word.size()) words.push_front(GlyphRun(word.begin() + static_cast<std::ptrdiff_t>(take), word.end()));
  }
  if (hasWord && lines.size() < limit) lines.push_back(makeLine(std::move(current)));
}

}  // namespace

int64_t runWidth(const GlyphRun& run) {
  int64_t w = 0;
  for (const Glyph& g : run) w += g.advance;
  return w;
}

std::vector<TextLine> layoutText(const Font& font, std::string_view utf8, const TextBox& box) {
  std::u32string cps = decodeUtf8(utf8);
  std::vector<TextLine> lines;

  if (!box.wrap) {
    std::replace(cps.begin(), cps.end(), kNewline, kSpace);
    GlyphRun run = toGlyphs(font, cps);
    if (runWidth(run) > box.w) {
      lines.push_back(ellipsize(font, std::move(run), box.w));
    } else {
      lines.push_back(makeLine(std::move(run)));
    }
    return lines;
  }

  int64_t maxLines = font.lineHeight() > 0 ? floorDiv(box.h, font.lineHeight()) : 1;
  if (box.maxLines > 0) maxLines = std::min<int64_t>(maxLines, box.maxLines);
  const size_t limit = static_cast<size_t>(std::max<int64_t>(1, maxLines));

  // One line beyond the limit is enough to know the text overflows.
  for (auto para : split(cps, kNewline, false)) {
    if (lines.size() > limit) break;
    wrapParagraph(font, para, box.w, limit + 1, lines);
  }
  if (lines.size() > limit) {
    lines.resize(limit);
    lines.back() = ellipsize(font, std::move(lines.back().glyphs), box.w);
  }
  return lines;
}

void drawTextLines(const Canvas& c, const Font& font, const std::vector<TextLine>& lines, const TextBox& box) {
  const Canvas clipped = c.withClip({box.x, box.y, box.x + box.w, box.y + box.h});
  const int64_t lineHeight = font.lineHeight();
  const int64_t blockHeight = static_cast<int64_t>(lines.size()) * lineHeight;
  int64_t top = box.y;
  if (box.valign == 'm') top = box.y + floorDiv(box.h - blockHeight, 2);
  if (box.valign == 'b') top = box.y + box.h - blockHeight;

  for (size_t i = 0; i < lines.size(); ++i) {
    const TextLine& line = lines[i];
    const int64_t baseline = top + static_cast<int64_t>(i) * lineHeight + font.ascent();
    int64_t pen = box.x;
    if (box.align == 'c') pen = box.x + floorDiv(box.w - line.width, 2);
    if (box.align == 'r') pen = box.x + box.w - line.width;
    for (const Glyph& g : line.glyphs) {
      drawMask(clipped, g.bits, g.width, g.height, pen + g.xOffset, baseline + g.yOffset);
      pen += g.advance;
    }
  }
}

}  // namespace dither
