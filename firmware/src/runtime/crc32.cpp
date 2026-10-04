#include "crc32.h"

#include <array>

#ifdef ESP_PLATFORM
#include <esp_rom_crc.h>
#endif

namespace dither {
namespace {

constexpr std::array<uint32_t, 256> makeTable() {
  std::array<uint32_t, 256> table{};
  for (uint32_t i = 0; i < 256; ++i) {
    uint32_t c = i;
    for (int k = 0; k < 8; ++k) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
    table[i] = c;
  }
  return table;
}

constexpr std::array<uint32_t, 256> kTable = makeTable();

}  // namespace

uint32_t crc32(const uint8_t* data, size_t length, uint32_t crc) {
#ifdef ESP_PLATFORM
  // The ROM routine is the zlib CRC; checked once against the standard
  // check value rather than trusted blindly.
  static const bool kRomMatches =
      esp_rom_crc32_le(0, reinterpret_cast<const uint8_t*>("123456789"), 9) == 0xCBF43926u;
  if (kRomMatches) return esp_rom_crc32_le(crc, data, static_cast<uint32_t>(length));
#endif
  crc = ~crc;
  for (size_t i = 0; i < length; ++i) crc = kTable[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
  return ~crc;
}

}  // namespace dither
