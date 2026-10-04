// Byte-stream stages between an HTTP body and the JSON reader: chunked
// transfer decoding and AES-256-ECB decryption with PKCS#7 padding. Both
// work block by block, so a large body never has to be held in memory.
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

#include "json.h"

namespace dither {

// Undoes `Transfer-Encoding: chunked`.
class ChunkedSource : public CharSource {
 public:
  explicit ChunkedSource(CharSource& inner) : inner_(inner) {}
  int peek() override;
  int get() override;
  const std::string& error() const { return error_; }

 private:
  bool ready();  // true when a data byte is available
  bool readSizeLine();
  bool expectCrlf();
  CharSource& inner_;
  size_t remaining_ = 0;  // bytes left in the current chunk
  bool started_ = false, done_ = false;
  std::string error_;
};

// One AES block in, one out; implemented with mbedtls on the panel.
class BlockDecrypter {
 public:
  virtual ~BlockDecrypter() = default;
  virtual bool decrypt(const uint8_t in[16], uint8_t out[16]) = 0;
};

// Decrypts ECB blocks as they arrive. The last block is held back until the
// input ends, then its PKCS#7 padding is checked and removed.
class AesEcbSource : public CharSource {
 public:
  AesEcbSource(CharSource& inner, BlockDecrypter& cipher) : inner_(inner), cipher_(cipher) {}
  int peek() override;
  int get() override;
  const std::string& error() const { return error_; }

 private:
  bool fill();
  bool readBlock(uint8_t block[16], bool& ended);
  CharSource& inner_;
  BlockDecrypter& cipher_;
  std::array<uint8_t, 16> out_{};
  size_t pos_ = 0, len_ = 0;
  std::array<uint8_t, 16> held_{};
  bool haveHeld_ = false, ended_ = false;
  std::string error_;
};

}  // namespace dither
