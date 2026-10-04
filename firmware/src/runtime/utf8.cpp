#include "utf8.h"

namespace dither {

std::u32string decodeUtf8(std::string_view s) {
  std::u32string out;
  out.reserve(s.size());
  size_t i = 0;
  while (i < s.size()) {
    unsigned char c = static_cast<unsigned char>(s[i]);
    int extra = c < 0x80 ? 0 : (c & 0xE0) == 0xC0 ? 1 : (c & 0xF0) == 0xE0 ? 2 : (c & 0xF8) == 0xF0 ? 3 : -1;
    if (extra < 0 || s.size() - i <= static_cast<size_t>(extra)) {
      out += U'�';
      ++i;
      continue;
    }
    char32_t cp = extra == 0 ? c : extra == 1 ? (c & 0x1F) : extra == 2 ? (c & 0x0F) : (c & 0x07);
    bool ok = true;
    for (int k = 1; k <= extra; ++k) {
      unsigned char cc = static_cast<unsigned char>(s[i + static_cast<size_t>(k)]);
      if ((cc & 0xC0) != 0x80) {
        ok = false;
        break;
      }
      cp = (cp << 6) | (cc & 0x3F);
    }
    static const char32_t kMin[] = {0, 0x80, 0x800, 0x10000};
    if (!ok || cp < kMin[extra] || cp > 0x10FFFF || (cp >= 0xD800 && cp < 0xE000)) {
      out += U'�';
      ++i;
      continue;
    }
    out += cp;
    i += static_cast<size_t>(extra) + 1;
  }
  return out;
}

std::string encodeUtf8(std::u32string_view s) {
  std::string out;
  for (char32_t cp : s) {
    if (cp < 0x80) {
      out += static_cast<char>(cp);
    } else if (cp < 0x800) {
      out += static_cast<char>(0xC0 | (cp >> 6));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      out += static_cast<char>(0xE0 | (cp >> 12));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else {
      out += static_cast<char>(0xF0 | (cp >> 18));
      out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    }
  }
  return out;
}

std::string upperText(std::string_view s, bool turkish) {
  std::u32string cps = decodeUtf8(s);
  for (char32_t& c : cps) {
    if (c == U'i' && turkish) {
      c = U'İ';
    } else if (c >= U'a' && c <= U'z') {
      c -= 0x20;
    } else if (c >= 0xE0 && c <= 0xFE && c != 0xF7) {
      c -= 0x20;
    } else if (c == U'ğ' || c == U'ş') {  // ğ, ş
      c -= 1;
    } else if (c == U'ı') {  // ı
      c = U'I';
    }
  }
  return encodeUtf8(cps);
}

}  // namespace dither
