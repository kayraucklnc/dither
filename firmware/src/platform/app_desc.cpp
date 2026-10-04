// The app descriptor the Dither app reads at flash 0x10000 + 0x20 to tell
// that Dither is installed and which version (format.md §8). The one in the
// prebuilt Arduino libraries is a weak symbol; this definition replaces it.
#include <esp_app_desc.h>

#ifndef DITHER_VERSION
#error "DITHER_VERSION is set by scripts/version.py from the VERSION file"
#endif

#ifdef IDF_VER
#define DITHER_IDF_VER IDF_VER
#else
#define DITHER_IDF_VER "arduino-esp32"
#endif

extern "C" const __attribute__((used, section(".rodata_desc"))) esp_app_desc_t esp_app_desc = {
    .magic_word = ESP_APP_DESC_MAGIC_WORD,
    .secure_version = 0,
    .reserv1 = {0, 0},
    .version = DITHER_VERSION,
    .project_name = "dither",
    .time = __TIME__,
    .date = __DATE__,
    .idf_ver = DITHER_IDF_VER,
    .app_elf_sha256 = {0},
    // Must match the prebuilt bootloader's sdkconfig, or it refuses the image.
    .min_efuse_blk_rev_full = 0,
    .max_efuse_blk_rev_full = 199,
    .mmu_page_size = 16,  // log2(64 KB)
    .reserv3 = {0, 0, 0},
    .reserv2 = {0},
};
