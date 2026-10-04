// A compiled screen, drawn the way the panel will draw it.

import { useMemo } from "react";
import type { Compiled } from "@/compiler";
import { AssetStore, renderScreen } from "@/runtime/render";
import type { Value } from "@/runtime/types";
import { PanelCanvas } from "./PanelCanvas";

const stores = new WeakMap<Uint8Array, AssetStore>();

export function storeFor(c: Compiled): AssetStore {
  let s = stores.get(c.blob);
  if (!s) {
    s = new AssetStore(c.blob, c.runtime.assets);
    stores.set(c.blob, s);
  }
  return s;
}

export function ScreenPreview({ compiled, screen, values, now, className }: {
  compiled: Compiled | null; screen: number; values: ReadonlyMap<string, Value>; now: number; className?: string;
}) {
  const fb = useMemo(
    () => (compiled && compiled.runtime.screens[screen] ? renderScreen(compiled.runtime, storeFor(compiled), screen, values, now) : null),
    [compiled, screen, values, now],
  );
  return <PanelCanvas fb={fb} className={className} />;
}
