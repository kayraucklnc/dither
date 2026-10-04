#include "blob.h"

#include <cstring>

#include "crc32.h"

namespace dither {
namespace {

bool sectionFits(uint32_t offset, uint32_t length, uint32_t total) {
  if (length == 0) return true;
  if (offset < kBlobHeaderSize || offset % 4 != 0) return false;
  return offset <= total && length <= total - offset;
}

}  // namespace

const char* blobErrorName(BlobError error) {
  switch (error) {
    case BlobError::None: return "ok";
    case BlobError::TooShort: return "too short";
    case BlobError::BadMagic: return "bad magic";
    case BlobError::BadVersion: return "unsupported version";
    case BlobError::BadHeaderSize: return "bad header size";
    case BlobError::BadLength: return "bad total length";
    case BlobError::BadSection: return "section out of bounds";
    case BlobError::BadCrc: return "CRC mismatch";
  }
  return "unknown";
}

BlobError parseBlobHeader(const uint8_t* h, uint32_t available, BlobHeader& out) {
  if (available < kBlobHeaderSize) return BlobError::TooShort;
  if (std::memcmp(h, "DTHR", 4) != 0) return BlobError::BadMagic;
  if (readU16(h + 4) != kBlobVersion) return BlobError::BadVersion;
  if (readU16(h + 6) != kBlobHeaderSize) return BlobError::BadHeaderSize;

  BlobHeader hd;
  hd.totalLength = readU32(h + 8);
  hd.crc = readU32(h + 12);
  hd.runtimeOffset = readU32(h + 16);
  hd.runtimeLength = readU32(h + 20);
  hd.projectOffset = readU32(h + 24);
  hd.projectLength = readU32(h + 28);
  hd.assetsOffset = readU32(h + 32);
  hd.assetsLength = readU32(h + 36);
  hd.buildTime = readU32(h + 40);

  if (hd.totalLength < kBlobHeaderSize || hd.totalLength > available) return BlobError::BadLength;
  if (hd.runtimeLength == 0 || !sectionFits(hd.runtimeOffset, hd.runtimeLength, hd.totalLength) ||
      !sectionFits(hd.projectOffset, hd.projectLength, hd.totalLength) ||
      !sectionFits(hd.assetsOffset, hd.assetsLength, hd.totalLength)) {
    return BlobError::BadSection;
  }
  out = hd;
  return BlobError::None;
}

BlobError verifyBlob(ByteSpan blob, BlobHeader& out) {
  if (blob.data == nullptr) return BlobError::TooShort;
  BlobHeader hd;
  BlobError err = parseBlobHeader(blob.data, static_cast<uint32_t>(blob.size), hd);
  if (err != BlobError::None) return err;
  uint32_t crc = crc32(blob.data + kBlobHeaderSize, hd.totalLength - kBlobHeaderSize);
  if (crc != hd.crc) return BlobError::BadCrc;
  out = hd;
  return BlobError::None;
}

}  // namespace dither
