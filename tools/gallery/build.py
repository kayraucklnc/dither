"""The gallery's pictures: public-domain prints from Wikimedia Commons, cut to
the panel (800 × 480) and levelled so the paper reads as white once dithered.

    uv run --with pillow==11.3.0 python tools/gallery/build.py

Writes app/public/gallery/<id>.jpg and app/src/extensions/gallery/collection.json.
"""

import io
import json
import pathlib
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "app/public/gallery"
INDEX = ROOT / "app/src/extensions/gallery/collection.json"
SIZE = (800, 480)
UA = {"User-Agent": "dither-gallery/1.0 (https://github.com/kayraucklnc/dither)"}


def fetch(file: str) -> tuple[Image.Image, str, str]:
    """A 1000-pixel-wide copy of a Commons file, its page and its licence."""
    query = urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": f"File:{file}",
        "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1000,
    })
    req = urllib.request.Request(f"https://commons.wikimedia.org/w/api.php?{query}", headers=UA)
    page = next(iter(json.load(urllib.request.urlopen(req))["query"]["pages"].values()))
    info = page["imageinfo"][0]
    licence = info["extmetadata"].get("LicenseShortName", {}).get("value", "")
    data = urllib.request.urlopen(urllib.request.Request(info["thumburl"], headers=UA)).read()
    return Image.open(io.BytesIO(data)).convert("L"), info["descriptionurl"], licence


def trim(im: Image.Image) -> Image.Image:
    """Cut the bare paper around a print: rows and columns with almost no ink."""
    ink = im.point(lambda v: 1 if v < 140 else 0)
    w, h = im.size
    cols = [x for x in range(w) if ink.crop((x, 0, x + 1, h)).histogram()[1] > h * 0.03]
    rows = [y for y in range(h) if ink.crop((0, y, w, y + 1)).histogram()[1] > w * 0.03]
    return im.crop((cols[0], rows[0], cols[-1] + 1, rows[-1] + 1)) if cols and rows else im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for pick in json.loads((pathlib.Path(__file__).parent / "picks.json").read_text()):
        im, page, licence = fetch(pick["file"])
        if licence not in ("Public domain", "CC0"):
            raise SystemExit(f"{pick['id']}: {licence!r} is not public domain")
        im = ImageOps.fit(trim(im), SIZE, Image.LANCZOS, centering=tuple(pick.get("focus", (0.5, 0.5))))
        im = ImageOps.autocontrast(im, cutoff=(1, 12))
        im.save(OUT / f"{pick['id']}.jpg", quality=78, optimize=True, progressive=True)
        index.append({k: pick[k] for k in ("id", "title", "artist", "year")} | {"source": page, "licence": licence})
        print(pick["id"], licence)
    INDEX.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
