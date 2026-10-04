#include "json.h"

#include <cmath>
#include <cstdlib>
#include <string>

namespace dither {

// ---- JsonView ---------------------------------------------------------------

JsonType JsonView::type() const {
  return doc_ ? doc_->nodes_[index_].type : JsonType::Null;
}

double JsonView::number(double fallback) const {
  return isNumber() ? doc_->nodes_[index_].number : fallback;
}

bool JsonView::boolean(bool fallback) const {
  return isBool() ? doc_->nodes_[index_].boolean : fallback;
}

int JsonView::integer(int fallback) const {
  if (!isNumber()) return fallback;
  double v = doc_->nodes_[index_].number;
  if (!std::isfinite(v) || v > 2147483647.0 || v < -2147483648.0) return fallback;
  return static_cast<int>(v);
}

std::string_view JsonView::string() const {
  if (!isString()) return {};
  const auto& n = doc_->nodes_[index_];
  return std::string_view(doc_->strings_).substr(n.str.offset, n.str.length);
}

size_t JsonView::size() const {
  if (!isArray() && !isObject()) return 0;
  return doc_->nodes_[index_].kids.count;
}

JsonView JsonView::first() const {
  if (!isArray() && !isObject()) return {};
  uint32_t f = doc_->nodes_[index_].kids.first;
  return f == JsonDoc::kNone ? JsonView() : JsonView(doc_, f);
}

JsonView JsonView::next() const {
  if (!doc_) return {};
  uint32_t n = doc_->nodes_[index_].next;
  return n == JsonDoc::kNone ? JsonView() : JsonView(doc_, n);
}

std::string_view JsonView::key() const {
  if (!doc_) return {};
  const auto& n = doc_->nodes_[index_];
  return std::string_view(doc_->strings_).substr(n.keyOffset, n.keyLength);
}

JsonView JsonView::path(std::string_view dotted) const {
  JsonView node = *this;
  while (node.exists()) {
    const size_t dot = dotted.find('.');
    const std::string_view seg = dotted.substr(0, dot);
    if (node.isArray()) {
      if (seg.empty() || seg.size() > 9) return {};
      size_t index = 0;
      for (char c : seg) {
        if (c < '0' || c > '9') return {};
        index = index * 10 + static_cast<size_t>(c - '0');
      }
      node = node[index];
    } else {
      node = node[seg];
    }
    if (dot == std::string_view::npos) break;
    dotted.remove_prefix(dot + 1);
  }
  return node;
}

JsonView JsonView::operator[](size_t index) const {
  if (!isArray()) return {};
  JsonView c = first();
  for (size_t i = 0; i < index && c.exists(); ++i) c = c.next();
  return c;
}

JsonView JsonView::operator[](std::string_view k) const {
  if (!isObject()) return {};
  JsonView found;
  for (JsonView c = first(); c.exists(); c = c.next()) {
    if (c.key() == k) found = c;  // JSON.parse keeps the last duplicate
  }
  return found;
}


}  // namespace dither
