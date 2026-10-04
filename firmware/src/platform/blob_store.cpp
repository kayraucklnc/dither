#include "blob_store.h"

#include <algorithm>
#include <iterator>

#include "../runtime/blob.h"

namespace dither {

MappedBlob::~MappedBlob() {
  if (mapped_) esp_partition_munmap(handle_);
}

MappedBlob::Status MappedBlob::open(std::string& error) {
  const esp_partition_t* part =
      esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "dither");
  if (part == nullptr) {
    error = "no 'dither' partition";
    return Status::Unreadable;
  }
  uint8_t header[kBlobHeaderSize];
  esp_err_t err = esp_partition_read(part, 0, header, sizeof header);
  if (err != ESP_OK) {
    error = std::string("partition read failed: ") + esp_err_to_name(err);
    return Status::Unreadable;
  }
  if (std::all_of(std::begin(header), std::end(header), [](uint8_t b) { return b == 0xFF; })) {
    error = "nothing flashed yet";
    return Status::NoBlob;
  }
  BlobHeader h;
  BlobError be = parseBlobHeader(header, part->size, h);
  if (be != BlobError::None) {
    error = std::string("blob: ") + blobErrorName(be);
    return Status::NoBlob;
  }
  const void* ptr = nullptr;
  err = esp_partition_mmap(part, 0, h.totalLength, ESP_PARTITION_MMAP_DATA, &ptr, &handle_);
  if (err != ESP_OK) {
    error = std::string("mmap failed: ") + esp_err_to_name(err);
    return Status::Unreadable;
  }
  mapped_ = true;
  span_ = {static_cast<const uint8_t*>(ptr), h.totalLength};
  return Status::Ok;
}

}  // namespace dither
