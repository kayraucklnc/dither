// A web page as text (format.md "Web pages"), read byte by byte as it
// streams in, so a large page never has to be held in memory.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

#include "json.h"

namespace dither {

constexpr size_t kHtmlTextBytes = 1024;
constexpr size_t kHtmlTitleBytes = 256;

class HtmlText {
 public:
  void push(uint8_t c);
  // Reads `body` to its end, then finish().
  void read(CharSource& body);
  void finish();
  std::string text() const { return body_.text(); }
  std::string title() const { return title_.text(); }

 private:
  // Collapsed text, kept to `limit` bytes plus one so the cut can find a
  // character boundary.
  class Collector {
   public:
    explicit Collector(size_t limit) : limit_(limit) {}
    void character(uint8_t b);
    void whitespace() { space_ = true; }
    void lineBreak();
    std::string text() const;

   private:
    void put(uint8_t b);
    size_t limit_;
    std::string bytes_;
    bool space_ = false;
  };

  enum class State { Text, Open, Name, Attrs, EndName, EndRest, Bang, BangDash, Comment, Decl, Entity, Raw };

  Collector& out() { return inTitle_ ? title_ : body_; }
  void emit(uint8_t b) { out().character(b); }
  void emitAll(const std::string& s);
  void text(uint8_t c);
  void startTag();
  void endTag();
  void closeEntity();

  Collector body_{kHtmlTextBytes};
  Collector title_{kHtmlTitleBytes};
  bool inTitle_ = false;
  State state_ = State::Text;
  std::string name_;
  uint8_t quote_ = 0;
  bool afterEq_ = false;
  int dashes_ = 0;
  std::string entity_;
  std::string raw_;
  size_t rawMatch_ = 0;
};

}  // namespace dither
