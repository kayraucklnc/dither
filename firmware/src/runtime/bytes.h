// A read-only view of bytes plus little-endian readers. The blob lives in
// memory-mapped flash on the device, so nothing here ever copies.
#pragma once

#include <cstddef>
#include <cstdint>

namespace dither {

struct ByteSpan {
  const uint8_t* data = nullptr;
  size_t size = 0;

  bool contains(size_t offset, size_t length) const {
    return offset <= size && length <= size - offset;
  }
  ByteSpan sub(size_t offset, size_t length) const {
    if (!contains(offset, length)) return {};
    return {data + offset, length};
  }
};

inline uint16_t readU16(const uint8_t* p) {
  return static_cast<uint16_t>(p[0] | (p[1] << 8));
}

inline int16_t readI16(const uint8_t* p) {
  return static_cast<int16_t>(readU16(p));
}

inline uint32_t readU32(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}

}  // namespace dither
