// Chunked bodies and AES-256-ECB bodies. The AES vectors come from FIPS-197 /
// SP 800-38A (F.1.5) and from `openssl enc -aes-256-ecb` with key
// sha256("dither-test").
#include <string>
#include <vector>

#include "../src/runtime/body_streams.h"
#include "../src/runtime/source.h"
#include "aes_ref.h"
#include "check.h"

using namespace dither;

namespace {

std::vector<uint8_t> hex(std::string_view h) {
  std::vector<uint8_t> out;
  for (size_t i = 0; i + 1 < h.size(); i += 2) out.push_back(static_cast<uint8_t>(std::stoi(std::string(h.substr(i, 2)), nullptr, 16)));
  return out;
}

std::array<uint8_t, 32> key32(std::string_view h) {
  std::array<uint8_t, 32> k{};
  auto bytes = hex(h);
  for (size_t i = 0; i < 32; ++i) k[i] = bytes[i];
  return k;
}

std::string drain(CharSource& s) {
  std::string out;
  for (int c = s.get(); c >= 0; c = s.get()) out += static_cast<char>(c);
  return out;
}

const char* kTestKey = "4df1238da4dafc34db7e30619fad5ab0dc123715c1eccfd1ea62193ea5938db7";

std::string decryptHex(std::string_view cipherHex, std::string& error) {
  auto bytes = hex(cipherHex);
  MemorySource in(reinterpret_cast<const char*>(bytes.data()), bytes.size());
  testutil::Aes256Ref aes(key32(kTestKey));
  AesEcbSource src(in, aes);
  std::string out = drain(src);
  error = src.error();
  return out;
}

}  // namespace

TEST(aes_reference_matches_fips_vector) {
  testutil::Aes256Ref aes(key32("603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4"));
  auto c = hex("f3eed1bdb5d2a03c064b5a7e3db181f8");
  uint8_t out[16];
  aes.decrypt(c.data(), out);
  CHECK(std::vector<uint8_t>(out, out + 16) == hex("6bc1bee22e409f96e93d7e117393172a"));
}

TEST(aes_ecb_stream_strips_padding) {
  std::string error;
  CHECK_EQ(decryptHex("a6e6f5574408b40f5da6e07a3e4d1b36", error), std::string(R"({"a":1})"));
  CHECK(error.empty());
  CHECK_EQ(decryptHex("cdd90625101ab08874472a380f15c2965642e46932687e6b24c35cde30cbec602322031b5b7b1cecbc4630e4b29d511c",
                      error),
           std::string(R"({"dep_time":"08:15:00","n":[1,2]})"));
  CHECK(error.empty());
  // 16 bytes of plaintext: a whole block of padding follows.
  CHECK_EQ(decryptHex("26be6556acffde0405231f0bd1a82ecf98c9b425b41cba952a5cb6a626519990", error),
           std::string("0123456789abcdef"));
  CHECK(error.empty());
}

TEST(aes_ecb_stream_errors) {
  std::string error;
  decryptHex("a6e6f5574408b40f5da6e07a3e4d1b", error);  // 15 bytes
  CHECK(!error.empty());
  decryptHex("", error);
  CHECK(!error.empty());
  // Wrong key: the padding check catches it (almost always).
  auto bytes = hex("a6e6f5574408b40f5da6e07a3e4d1b36");
  MemorySource in(reinterpret_cast<const char*>(bytes.data()), bytes.size());
  testutil::Aes256Ref wrong(key32("603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4"));
  AesEcbSource src(in, wrong);
  drain(src);
  CHECK(!src.error().empty());
}

TEST(aes_ecb_feeds_the_json_filter) {
  auto bytes = hex("cdd90625101ab08874472a380f15c2965642e46932687e6b24c35cde30cbec602322031b5b7b1cecbc4630e4b29d511c");
  MemorySource in(reinterpret_cast<const char*>(bytes.data()), bytes.size());
  testutil::Aes256Ref aes(key32(kTestKey));
  AesEcbSource src(in, aes);
  JsonFilter f;
  f.addPath("dep_time");
  JsonDoc doc;
  CHECK(doc.parse(src, &f, JsonLimits::response()).ok);
  CHECK(extractPath(doc.root(), "dep_time", -1) == Value::string("08:15:00"));
  CHECK(!doc.root()["n"].exists());
}

TEST(chunked_bodies) {
  {
    MemorySource in("4\r\n{\"a\"\r\n3;ext=1\r\n:12\r\n1\r\n}\r\n0\r\nX-Trailer: y\r\n\r\n");
    ChunkedSource src(in);
    CHECK_EQ(drain(src), std::string(R"({"a":12})"));
    CHECK(src.error().empty());
  }
  {
    MemorySource in("A\r\n0123456789\r\n0\r\n\r\n");
    ChunkedSource src(in);
    CHECK_EQ(drain(src), std::string("0123456789"));
  }
  {
    MemorySource in("5\r\nabc");  // truncated
    ChunkedSource src(in);
    drain(src);
    CHECK(!src.error().empty());
  }
  {
    MemorySource in("zz\r\nabc\r\n");
    ChunkedSource src(in);
    CHECK_EQ(drain(src), std::string());
    CHECK(!src.error().empty());
  }
  {
    MemorySource in("3\r\nabcX\r\n0\r\n\r\n");  // chunk longer than declared
    ChunkedSource src(in);
    drain(src);
    CHECK(!src.error().empty());
  }
}
