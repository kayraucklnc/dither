"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

export interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

/** Right-click menu. Closes on anything that is not choosing something. */
export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();

    window.addEventListener("mousedown", dismiss);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", onClose);

    return () => {
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Keep the menu on screen when opened near an edge.
  const left = Math.min(at.x, window.innerWidth - 248);
  const top = Math.min(at.y, window.innerHeight - (items.length * 34 + 16));

  return createPortal(
    <div
      ref={box}
      style={{ left, top }}
      className="fixed z-50 w-60 rounded-lg border border-line bg-raised p-1 shadow-[0_18px_40px_-12px_oklch(0_0_0/0.7)]"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
            item.disabled
              ? "cursor-not-allowed text-faint opacity-40"
              : item.danger
                ? "text-muted hover:bg-danger/15 hover:text-danger"
                : "text-muted hover:bg-surface hover:text-ink",
          )}
        >
          {item.icon && <item.icon size={14} className="shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]">{item.label}</span>
            {item.hint && <span className="block truncate text-[11px] text-faint">{item.hint}</span>}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
