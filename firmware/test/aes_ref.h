// A plain reference AES-256 block decryption (FIPS-197), for host tests only;
// the panel uses mbedtls. Checked against the FIPS/NIST vector in the tests.
#pragma once

#include <array>
#include <cstdint>

#include "../src/runtime/body_streams.h"

namespace testutil {

class Aes256Ref : public dither::BlockDecrypter {
 public:
  explicit Aes256Ref(const std::array<uint8_t, 32>& key) {
    buildTables();
    expandKey(key);
  }

  bool decrypt(const uint8_t in[16], uint8_t out[16]) override {
    uint8_t s[16];
    for (int i = 0; i < 16; ++i) s[i] = in[i];
    addRoundKey(s, 14);
    for (int round = 13; round >= 1; --round) {
      invShiftRows(s);
      invSubBytes(s);
      addRoundKey(s, round);
      invMixColumns(s);
    }
    invShiftRows(s);
    invSubBytes(s);
    addRoundKey(s, 0);
    for (int i = 0; i < 16; ++i) out[i] = s[i];
    return true;
  }

 private:
  uint8_t sbox_[256]{}, inv_[256]{};
  uint8_t roundKeys_[240]{};

  static uint8_t mul(uint8_t a, uint8_t b) {
    uint8_t p = 0;
    for (int i = 0; i < 8; ++i) {
      if (b & 1) p ^= a;
      bool hi = a & 0x80;
      a = static_cast<uint8_t>(a << 1);
      if (hi) a ^= 0x1B;
      b >>= 1;
    }
    return p;
  }

  void buildTables() {
    for (int x = 0; x < 256; ++x) {
      uint8_t inv = 0;
      for (int y = 1; y < 256 && x != 0; ++y) {
        if (mul(static_cast<uint8_t>(x), static_cast<uint8_t>(y)) == 1) inv = static_cast<uint8_t>(y);
      }
      uint8_t s = inv;
      for (int i = 1; i <= 4; ++i) s ^= static_cast<uint8_t>((inv << i) | (inv >> (8 - i)));
      s ^= 0x63;
      sbox_[x] = s;
      inv_[s] = static_cast<uint8_t>(x);
    }
  }

  void expandKey(const std::array<uint8_t, 32>& key) {
    for (int i = 0; i < 32; ++i) roundKeys_[i] = key[static_cast<size_t>(i)];
    uint8_t rcon = 1;
    for (int i = 8; i < 60; ++i) {
      uint8_t t[4];
      for (int j = 0; j < 4; ++j) t[j] = roundKeys_[(i - 1) * 4 + j];
      if (i % 8 == 0) {
        uint8_t first = t[0];
        t[0] = static_cast<uint8_t>(sbox_[t[1]] ^ rcon);
        t[1] = sbox_[t[2]];
        t[2] = sbox_[t[3]];
        t[3] = sbox_[first];
        rcon = mul(rcon, 2);
      } else if (i % 8 == 4) {
        for (auto& b : t) b = sbox_[b];
      }
      for (int j = 0; j < 4; ++j) roundKeys_[i * 4 + j] = roundKeys_[(i - 8) * 4 + j] ^ t[j];
    }
  }

  void addRoundKey(uint8_t* s, int round) const {
    for (int i = 0; i < 16; ++i) s[i] ^= roundKeys_[round * 16 + i];
  }

  void invSubBytes(uint8_t* s) const {
    for (int i = 0; i < 16; ++i) s[i] = inv_[s[i]];
  }

  static void invShiftRows(uint8_t* s) {
    uint8_t t[16];
    for (int c = 0; c < 4; ++c) {
      for (int r = 0; r < 4; ++r) t[((c + r) % 4) * 4 + r] = s[c * 4 + r];
    }
    for (int i = 0; i < 16; ++i) s[i] = t[i];
  }

  static void invMixColumns(uint8_t* s) {
    for (int c = 0; c < 4; ++c) {
      uint8_t* col = s + c * 4;
      uint8_t a0 = col[0], a1 = col[1], a2 = col[2], a3 = col[3];
      col[0] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
      col[1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
      col[2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
      col[3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
    }
  }
};

}  // namespace testutil
