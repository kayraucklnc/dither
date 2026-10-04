"""Contact sheet of the generated assets, decoded from the output files.

    uvx --with pillow python tools/preview.py [out.png]

Reads app/src/assets/fonts/*.dfnt and app/src/assets/icons/*.pack back through
an independent decoder (docs/format.md §3), checks their structure, and draws a
sheet of sample text and every icon. A wrong bit order, baseline or offset
shows up here rather than on the panel.
"""

from __future__ import annotations

import json
import struct
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "app" / "src" / "assets" / "fonts"
ICONS = ROOT / "app" / "src" / "assets" / "icons"
DEFAULT_OUT = Path(tempfile.gettempdir()) / "dither-assets-sheet.png"

SAMPLE = "Pijamalı hasta yağız şoföre çabucak güvendi. ĞğİıŞş 23°C 14:05 €"
SAMPLE_LARGE = "ĞğİıŞş 23°C 14:05 €"
FONT_SAMPLES = [  # (id, text, magnification)
    ("inter-400-12", SAMPLE, 3),
    ("inter-700-12", SAMPLE, 3),
    ("inter-400-16", SAMPLE, 2),
    ("inter-400-24", SAMPLE, 1),
    ("inter-700-24", SAMPLE + " ← ↑ → ↓ • … ≤ ≥ ▲ ▼ ● ○", 1),
    ("inter-400-48", "Wq ÀÉÎõü — €12,50 ±×÷", 1),
    ("inter-700-64", SAMPLE_LARGE, 1),
    ("inter-400-128", "14:05 Ğİş°", 1),
]
ICON_SAMPLES = [(16, 3), (24, 2), (64, 1)]  # (size, magnification)
PAD = 16
WIDTH = 2200


@dataclass(frozen=True)
class Glyph:
    width: int
    height: int
    x_offset: int
    y_offset: int
    advance: int
    rows: bytes


@dataclass(frozen=True)
class Font:
    line_height: int
    ascent: int
    descent: int
    glyphs: dict[int, Glyph]


def decode_font(blob: bytes) -> Font:
    magic, version, _, line_height, ascent, descent, count, _ = struct.unpack_from("<4sBBHhhHH", blob, 0)
    assert magic == b"DFNT" and version == 1, (magic, version)
    assert line_height == ascent + descent
    glyphs: dict[int, Glyph] = {}
    previous = -1
    expected = 16 + 20 * count
    for i in range(count):
        cp, offset, w, h, xo, yo, adv, reserved = struct.unpack_from("<IIHHhhHH", blob, 16 + 20 * i)
        assert cp > previous, f"table not sorted at U+{cp:04X}"
        assert reserved == 0
        size = h * ((w + 7) // 8)
        assert offset == expected, f"U+{cp:04X}: bitmap at {offset}, expected {expected}"
        assert offset + size <= len(blob)
        glyphs[cp] = Glyph(w, h, xo, yo, adv, blob[offset: offset + size])
        expected += size
        previous = cp
    assert expected == len(blob), "trailing bytes after the last bitmap"
    return Font(line_height, ascent, descent, glyphs)


def decode_bitmap(blob: bytes) -> tuple[int, int, int, bytes]:
    magic, width, height, kind = struct.unpack_from("<4sHHB", blob, 0)
    assert magic == b"DBMP", magic
    rows = blob[12:]
    assert len(rows) == height * ((width + 7) // 8), "bitmap length"
    return width, height, kind, rows


def blit(image: Image.Image, x0: int, y0: int, width: int, height: int, rows: bytes) -> None:
    stride = (width + 7) // 8
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            if rows[y * stride + (x >> 3)] & (0x80 >> (x & 7)):
                px, py = x0 + x, y0 + y
                if 0 <= px < image.width and 0 <= py < image.height:
                    pixels[px, py] = 0


def text_width(font: Font, text: str) -> int:
    return sum(resolve(font, ch).advance for ch in text)


def resolve(font: Font, ch: str) -> Glyph:
    return font.glyphs.get(ord(ch)) or font.glyphs[ord("?")]


def draw_text(image: Image.Image, font: Font, x: int, top: int, text: str) -> None:
    """Spec §4 text: baseline = top + ascent; glyph at (pen + xOff, baseline + yOff)."""
    baseline = top + font.ascent
    pen = x
    for ch in text:
        glyph = resolve(font, ch)
        blit(image, pen + glyph.x_offset, baseline + glyph.y_offset, glyph.width, glyph.height, glyph.rows)
        pen += glyph.advance


def magnify(image: Image.Image, factor: int) -> Image.Image:
    return image.resize((image.width * factor, image.height * factor), Image.NEAREST)


def font_row(font_id: str, text: str, factor: int) -> Image.Image:
    font = decode_font((FONTS / f"{font_id}.dfnt").read_bytes())
    width = text_width(font, text) + 4
    strip = Image.new("L", (width, font.line_height), 255)
    guide = ImageDraw.Draw(strip)
    guide.line([(0, font.ascent), (width, font.ascent)], fill=200)  # baseline
    draw_text(strip, font, 2, 0, text)
    return magnify(strip, factor)


def icon_row(size: int, factor: int, names: list[str], pack: dict) -> Image.Image:
    blob = (ICONS / pack["file"]).read_bytes()
    cell = size + 4
    strip = Image.new("L", (cell * len(names), cell), 255)
    guide = ImageDraw.Draw(strip)
    for i, name in enumerate(names):
        offset, length = pack["icons"][name]
        assert offset % 4 == 0, f"{name} not 4-byte aligned"
        width, height, kind, rows = decode_bitmap(blob[offset: offset + length])
        assert (width, height, kind) == (size, size, 0)
        guide.rectangle([i * cell + 1, 1, i * cell + size + 2, size + 2], outline=225)
        blit(strip, i * cell + 2, 2, width, height, rows)
    return magnify(strip, factor)


def label(text: str) -> Image.Image:
    strip = Image.new("L", (WIDTH, 14), 255)
    ImageDraw.Draw(strip).text((0, 0), text, fill=110)
    return strip


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    manifest = json.loads((ICONS / "icons.json").read_text())
    for entry in json.loads((FONTS / "fonts.json").read_text()):
        blob = (FONTS / entry["file"]).read_bytes()
        font = decode_font(blob)
        assert len(blob) == entry["bytes"] and len(font.glyphs) == entry["glyphs"], entry["id"]
        assert font.glyphs[0x20].width == 0 and font.glyphs[0x20].advance > 0

    blocks: list[Image.Image] = []
    for font_id, text, factor in FONT_SAMPLES:
        blocks += [label(f"{font_id}  x{factor}"), font_row(font_id, text, factor)]
    names = manifest["names"]
    half = (len(names) + 1) // 2
    for size, factor in ICON_SAMPLES:
        pack = manifest["packs"][str(size)]
        chunks = [names] if size * len(names) * factor < WIDTH else [names[:half], names[half:]]
        blocks.append(label(f"icons {size}px  x{factor}"))
        blocks += [icon_row(size, factor, chunk, pack) for chunk in chunks]

    height = sum(b.height + PAD // 2 for b in blocks) + PAD
    width = max(WIDTH, max(b.width for b in blocks) + 2 * PAD)
    sheet = Image.new("L", (width, height), 255)
    y = PAD
    for block in blocks:
        sheet.paste(block, (PAD, y))
        y += block.height + PAD // 2
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"{out}  {sheet.width}x{sheet.height}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
