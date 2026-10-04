// The blob header (format.md §1).
#pragma once

#include <cstdint>

#include "bytes.h"

namespace dither {

constexpr uint32_t kBlobHeaderSize = 48;
constexpr uint16_t kBlobVersion = 1;

struct BlobHeader {
  uint32_t totalLength = 0;
  uint32_t crc = 0;
  uint32_t runtimeOffset = 0, runtimeLength = 0;
  uint32_t projectOffset = 0, projectLength = 0;
  uint32_t assetsOffset = 0, assetsLength = 0;
  uint32_t buildTime = 0;
};

enum class BlobError {
  None,
  TooShort,
  BadMagic,
  BadVersion,
  BadHeaderSize,
  BadLength,
  BadSection,
  BadCrc,
};

const char* blobErrorName(BlobError error);

// Parses the 48-byte header only: magic, version, header size, and that every
// section lies inside `totalLength`. `available` is how many bytes the
// partition holds, so a length that runs past it is rejected before anything
// tries to checksum it.
BlobError parseBlobHeader(const uint8_t* header, uint32_t available, BlobHeader& out);

// Header plus CRC over [48, total). `blob.size` may exceed the total length.
BlobError verifyBlob(ByteSpan blob, BlobHeader& out);

}  // namespace dither
