#!/usr/bin/env python3
"""Merge bootloader + partition table + app into one image written at 0x0,
check that it really is such an image, and publish it for the web flasher.

    package.py --env xiao-epaper-75 --version 0.1.0 --out ../app/public/firmware

Writes build/<env>.bin, copies it to <out>/<env>.bin and updates
<out>/manifest.json. A bare app image also starts with 0xE9, so the check is
the partition table at 0x8000 (magic AA 50) and a bootloader at 0x0.
"""
import argparse
import hashlib
import json
import os
import shutil
import struct
import sys
from typing import Dict, List, Tuple

BOOTLOADER_OFFSET = 0x0      # ESP32-C3
PARTITIONS_OFFSET = 0x8000
APP_OFFSET = 0x10000
APP_DESC_OFFSET = APP_OFFSET + 0x20
DATA_PARTITION = {"offset": 0x300000, "size": 0x100000}
CHIP = "ESP32-C3"


def read(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def place(image: bytearray, offset: int, data: bytes) -> None:
    if len(image) < offset:
        image.extend(b"\xff" * (offset - len(image)))
    if len(image) > offset:
        raise SystemExit(f"overlap: data at 0x{offset:x} but image already reaches 0x{len(image):x}")
    image.extend(data)


def partitions(table: bytes) -> List[Tuple[str, int, int, int, int]]:
    out = []
    for i in range(0, len(table), 32):
        entry = table[i:i + 32]
        if entry[:2] != b"\xaa\x50":
            break
        ptype, subtype, offset, size = struct.unpack_from("<BBII", entry, 2)
        name = entry[12:28].split(b"\0")[0].decode()
        out.append((name, ptype, subtype, offset, size))
    return out


def verify(image: bytes, version: str) -> None:
    def fail(msg: str) -> None:
        raise SystemExit(f"not a valid merged image: {msg}")

    if image[BOOTLOADER_OFFSET] != 0xE9:
        fail("no bootloader (0xE9) at 0x0")
    if image[PARTITIONS_OFFSET:PARTITIONS_OFFSET + 2] != b"\xaa\x50":
        fail("no partition table (AA 50) at 0x8000")
    if image[APP_OFFSET] != 0xE9:
        fail("no app image (0xE9) at 0x10000")
    magic, = struct.unpack_from("<I", image, APP_DESC_OFFSET)
    version_field = image[APP_DESC_OFFSET + 16:APP_DESC_OFFSET + 48].split(b"\0")[0].decode()
    project = image[APP_DESC_OFFSET + 48:APP_DESC_OFFSET + 80].split(b"\0")[0].decode()
    if magic != 0xABCD5432 or project != "dither" or version_field != version:
        fail(f"app descriptor says project {project!r} version {version_field!r}")
    table = {p[0]: p for p in partitions(image[PARTITIONS_OFFSET:PARTITIONS_OFFSET + 0xC00])}
    app = table.get("factory")
    data = table.get("dither")
    if not app or app[3] != APP_OFFSET:
        fail("no factory app partition at 0x10000")
    if not data or data[1] != 1 or (data[3], data[4]) != (DATA_PARTITION["offset"], DATA_PARTITION["size"]):
        fail("no 'dither' data partition at 0x300000, 1 MB")
    if len(image) - APP_OFFSET > app[4]:
        fail("app does not fit its partition")
    if len(image) > DATA_PARTITION["offset"]:
        fail("image reaches into the dither partition")


def update_manifest(path: str, env: str, entry: Dict) -> None:
    manifest = {"boards": {}}
    if os.path.exists(path):
        with open(path) as f:
            manifest = json.load(f)
    manifest.setdefault("boards", {})[env] = entry
    with open(path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--env", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--build-dir", help="default .pio/build/<env>")
    ap.add_argument("--out", required=True, help="directory for <env>.bin and manifest.json")
    args = ap.parse_args()

    build = args.build_dir or os.path.join(".pio", "build", args.env)
    image = bytearray()
    place(image, BOOTLOADER_OFFSET, read(os.path.join(build, "bootloader.bin")))
    place(image, PARTITIONS_OFFSET, read(os.path.join(build, "partitions.bin")))
    place(image, APP_OFFSET, read(os.path.join(build, "firmware.bin")))
    verify(bytes(image), args.version)

    os.makedirs("build", exist_ok=True)
    merged = os.path.join("build", f"{args.env}.bin")
    with open(merged, "wb") as f:
        f.write(image)
    os.makedirs(args.out, exist_ok=True)
    shutil.copyfile(merged, os.path.join(args.out, f"{args.env}.bin"))

    entry = {
        "file": f"{args.env}.bin",
        "version": args.version,
        "size": len(image),
        "sha256": hashlib.sha256(image).hexdigest(),
        "chip": CHIP,
        "dataPartition": DATA_PARTITION,
    }
    update_manifest(os.path.join(args.out, "manifest.json"), args.env, entry)
    print(f"{merged}: {len(image)} bytes, sha256 {entry['sha256']}")
    print(f"published to {args.out}/{args.env}.bin and manifest.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
