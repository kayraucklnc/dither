// AES-256 block decryption with mbedtls (hardware-accelerated on the C3).
#pragma once

#include <array>
#include <cstdint>

#include <mbedtls/aes.h>

#include "../runtime/body_streams.h"

namespace dither {

class MbedAesDecrypter : public BlockDecrypter {
 public:
  explicit MbedAesDecrypter(const std::array<uint8_t, 32>& key) {
    mbedtls_aes_init(&ctx_);
    ok_ = mbedtls_aes_setkey_dec(&ctx_, key.data(), 256) == 0;
  }
  ~MbedAesDecrypter() override { mbedtls_aes_free(&ctx_); }
  MbedAesDecrypter(const MbedAesDecrypter&) = delete;
  MbedAesDecrypter& operator=(const MbedAesDecrypter&) = delete;

  bool decrypt(const uint8_t in[16], uint8_t out[16]) override {
    return ok_ && mbedtls_aes_crypt_ecb(&ctx_, MBEDTLS_AES_DECRYPT, in, out) == 0;
  }

 private:
  mbedtls_aes_context ctx_;
  bool ok_ = false;
};

}  // namespace dither
