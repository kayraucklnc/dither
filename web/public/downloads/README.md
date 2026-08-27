Merged ESP32 images go here, and the "Add a panel" page lists whatever it finds.

Merged means bootloader + partition table + application in one file, because
the flasher writes at offset 0x0. A bare firmware.bin written there produces a
board that does not boot.

  esptool.py --chip esp32s3 merge_bin -o merged.bin \
    0x0 bootloader.bin 0x8000 partitions.bin 0x10000 firmware.bin
