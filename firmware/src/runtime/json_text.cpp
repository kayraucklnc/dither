#include "json_text.h"

#include <cstdlib>
#include <string>
#include <vector>

namespace dither {
namespace {

bool isSpace(char c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r';
}

bool isDigit(char c) {
  return c >= '0' && c <= '9';
}

uint32_t skipSpace(std::string_view t, uint32_t i) {
  while (i < t.size() && isSpace(t[i])) ++i;
  return i;
}

// Past the closing quote of the string whose opening quote is at `i`.
uint32_t skipString(std::string_view t, uint32_t i) {
  for (++i; i < t.size(); ++i) {
    if (t[i] == '\\') {
      ++i;
    } else if (t[i] == '"') {
      return i + 1;
    }
  }
  return static_cast<uint32_t>(t.size());
}

// Past the value at `i` (the text is known to be valid).
uint32_t skipValue(std::string_view t, uint32_t i) {
  if (t[i] == '"') return skipString(t, i);
  if (t[i] != '{' && t[i] != '[') {
    while (i < t.size() && t[i] != ',' && t[i] != '}' && t[i] != ']' && !isSpace(t[i])) ++i;
    return i;
  }
  size_t depth = 0;
  while (i < t.size()) {
    char c = t[i];
    if (c == '"') {
      i = skipString(t, i);
      continue;
    }
    ++i;
    if (c == '{' || c == '[') {
      ++depth;
    } else if ((c == '}' || c == ']') && --depth == 0) {
      return i;
    }
  }
  return i;
}

void appendUtf8(std::string& s, uint32_t cp) {
  if (cp < 0x80) {
    s += static_cast<char>(cp);
  } else if (cp < 0x800) {
    s += static_cast<char>(0xC0 | (cp >> 6));
    s += static_cast<char>(0x80 | (cp & 0x3F));
  } else if (cp < 0x10000) {
    s += static_cast<char>(0xE0 | (cp >> 12));
    s += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
    s += static_cast<char>(0x80 | (cp & 0x3F));
  } else {
    s += static_cast<char>(0xF0 | (cp >> 18));
    s += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
    s += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
    s += static_cast<char>(0x80 | (cp & 0x3F));
  }
}

uint32_t hex4(std::string_view t, uint32_t i) {
  uint32_t v = 0;
  for (uint32_t k = 0; k < 4; ++k) {
    char c = t[i + k];
    v = v * 16 + static_cast<uint32_t>(isDigit(c) ? c - '0' : (c | 0x20) - 'a' + 10);
  }
  return v;
}

// Decodes the escaped string whose opening quote is at `i`, the same way the
// streaming parser does (lone surrogates become U+FFFD).
std::string decode(std::string_view t, uint32_t i) {
  std::string out;
  for (++i; t[i] != '"'; ++i) {
    if (t[i] != '\\') {
      out += t[i];
      continue;
    }
    char e = t[++i];
    switch (e) {
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'u': {
        uint32_t cp = hex4(t, i + 1);
        i += 4;
        if (cp >= 0xD800 && cp < 0xDC00 && t[i + 1] == '\\' && t[i + 2] == 'u') {
          uint32_t lo = hex4(t, i + 3);
          i += 6;
          if (lo >= 0xDC00 && lo < 0xE000) {
            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
          } else {
            appendUtf8(out, 0xFFFD);
            cp = lo;
          }
        }
        if (cp >= 0xD800 && cp < 0xE000) cp = 0xFFFD;
        appendUtf8(out, cp);
        break;
      }
      default: out += e; break;  // " \ /
    }
  }
  return out;
}

// ---- validation ----

class Validator {
 public:
  Validator(std::string_view t, int maxDepth) : t_(t), maxDepth_(maxDepth) {}

  bool run(JsonParseResult& r) {
    bool ok = document();
    r.ok = ok;
    if (!ok) {
      r.error = error_;
      r.offset = i_;
    }
    return ok;
  }

 private:
  std::string_view t_;
  int maxDepth_;
  uint32_t i_ = 0;
  const char* error_ = "";

  bool fail(const char* e) {
    error_ = e;
    return false;
  }
  bool atEnd() const { return i_ >= t_.size(); }
  char peek() const { return atEnd() ? '\0' : t_[i_]; }
  void ws() { i_ = skipSpace(t_, i_); }

  bool literal(const char* word) {
    for (const char* p = word; *p; ++p, ++i_) {
      if (peek() != *p) return fail("invalid literal");
    }
    return true;
  }

  bool number() {
    if (peek() == '-') ++i_;
    if (!isDigit(peek())) return fail("unexpected character");
    if (peek() == '0') {
      ++i_;
    } else {
      while (isDigit(peek())) ++i_;
    }
    if (peek() == '.') {
      ++i_;
      if (!isDigit(peek())) return fail("bad number");
      while (isDigit(peek())) ++i_;
    }
    if (peek() == 'e' || peek() == 'E') {
      ++i_;
      if (peek() == '+' || peek() == '-') ++i_;
      if (!isDigit(peek())) return fail("bad number");
      while (isDigit(peek())) ++i_;
    }
    return true;
  }

  bool string() {
    ++i_;  // opening quote
    while (true) {
      if (atEnd()) return fail("unterminated string");
      unsigned char c = static_cast<unsigned char>(t_[i_++]);
      if (c == '"') return true;
      if (c < 0x20) return fail("control character in string");
      if (c != '\\') continue;
      char e = peek();
      ++i_;
      if (e == 'u') {
        for (int k = 0; k < 4; ++k, ++i_) {
          char h = peek();
          if (!isDigit(h) && !((h | 0x20) >= 'a' && (h | 0x20) <= 'f')) return fail("bad \\u escape");
        }
      } else if (e != '"' && e != '\\' && e != '/' && e != 'b' && e != 'f' && e != 'n' && e != 'r' && e != 't') {
        return fail("bad escape");
      }
    }
  }

  bool scalar() {
    char c = peek();
    if (c == '"') return string();
    if (c == 't') return literal("true");
    if (c == 'f') return literal("false");
    if (c == 'n') return literal("null");
    return number();
  }

  // One value, with containers handled on an explicit stack.
  bool document() {
    std::vector<char> stack;  // '{' or '['
    ws();
    while (true) {
      // A value is expected here.
      char c = peek();
      if (c == '{' || c == '[') {
        if (static_cast<int>(stack.size()) >= maxDepth_) return fail("nested too deeply");
        stack.push_back(c);
        ++i_;
        ws();
        if (peek() == (c == '{' ? '}' : ']')) {
          ++i_;
          stack.pop_back();
        } else {
          if (c == '{' && !member()) return false;
          continue;
        }
      } else if (!scalar()) {
        return false;
      }
      // After a value: close containers or move to the next item.
      while (true) {
        ws();
        if (stack.empty()) return atEnd() ? true : fail("trailing characters");
        char close = stack.back() == '{' ? '}' : ']';
        if (peek() == ',') {
          ++i_;
          ws();
          if (stack.back() == '{' && !member()) return false;
          break;
        }
        if (peek() != close) return fail(close == '}' ? "expected ',' or '}'" : "expected ',' or ']'");
        ++i_;
        stack.pop_back();
      }
    }
  }

  // "key" : - leaves the position at the member's value.
  bool member() {
    if (peek() != '"') return fail("expected a key");
    if (!string()) return false;
    ws();
    if (peek() != ':') return fail("expected ':'");
    ++i_;
    ws();
    return true;
  }
};

}  // namespace

bool JsonText::validate(std::string_view text, int maxDepth, JsonParseResult& result) {
  if (text.size() >= JsonView::kNoKey) {
    result.ok = false;
    result.error = "document too large";
    return false;
  }
  return Validator(text, maxDepth).run(result);
}

uint32_t JsonText::rootOffset(std::string_view text) {
  return skipSpace(text, 0);
}

JsonType JsonText::type(const JsonView& v) {
  switch (v.doc_->text_[v.index_]) {
    case '{': return JsonType::Object;
    case '[': return JsonType::Array;
    case '"': return JsonType::String;
    case 't':
    case 'f': return JsonType::Bool;
    case 'n': return JsonType::Null;
    default: return JsonType::Number;
  }
}

double JsonText::number(const JsonView& v) {
  std::string_view t = v.doc_->text_;
  char buf[64];
  size_t n = 0;
  for (uint32_t i = v.index_; i < t.size() && n + 1 < sizeof buf; ++i) {
    char c = t[i];
    if (!isDigit(c) && c != '-' && c != '+' && c != '.' && c != 'e' && c != 'E') break;
    buf[n++] = c;
  }
  buf[n] = '\0';
  return std::strtod(buf, nullptr);
}

bool JsonText::boolean(const JsonView& v) {
  return v.doc_->text_[v.index_] == 't';
}

std::string_view JsonText::stringAt(const JsonDoc& doc, uint32_t offset) {
  std::string_view t = doc.text_;
  const uint32_t end = skipString(t, offset);
  std::string_view raw = t.substr(offset + 1, end - offset - 2);
  if (raw.find('\\') == std::string_view::npos) return raw;
  for (const auto& [at, s] : doc.decoded_) {
    if (at == offset) return s;
  }
  doc.decoded_.emplace_back(offset, decode(t, offset));
  return doc.decoded_.back().second;
}

JsonView JsonText::first(const JsonView& v) {
  std::string_view t = v.doc_->text_;
  const bool object = t[v.index_] == '{';
  uint32_t i = skipSpace(t, v.index_ + 1);
  if (t[i] == '}' || t[i] == ']') return {};
  if (!object) return JsonView(v.doc_, i);
  const uint32_t key = i;
  i = skipSpace(t, skipString(t, i));
  return JsonView(v.doc_, skipSpace(t, i + 1), key);  // past ':'
}

JsonView JsonText::next(const JsonView& v) {
  std::string_view t = v.doc_->text_;
  uint32_t i = skipSpace(t, skipValue(t, v.index_));
  if (i >= t.size() || t[i] != ',') return {};
  i = skipSpace(t, i + 1);
  if (v.key_ == JsonView::kNoKey) return JsonView(v.doc_, i);
  const uint32_t key = i;
  i = skipSpace(t, skipString(t, i));
  return JsonView(v.doc_, skipSpace(t, i + 1), key);
}

}  // namespace dither
