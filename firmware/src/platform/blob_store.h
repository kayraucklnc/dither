// The `dither` data partition, memory-mapped so assets are read in place.
#pragma once

#include <string>

#include <esp_partition.h>

#include "../runtime/bytes.h"

namespace dither {

class MappedBlob {
 public:
  MappedBlob() = default;
  ~MappedBlob();
  MappedBlob(const MappedBlob&) = delete;
  MappedBlob& operator=(const MappedBlob&) = delete;

  enum class Status { Ok, NoBlob, Unreadable };
  // Finds the partition, reads the 48-byte header and maps the blob's total
  // length. NoBlob: nothing plausible is flashed. Unreadable: the partition
  // could not be found, read or mapped, which may pass. The CRC is checked
  // later by Program::load.
  Status open(std::string& error);
  ByteSpan span() const { return span_; }

 private:
  esp_partition_mmap_handle_t handle_ = 0;
  bool mapped_ = false;
  ByteSpan span_;
};

}  // namespace dither
