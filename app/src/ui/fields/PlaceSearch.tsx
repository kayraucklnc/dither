// Find a place by name (Open-Meteo's geocoder, no key), or ask the browser.

import { useEffect, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import type { Place } from "@/project/schema";
import { Button } from "../kit";

interface Hit {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export function PlaceSearch({ value, onChange, language = "en" }: { value: Place | null; onChange: (p: Place | null) => void; language?: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=${language}&name=${encodeURIComponent(query.trim())}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((j: { results?: Hit[] }) => {
          setHits(j.results ?? []);
          setError(j.results?.length ? null : "No place by that name.");
        })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) setError("Place search needs an internet connection.");
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query, language]);

  const locate = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ name: "Here", latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setError("The browser did not share your location. Search by name instead.");
      },
      { timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2">
          <MapPin size={16} className="text-accent" />
          <span className="font-medium">{value.name}</span>
          <span className="text-muted text-[12px]">
            {value.latitude.toFixed(2)}, {value.longitude.toFixed(2)}
          </span>
          <button type="button" className="ml-auto text-[13px] text-muted hover:text-ink" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      )}
      {!value && (
        <>
          <div className="flex gap-2">
            <input
              className="w-full h-9 rounded-md border border-line bg-raised px-2.5 placeholder:text-muted/70 focus:border-accent focus:outline-none"
              placeholder="Search for a city"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="City"
            />
            <Button onClick={locate} disabled={locating} icon={<LocateFixed size={15} />} className="whitespace-nowrap shrink-0">
              {locating ? "Finding you…" : "Use my location"}
            </Button>
          </div>
          {hits.length > 0 && (
            <ul className="rounded-md border border-line bg-raised divide-y divide-line overflow-hidden">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-accent-soft"
                    onClick={() => {
                      onChange({ name: h.name, latitude: h.latitude, longitude: h.longitude });
                      setQuery("");
                      setHits([]);
                    }}
                  >
                    <span className="font-medium">{h.name}</span>
                    <span className="text-muted"> {[h.admin1, h.country].filter(Boolean).join(", ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-[12px] text-muted">{error}</p>}
        </>
      )}
    </div>
  );
}
