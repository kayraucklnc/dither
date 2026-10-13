#include "html.h"

namespace dither {
namespace {

constexpr size_t kMaxName = 16;
constexpr size_t kMaxEntity = 10;

const char* const kRaw[] = {"script", "style", "noscript", "template", "svg"};
const char* const kBlock[] = {"address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt",
                              "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
                              "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "tr",
                              "ul"};

template <size_t N>
bool oneOf(const std::string& name, const char* const (&set)[N]) {
  for (const char* s : set) {
    if (name == s) return true;
  }
  return false;
}

bool isCell(const std::string& name) {
  return name == "td" || name == "th";
}
bool isSpace(uint8_t c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f';
}
bool isAlpha(uint8_t c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}
bool isDigit(uint8_t c) {
  return c >= '0' && c <= '9';
}
bool isNameChar(uint8_t c) {
  return isAlpha(c) || isDigit(c) || c == '-' || c == ':';
}
uint8_t lower(uint8_t c) {
  return c >= 'A' && c <= 'Z' ? static_cast<uint8_t>(c + 0x20) : c;
}
bool isHex(char c) {
  return isDigit(static_cast<uint8_t>(c)) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

std::string utf8(uint32_t cp) {
  std::string s;
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
  return s;
}

// A numeric reference's codepoint, or 0 when it is not one we decode.
uint32_t numericEntity(const std::string& name) {
  if (name.size() < 2 || name[0] != '#') return 0;
  const bool hex = name[1] == 'x' || name[1] == 'X';
  const size_t start = hex ? 2 : 1;
  if (start >= name.size()) return 0;
  uint64_t cp = 0;
  for (size_t i = start; i < name.size(); ++i) {
    const char c = name[i];
    if (hex ? !isHex(c) : !isDigit(static_cast<uint8_t>(c))) return 0;
    const uint64_t digit = isDigit(static_cast<uint8_t>(c)) ? static_cast<uint64_t>(c - '0')
                                                            : static_cast<uint64_t>((c | 0x20) - 'a' + 10);
    cp = cp * (hex ? 16 : 10) + digit;
    if (cp > 0x10FFFF) return 0;
  }
  if (cp == 0 || (cp >= 0xD800 && cp <= 0xDFFF)) return 0;
  return static_cast<uint32_t>(cp);
}

}  // namespace

void HtmlText::Collector::put(uint8_t b) {
  if (bytes_.size() <= limit_) bytes_ += static_cast<char>(b);
}

void HtmlText::Collector::character(uint8_t b) {
  if (space_ && !bytes_.empty() && bytes_.back() != '\n') put(' ');
  space_ = false;
  put(b);
}

void HtmlText::Collector::lineBreak() {
  space_ = false;
  if (!bytes_.empty() && bytes_.back() != '\n') put('\n');
}

std::string HtmlText::Collector::text() const {
  size_t end = bytes_.size();
  if (end > limit_) {
    end = limit_;
    while (end > 0 && (static_cast<uint8_t>(bytes_[end]) & 0xC0) == 0x80) --end;
  }
  while (end > 0 && bytes_[end - 1] == '\n') --end;
  return bytes_.substr(0, end);
}

void HtmlText::emitAll(const std::string& s) {
  for (char c : s) emit(static_cast<uint8_t>(c));
}

void HtmlText::text(uint8_t c) {
  if (c == '<') {
    state_ = State::Open;
  } else if (c == '&') {
    entity_.clear();
    state_ = State::Entity;
  } else if (isSpace(c)) {
    out().whitespace();
  } else {
    emit(c);
  }
}

void HtmlText::startTag() {
  if (oneOf(name_, kRaw)) {
    raw_ = "</" + name_;
    rawMatch_ = 0;
    state_ = State::Raw;
    return;
  }
  state_ = State::Text;
  if (name_ == "title") {
    inTitle_ = true;
  } else if (isCell(name_)) {
    out().whitespace();
  } else if (oneOf(name_, kBlock)) {
    out().lineBreak();
    if (name_ == "li") {
      emit('-');
      out().whitespace();
    }
  }
}

void HtmlText::endTag() {
  state_ = State::Text;
  if (name_ == "title") {
    inTitle_ = false;
  } else if (isCell(name_)) {
    out().whitespace();
  } else if (oneOf(name_, kBlock)) {
    out().lineBreak();
  }
}

void HtmlText::closeEntity() {
  state_ = State::Text;
  static const struct {
    const char* name;
    char c;
  } kNamed[] = {{"amp", '&'}, {"lt", '<'}, {"gt", '>'}, {"quot", '"'}, {"apos", '\''}};
  if (entity_ == "nbsp") {
    out().whitespace();
    return;
  }
  for (const auto& n : kNamed) {
    if (entity_ == n.name) {
      emit(static_cast<uint8_t>(n.c));
      return;
    }
  }
  if (uint32_t cp = numericEntity(entity_)) {
    emitAll(utf8(cp));
  } else {
    emitAll("&" + entity_ + ";");
  }
}

void HtmlText::push(uint8_t c) {
  switch (state_) {
    case State::Text: text(c); break;
    case State::Open:
      if (c == '!') {
        state_ = State::Bang;
      } else if (c == '?') {
        state_ = State::Decl;
      } else if (c == '/') {
        name_.clear();
        state_ = State::EndName;
      } else if (isAlpha(c)) {
        name_.assign(1, static_cast<char>(lower(c)));
        state_ = State::Name;
      } else {
        state_ = State::Text;
        emit('<');
        text(c);
      }
      break;
    case State::Name:
      if (isNameChar(c)) {
        if (name_.size() < kMaxName) name_ += static_cast<char>(lower(c));
      } else if (c == '>') {
        startTag();
      } else {
        quote_ = 0;
        afterEq_ = false;
        state_ = State::Attrs;
      }
      break;
    case State::Attrs:
      if (quote_) {
        if (c == quote_) quote_ = 0;
      } else if (c == '>') {
        startTag();
      } else if ((c == '"' || c == '\'') && afterEq_) {
        quote_ = c;
      } else if (!isSpace(c)) {
        afterEq_ = c == '=';
      }
      break;
    case State::EndName:
      if (isNameChar(c)) {
        if (name_.size() < kMaxName) name_ += static_cast<char>(lower(c));
      } else if (c == '>') {
        endTag();
      } else {
        state_ = State::EndRest;
      }
      break;
    case State::EndRest:
      if (c == '>') endTag();
      break;
    case State::Bang: state_ = c == '-' ? State::BangDash : c == '>' ? State::Text : State::Decl; break;
    case State::BangDash:
      if (c == '-') {
        dashes_ = 0;
        state_ = State::Comment;
      } else {
        state_ = c == '>' ? State::Text : State::Decl;
      }
      break;
    case State::Comment:
      if (c == '-') {
        ++dashes_;
      } else if (c == '>' && dashes_ >= 2) {
        state_ = State::Text;
      } else {
        dashes_ = 0;
      }
      break;
    case State::Decl:
      if (c == '>') state_ = State::Text;
      break;
    case State::Entity:
      if (c == ';') {
        closeEntity();
      } else if ((isAlpha(c) || isDigit(c) || c == '#') && entity_.size() < kMaxEntity) {
        entity_ += static_cast<char>(c);
      } else {
        state_ = State::Text;
        emitAll("&" + entity_);
        text(c);
      }
      break;
    case State::Raw:
      if (lower(c) == static_cast<uint8_t>(raw_[rawMatch_])) {
        if (++rawMatch_ == raw_.size()) {
          name_ = raw_.substr(2);
          state_ = State::EndRest;
        }
      } else {
        rawMatch_ = c == '<' ? 1 : 0;
      }
      break;
  }
}

void HtmlText::finish() {
  if (state_ == State::Entity) {
    emitAll("&" + entity_);
  } else if (state_ == State::Open) {
    emit('<');
  }
  state_ = State::Text;
}

void HtmlText::read(CharSource& body) {
  for (int c = body.get(); c >= 0; c = body.get()) push(static_cast<uint8_t>(c));
  finish();
}

}  // namespace dither
