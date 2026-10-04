#pragma once

#include <cstddef>
#include <cstdint>

namespace dither {

// CRC-32 (IEEE 802.3, the zlib one). Pass the previous result as `crc` to
// continue a running checksum; start with 0.
uint32_t crc32(const uint8_t* data, size_t length, uint32_t crc = 0);

}  // namespace dither
