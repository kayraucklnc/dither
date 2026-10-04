// P4 (binary) PBM: the same bit layout as the framebuffer.
#pragma once

#include <fstream>
#include <optional>
#include <string>

#include "../src/runtime/framebuffer.h"

namespace testutil {

inline std::optional<dither::Framebuffer> readPbm(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return std::nullopt;
  std::string magic;
  in >> magic;
  if (magic != "P4") return std::nullopt;
  int dims[2] = {0, 0};
  for (int& d : dims) {
    while (true) {
      in >> std::ws;
      if (in.peek() != '#') break;
      std::string comment;
      std::getline(in, comment);
    }
    if (!(in >> d) || d <= 0) return std::nullopt;
  }
  in.get();  // the single whitespace before the raster
  dither::Framebuffer fb(dims[0], dims[1]);
  in.read(reinterpret_cast<char*>(fb.bytes().data()), static_cast<std::streamsize>(fb.bytes().size()));
  if (in.gcount() != static_cast<std::streamsize>(fb.bytes().size())) return std::nullopt;
  return fb;
}

inline bool writePbm(const std::string& path, const dither::Framebuffer& fb) {
  std::ofstream out(path, std::ios::binary);
  out << "P4\n" << fb.width() << " " << fb.height() << "\n";
  out.write(reinterpret_cast<const char*>(fb.bytes().data()), static_cast<std::streamsize>(fb.bytes().size()));
  return static_cast<bool>(out);
}

}  // namespace testutil
