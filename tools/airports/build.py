"""Airports for the aircraft widget's radar, from OurAirports (public domain).

    python3 tools/airports/build.py

Writes app/src/extensions/aircraft/airports.json: every large or medium
airport with scheduled flights and an IATA code, as [iata, lat, lon, large].
The radar labels them by code alone, so names stay behind. Coordinates to three decimals (about 100 m) keep it small.
"""

import csv
import io
import json
import pathlib
import urllib.request

SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OUT = pathlib.Path(__file__).resolve().parents[2] / "app/src/extensions/aircraft/airports.json"


def main() -> None:
    with urllib.request.urlopen(SOURCE, timeout=60) as r:
        rows = csv.DictReader(io.StringIO(r.read().decode("utf-8")))
        out = []
        for row in rows:
            if row["type"] not in ("large_airport", "medium_airport"):
                continue
            if row["scheduled_service"] != "yes" or not row["iata_code"].strip():
                continue
            out.append([
                row["iata_code"].strip(),
                round(float(row["latitude_deg"]), 3),
                round(float(row["longitude_deg"]), 3),
                1 if row["type"] == "large_airport" else 0,
            ])
    out.sort(key=lambda a: a[0])
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{OUT.name}: {len(out)} airports, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
