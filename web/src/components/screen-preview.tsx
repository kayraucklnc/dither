"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * A rendered e-ink screen, shown at whatever size the layout gives it.
 *
 * Previews are the most important object in this app, so they get real states:
 * a shimmer while the render happens, the reason when it cannot, and never a
 * broken-image icon. The aspect ratio is fixed up front so nothing reflows when
 * the picture lands.
 */
export function ScreenPreview({
  src,
  width,
  height,
  alt,
  className,
  fit = "contain",
  crisp = false,
  defer = false,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
  fit?: "contain" | "cover";
  /**
   * Show the dither as literal pixels. Right at roughly life size in the
   * editor; wrong on a thumbnail, where downscaling a 1-bit image with nearest
   * neighbour turns a careful dither into aliased noise. Smoothed, the same
   * image reads as the greys the panel actually produces.
   */
  crisp?: boolean;
  /**
   * Wait until the card is near the viewport before asking for the picture.
   *
   * A render is a page in a headless browser, so a catalogue that asks for
   * twenty at once is twenty pages competing and twenty shimmering cards. The
   * ones you are looking at should not be behind the ones you are not - and
   * scrolled to, they are already drawn, because the observer reaches four
   * hundred pixels past the edge of the screen.
   *
   * Off by default: the cost is only worth paying where there are many.
   */
  defer?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [reason, setReason] = useState<string>();
  const [wanted, setWanted] = useState(!defer);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wanted || !box.current) return;

    const observer = new IntersectionObserver(
      (entries) => entries.some((entry) => entry.isIntersecting) && setWanted(true),
      { rootMargin: "400px" },
    );

    observer.observe(box.current);
    return () => observer.disconnect();
  }, [wanted]);

  useEffect(() => {
    if (!wanted) return;

    setState("loading");
    setReason(undefined);

    let cancelled = false;
    const image = new Image();

    image.onload = () => !cancelled && setState("ready");
    image.onerror = async () => {
      if (cancelled) return;
      // The endpoint answers JSON on failure, so the card can say what is
      // actually wrong instead of showing a torn-image glyph.
      try {
        const response = await fetch(src);
        const body = await response.json();
        if (!cancelled) setReason(body?.error);
      } catch {
        /* leave the generic message */
      }
      if (!cancelled) setState("failed");
    };
    image.src = src;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [src, wanted]);

  return (
    <div
      ref={box}
      className={cn("relative overflow-hidden rounded-md bg-white", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {state === "loading" && <div className="loading-sheen absolute inset-0" />}

      {state === "failed" && (
        <div className="absolute inset-0 grid place-items-center bg-raised p-4">
          <p className="text-center text-xs leading-relaxed text-faint">
            {reason ?? "This design could not be rendered."}
          </p>
        </div>
      )}

      {state === "ready" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain")}
          style={{ imageRendering: crisp ? "pixelated" : "auto" }}
        />
      )}
    </div>
  );
}
