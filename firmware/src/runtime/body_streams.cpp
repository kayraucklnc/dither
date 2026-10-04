#include "body_streams.h"

namespace dither {

// ---- ChunkedSource ----------------------------------------------------------

namespace {

constexpr size_t kMaxChunkLine = 128;

int hexValue(int c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

}  // namespace

bool ChunkedSource::expectCrlf() {
  if (inner_.get() == '\r' && inner_.get() == '\n') return true;
  error_ = "chunked body: missing CRLF";
  return false;
}

bool ChunkedSource::readSizeLine() {
  size_t size = 0, digits = 0, length = 0;
  bool extension = false;
  while (true) {
    int c = inner_.get();
    if (c < 0 || ++length > kMaxChunkLine) {
      error_ = "chunked body: bad size line";
      return false;
    }
    if (c == '\r') break;
    if (c == ';') extension = true;
    if (extension) continue;
    int v = hexValue(c);
    if (v < 0 || digits >= 8) {
      error_ = "chunked body: bad size";
      return false;
    }
    size = size * 16 + static_cast<size_t>(v);
    ++digits;
  }
  if (inner_.get() != '\n' || digits == 0) {
    error_ = "chunked body: bad size line";
    return false;
  }
  remaining_ = size;
  if (size == 0) {
    // Trailers, up to the empty line.
    size_t lineLength = 0;
    for (int c = inner_.get(); c >= 0; c = inner_.get()) {
      if (c == '\n') {
        if (lineLength == 0) break;
        lineLength = 0;
      } else if (c != '\r') {
        ++lineLength;
      }
    }
    done_ = true;
  }
  return true;
}

bool ChunkedSource::ready() {
  if (!error_.empty() || done_) return false;
  if (remaining_ > 0) return true;
  if (started_ && !expectCrlf()) return false;
  started_ = true;
  return readSizeLine() && !done_;
}

int ChunkedSource::peek() {
  return ready() ? inner_.peek() : -1;
}

int ChunkedSource::get() {
  if (!ready()) return -1;
  int c = inner_.get();
  if (c < 0) {
    error_ = "chunked body: truncated";
    return -1;
  }
  --remaining_;
  return c;
}

// ---- AesEcbSource -----------------------------------------------------------

bool AesEcbSource::readBlock(uint8_t block[16], bool& ended) {
  for (size_t i = 0; i < 16; ++i) {
    int c = inner_.get();
    if (c < 0) {
      ended = true;
      if (i != 0) error_ = "encrypted body is not a whole number of blocks";
      return false;
    }
    block[i] = static_cast<uint8_t>(c);
  }
  return true;
}

bool AesEcbSource::fill() {
  if (pos_ < len_) return true;
  if (ended_ || !error_.empty()) return false;
  uint8_t cipherBlock[16];
  bool ended = false;
  if (!haveHeld_) {
    if (!readBlock(cipherBlock, ended)) {
      ended_ = true;
      if (error_.empty()) error_ = "empty encrypted body";
      return false;
    }
    if (!cipher_.decrypt(cipherBlock, held_.data())) {
      error_ = "decryption failed";
      return false;
    }
    haveHeld_ = true;
  }
  if (readBlock(cipherBlock, ended)) {
    out_ = held_;
    if (!cipher_.decrypt(cipherBlock, held_.data())) {
      error_ = "decryption failed";
      return false;
    }
    pos_ = 0;
    len_ = 16;
    return true;
  }
  ended_ = true;
  if (!error_.empty()) return false;
  const uint8_t pad = held_[15];
  bool valid = pad >= 1 && pad <= 16;
  for (size_t i = 16 - (valid ? pad : 0); valid && i < 16; ++i) valid = held_[i] == pad;
  if (!valid) {
    error_ = "bad PKCS#7 padding (wrong key?)";
    return false;
  }
  out_ = held_;
  pos_ = 0;
  len_ = 16u - pad;
  return len_ > 0;
}

int AesEcbSource::peek() {
  return fill() ? out_[pos_] : -1;
}

int AesEcbSource::get() {
  return fill() ? out_[pos_++] : -1;
}

}  // namespace dither
